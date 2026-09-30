// Attainment Dashboard — D3-driven CQI evidence.
// CLO attainment% = AVG(assessment avg/max) per CLO+term.
// PO attainment% = AVG(linked CLO%) via clo_po_matrix.
// Heatmap color via d3.scaleThreshold: green>=70 yellow>=50 red<50 + gray no data.

import { useState, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import {
  fetchPrograms,
  fetchCourses,
  fetchCourseLearningOutcomes,
  fetchProgramOutcomes,
  fetchCloPoMatrix,
  fetchAssessmentsWithResults,
} from '../../services/database'

const colorScale = d3.scaleThreshold<number, string>()
  .domain([50, 70])
  .range(['#fca5a5', '#fde68a', '#86efac'])

function cellColor(v: number | null): string {
  if (v == null) return '#f1f5f9'
  return colorScale(v)
}

export default function Attainment() {
  const [programs, setPrograms] = useState<{ id: string; code: string }[]>([])
  const [courses, setCourses] = useState<{ id: string; code: string; program_id: unknown }[]>([])
  const [clos, setClos] = useState<{ id: string; code: string; course_id: string }[]>([])
  const [pos, setPos] = useState<{ id: string; code: string; program_id: string }[]>([])
  const [matrix, setMatrix] = useState<{ clo_id: unknown; po_id: unknown }[]>([])
  const [results, setResults] = useState<Awaited<ReturnType<typeof fetchAssessmentsWithResults>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [programId, setProgramId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [term, setTerm] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [progs, cs, allClos, allPos, mat, withResults] = await Promise.all([
          fetchPrograms(),
          fetchCourses(),
          fetchCourseLearningOutcomes(),
          fetchProgramOutcomes(),
          fetchCloPoMatrix(),
          fetchAssessmentsWithResults(),
        ])
        if (cancelled) return
        setPrograms(progs)
        setCourses(cs as never)
        setClos(allClos as never)
        setPos(allPos as never)
        setMatrix(mat as never)
        setResults(withResults)
      } catch (e) {
        if (!cancelled) setError('Unable to load attainment: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const relId = (v: unknown): string =>
    v && typeof v === 'object' && 'id' in (v as Record<string, unknown>)
      ? String((v as Record<string, unknown>).id)
      : String(v ?? '')

  const filteredCourses = useMemo(
    () => (programId ? courses.filter((c) => String((c.program_id as { id?: string })?.id ?? c.program_id) === programId) : courses),
    [courses, programId]
  )

  // CLO attainment: average of assessment attainment% for that CLO (+term filter)
  const cloPct = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const r of results) {
      if (courseId && r.course_id !== courseId) continue
      if (term && r.term !== term) continue
      if (r.attainment_pct == null) continue
      // assessments table stores clo_id; withResults keeps it
      const cloId = (r as unknown as { clo_id: string }).clo_id
      if (!cloId) continue
      if (!map.has(cloId)) map.set(cloId, [])
      map.get(cloId)!.push(r.attainment_pct)
    }
    const avg = new Map<string, number>()
    for (const [k, v] of map) avg.set(k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10)
    return avg
  }, [results, courseId, term])

  const visibleClos = useMemo(
    () => (courseId ? clos.filter((c) => c.course_id === courseId) : clos.slice(0, 12)),
    [clos, courseId]
  )
  const visiblePos = useMemo(() => {
    if (!programId) return pos.slice(0, 8)
    return pos.filter((p) => p.program_id === programId)
  }, [pos, programId])

  const linked = useMemo(() => {
    const set = new Set<string>()
    for (const m of matrix) set.add(`${relId(m.clo_id)}|${relId(m.po_id)}`)
    return set
  }, [matrix])

  // PO attainment: average of linked visible CLOs
  const poPct = useMemo(() => {
    const out = new Map<string, number | null>()
    for (const p of visiblePos) {
      const vals: number[] = []
      for (const c of visibleClos) {
        if (!linked.has(`${c.id}|${p.id}`) && linked.size > 0) continue
        const v = cloPct.get(c.id)
        if (v != null) vals.push(v)
      }
      out.set(p.id, vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null)
    }
    return out
  }, [visiblePos, visibleClos, linked, cloPct])

  const gaps = useMemo(() => {
    const rows: { label: string; pct: number }[] = []
    for (const c of visibleClos) {
      const v = cloPct.get(c.id)
      if (v != null && v < 70) rows.push({ label: `${c.code}`, pct: v })
    }
    for (const p of visiblePos) {
      const v = poPct.get(p.id)
      if (v != null && v < 70) rows.push({ label: `${p.code}`, pct: v })
    }
    return rows.sort((a, b) => a.pct - b.pct)
  }, [visibleClos, visiblePos, cloPct, poPct])

  // Term trend: Prelim -> Midterm -> Finals average across filtered assessments
  const trend = useMemo(() => {
    const terms = ['Prelim', 'Midterm', 'Finals']
    return terms.map((t) => {
      const vals = results
        .filter((r) => (!courseId || r.course_id === courseId) && r.term === t && r.attainment_pct != null)
        .map((r) => r.attainment_pct as number)
      return { term: t, pct: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null }
    })
  }, [results, courseId])

  const maxTrend = 100
  const trendPoints = trend
    .map((t, i) => (t.pct == null ? null : `${20 + i * 80},${90 - (t.pct / maxTrend) * 70}`))
    .filter(Boolean)
    .join(' ')

  return (
    <div className="programs-page">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">%</div>
          <div className="program-hero__titles">
            <h2>Attainment</h2>
            <p>D3 CQI evidence — CLO/PO %, gaps & term trend from faculty assessments.</p>
          </div>
        </div>
      </div>

      <div className="panel program-panel" style={{ borderTop: '3px solid #16a34a' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input input--sm" value={programId} onChange={(e) => { setProgramId(e.target.value); setCourseId('') }} aria-label="Program filter">
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
          <select className="input input--sm" value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course filter">
            <option value="">All courses</option>
            {filteredCourses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
          <select className="input input--sm" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term filter">
            <option value="">All terms</option>
            <option>Prelim</option>
            <option>Midterm</option>
            <option>Finals</option>
          </select>
        </div>
        <p style={{ fontSize: 12, color: '#64748b' }}>
          Legend: <span style={{ background: '#86efac', padding: '1px 8px', borderRadius: 999 }}>≥70</span>{' '}
          <span style={{ background: '#fde68a', padding: '1px 8px', borderRadius: 999 }}>50-69</span>{' '}
          <span style={{ background: '#fca5a5', padding: '1px 8px', borderRadius: 999 }}>&lt;50</span>{' '}
          <span style={{ background: '#f1f5f9', padding: '1px 8px', borderRadius: 999 }}>no data</span>
          {' '}· D3 scaleThreshold · benchmark 70%
        </p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {loading ? (
        <p>Loading attainment...</p>
      ) : visibleClos.length === 0 ? (
        <div className="program-empty"><strong>No CLOs for this filter.</strong><span>Ask faculty to add assessments first.</span></div>
      ) : (
        <>
          <div className="panel program-panel">
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>CLO × PO Heatmap</h3>
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>CLO \ PO</th>
                    {visiblePos.map((p) => <th key={p.id} style={{ padding: 6 }}>{p.code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleClos.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 6, fontWeight: 700 }}>{c.code}</td>
                      {visiblePos.map((p) => {
                        const v = cloPct.get(c.id) ?? null
                        return (
                          <td key={p.id} title={`${c.code} → ${p.code}: ${v ?? 'no data'}%`}
                            style={{ background: cellColor(v), padding: '8px 10px', textAlign: 'center', border: '2px solid #fff', borderRadius: 8, fontWeight: 700 }}>
                            {v ?? '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <div className="panel program-panel">
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>PO Attainment Bars</h3>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {visiblePos.map((p) => {
                  const v = poPct.get(p.id)
                  return (
                    <div key={p.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <strong>{p.code}</strong><span>{v ?? '—'}{v != null ? '%' : ''}</span>
                      </div>
                      <div style={{ height: 10, background: '#f1f5f9', borderRadius: 999, position: 'relative' }}>
                        <div style={{ width: `${v ?? 0}%`, height: '100%', borderRadius: 999, background: cellColor(v) }} />
                        <div style={{ position: 'absolute', left: '70%', top: -2, bottom: -2, width: 2, background: '#16a34a' }} title="70% benchmark" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="panel program-panel">
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Term Trend</h3>
              <svg viewBox="0 0 200 100" style={{ width: '100%', height: 140, marginTop: 8, background: '#fcfcfc', border: '1px solid #f1f5f9', borderRadius: 12 }}>
                <line x1="0" y1={90 - 0.7 * 70} x2="200" y2={90 - 0.7 * 70} stroke="#16a34a" strokeDasharray="4 3" />
                {trendPoints && <polyline points={trendPoints} fill="none" stroke="#15803d" strokeWidth="2.5" />}
                {trend.map((t, i) => t.pct != null && (
                  <circle key={t.term} cx={20 + i * 80} cy={90 - (t.pct / 100) * 70} r="4" fill={cellColor(t.pct)} stroke="#fff" />
                ))}
              </svg>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#475569' }}>
                {trend.map((t) => <span key={t.term}>{t.term}: <strong>{t.pct ?? '—'}{t.pct != null ? '%' : ''}</strong></span>)}
              </div>
              <h4 style={{ fontSize: 13, margin: '12px 0 6px' }}>Gaps below 70%</h4>
              {gaps.length === 0 ? (
                <p style={{ fontSize: 12, color: '#16a34a' }}>No gaps — all outcomes meet benchmark.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7f1d1d', display: 'grid', gap: 4 }}>
                  {gaps.map((g) => <li key={g.label}><strong>{g.label}</strong> — {g.pct}% needs CQI action</li>)}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

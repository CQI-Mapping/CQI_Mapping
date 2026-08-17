// Admin Analytics page: CQI monitoring charts derived from the curriculum
// domain (programs, courses, CLOs, POs, and the CLO/PO mapping matrix).
// D3.js bar and donut charts surface outcomes coverage and mapping strength.

import { useState, useEffect, useMemo } from 'react'
import {
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomes,
  fetchCourseLearningOutcomes,
  fetchCloPoMatrix,
} from '../../services/database'
import { BarChart, GroupedBarChart, DonutChart, LEVEL_COLORS } from './analytics/charts'

function round1(n) {
  return Math.round(n * 10) / 10
}

function Analytics() {
  const [programs, setPrograms] = useState([])
  const [courses, setCourses] = useState([])
  const [clos, setClos] = useState([])
  const [pos, setPos] = useState([])
  const [matrix, setMatrix] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [programId, setProgramId] = useState('')

  useEffect(() => {
    Promise.all([
      fetchPrograms(),
      fetchCourses(),
      fetchProgramOutcomes(),
      fetchCourseLearningOutcomes(),
      fetchCloPoMatrix(),
    ])
      .then(([p, c, po, clo, mx]) => {
        setPrograms(p)
        setCourses(c)
        setPos(po)
        setClos(clo)
        setMatrix(mx)
      })
      .catch((e) => setError('Unable to load analytics data: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  // Per-program derived metrics.
  const programMetrics = useMemo(
    () =>
      programs.map((program) => {
        const programCourses = courses.filter((c) => c.program_id?.id === program.id)
        const courseIds = new Set(programCourses.map((c) => c.id))
        const programClos = clos.filter((clo) => courseIds.has(clo.course_id))
        const programPos = pos.filter((p) => p.program_id === program.id)
        const rows = matrix.filter((m) => m.po_id?.program_id === program.id)
        const mappedCloIds = new Set(rows.map((r) => r.clo_id?.id))

        return {
          program,
          courseCount: programCourses.length,
          cloCount: programClos.length,
          poCount: programPos.length,
          mappedCloCount: mappedCloIds.size,
          cells: rows.length,
          poStats: programPos.map((p) => {
            const pRows = rows.filter((r) => r.po_id?.id === p.id)
            const levels = pRows.map((r) => r.level)
            return {
              po: p,
              count: levels.length,
              avg: levels.length ? round1(levels.reduce((a, b) => a + b, 0) / levels.length) : 0,
            }
          }),
        }
      }),
    [programs, courses, clos, pos, matrix]
  )

  const levelCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 }
    matrix.forEach((m) => {
      if (counts[m.level] !== undefined) counts[m.level] += 1
    })
    return counts
  }, [matrix])

  const totals = useMemo(() => {
    const allClos = new Set(clos.map((c) => c.id))
    const mappedClos = new Set(matrix.map((m) => m.clo_id?.id))
    return {
      programs: programs.length,
      courses: courses.length,
      clos: clos.length,
      pos: pos.length,
      cells: matrix.length,
      cloCoverage: allClos.size ? Math.round((mappedClos.size / allClos.size) * 100) : 0,
    }
  }, [programs, courses, clos, pos, matrix])

  const selected = programId
    ? programMetrics.find((m) => m.program.id === programId)
    : null

  if (loading) return <p className="page-pad">Loading analytics...</p>

  return (
    <div className="analytics">
      <div className="page-heading">
        <h2>Analytics</h2>
        <p>CQI monitoring: outcomes coverage and mapping strength across the curriculum.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Programs</span>
          <span className="stat-card__value">{totals.programs}</span>
          <span className="stat-card__sub">Active curricula in the system</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Courses</span>
          <span className="stat-card__value">{totals.courses}</span>
          <span className="stat-card__sub">Across all programs</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Learning outcomes</span>
          <span className="stat-card__value">{totals.pos + totals.clos}</span>
          <span className="stat-card__sub">{totals.pos} program · {totals.clos} course</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">CLO coverage</span>
          <span className="stat-card__value">{totals.cloCoverage}%</span>
          <span className="stat-card__sub">CLOs with ≥1 PO mapping</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Mapping cells</span>
          <span className="stat-card__value">{totals.cells}</span>
          <span className="stat-card__sub">CLO/PO pairs in the matrix</span>
        </div>
      </div>

      <div className="sub-filter">
        <label>
          Focus program
          <select
            className="input input--sm"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <h3>PO coverage by CLOs</h3>
          <p className="panel__hint">
            {selected ? `${selected.program.code} — how many course learning outcomes map to each program outcome.` : 'Select a program to see per-PO CLO coverage.'}
          </p>
          {selected ? (
            <BarChart
              data={selected.poStats.map((s) => ({ label: s.po.code, value: s.count }))}
              color="#16a34a"
            />
          ) : (
            <p className="panel__hint">—</p>
          )}
        </div>

        <div className="panel">
          <h3>Average mapping strength per PO</h3>
          <p className="panel__hint">
            {selected ? `${selected.program.code} — mean strength level (1–3) across mapped CLOs.` : 'Select a program to see per-PO average strength.'}
          </p>
          {selected ? (
            <BarChart
              data={selected.poStats.map((s) => ({ label: s.po.code, value: s.avg }))}
              valueSuffix=""
              color="#0ea5e9"
            />
          ) : (
            <p className="panel__hint">—</p>
          )}
        </div>

        <div className="panel">
          <h3>Program comparison</h3>
          <p className="panel__hint">Course learning outcomes per program vs. those with at least one mapping.</p>
          <GroupedBarChart
            data={programMetrics.map((m) => ({
              group: m.program.code,
              series: [
                { key: 'Total CLOs', value: m.cloCount, color: '#cbd5e1' },
                { key: 'Mapped CLOs', value: m.mappedCloCount, color: '#16a34a' },
              ],
            }))}
          />
          <div className="chart-legend">
            <span><i style={{ background: '#cbd5e1' }} /> Total CLOs</span>
            <span><i style={{ background: '#16a34a' }} /> Mapped CLOs</span>
          </div>
        </div>

        <div className="panel">
          <h3>Mapping level distribution</h3>
          <p className="panel__hint">Share of 1 (low), 2 (medium), and 3 (high) strength cells in the matrix.</p>
          <div className="donut-wrap">
            <DonutChart
              data={[1, 2, 3].map((l) => ({ label: String(l), value: levelCounts[l], color: LEVEL_COLORS[l] }))}
            />
          </div>
          <div className="chart-legend">
            {[1, 2, 3].map((l) => (
              <span key={l}><i style={{ background: LEVEL_COLORS[l] }} /> Level {l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Analytics

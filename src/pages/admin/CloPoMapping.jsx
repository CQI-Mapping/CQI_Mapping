// Admin CLO/PO Mapping page: matrix editor + D3.js heatmap.
// Rows are the selected course's course learning outcomes (CLO); columns are
// the program's program outcomes (PO). Each cell holds a strength level
// (1 = low, 2 = medium, 3 = high; blank = not mapped). Click a cell to cycle:
// blank → 1 → 2 → 3 → blank. Every change writes an audit entry.

import { useState, useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import {
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomes,
  fetchCourseLearningOutcomes,
  fetchCloPoMatrix,
  upsertCloPoMapping,
  deleteCloPoMapping,
  addAuditLog,
} from '../../services/database'

// Color per strength level (matches the CSS classes).
const LEVEL_COLORS = { 1: '#fde68a', 2: '#f59e0b', 3: '#ea580c' }
const NEXT_LEVEL = { '': 1, 1: 2, 2: 3, 3: '' }

function CloPoHeatmap({ clos, pos, levels }) {
  const ref = useRef(null)

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    if (!clos.length || !pos.length) return

    const cell = 44
    const margin = { top: 28, right: 12, bottom: 40, left: 64 }
    const width = margin.left + pos.length * cell + margin.right
    const height = margin.top + clos.length * cell + margin.bottom

    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const x = d3
      .scaleBand()
      .domain(pos.map((p) => p.code))
      .range([margin.left, width - margin.right])
      .padding(0.08)

    const y = d3
      .scaleBand()
      .domain(clos.map((c) => c.code))
      .range([margin.top, height - margin.bottom])
      .padding(0.08)

    const cells = clos.flatMap((c) => pos.map((p) => ({ c, p })))

    svg
      .append('g')
      .attr('transform', `translate(0,${margin.top - 10})`)
      .call(d3.axisTop(x))
      .attr('font-size', 11)

    svg
      .append('g')
      .attr('transform', `translate(${margin.left - 10},0)`)
      .call(d3.axisLeft(y))
      .attr('font-size', 11)

    svg
      .selectAll('rect')
      .data(cells)
      .join('rect')
      .attr('x', (d) => x(d.p.code))
      .attr('y', (d) => y(d.c.code))
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', (d) => {
        const l = levels[`${d.c.id}:${d.p.id}`]
        return l ? LEVEL_COLORS[l] : '#f1f5f9'
      })
      .attr('stroke', '#e2e8f0')

    svg
      .selectAll('text.cell-label')
      .data(cells)
      .join('text')
      .attr('class', 'cell-label')
      .attr('x', (d) => x(d.p.code) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.c.code) + y.bandwidth() / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .attr('fill', '#1e293b')
      .text((d) => levels[`${d.c.id}:${d.p.id}`] || '')

    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#64748b')
      .text('Program outcomes (PO)')
  }, [clos, pos, levels])

  return <svg ref={ref} className="heatmap-svg" />
}

function CloPoMapping({ userEmail }) {
  const [programs, setPrograms] = useState([])
  const [courses, setCourses] = useState([])
  const [programId, setProgramId] = useState('')
  const [courseId, setCourseId] = useState('')

  const [pos, setPos] = useState([])
  const [clos, setClos] = useState([])
  const [matrix, setMatrix] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingKey, setSavingKey] = useState('')

  useEffect(() => {
    fetchPrograms().then(setPrograms).catch(() => setPrograms([]))
    fetchCourses()
      .then((c) => setCourses(c))
      .catch(() => setCourses([]))
  }, [])

  // Programs → courses filter for the second dropdown.
  const programCourses = programId ? courses.filter((c) => c.program_id?.id === programId) : []

  // Load POs for the program and (once a course is chosen) its CLOs + matrix.
  useEffect(() => {
    setPos([])
    setMatrix([])
    if (!programId) return
    fetchProgramOutcomes(programId)
      .then(setPos)
      .catch((e) => setError('Unable to load program outcomes: ' + e.message))
  }, [programId])

  useEffect(() => {
    setClos([])
    setMatrix([])
    if (!courseId) return
    setLoading(true)
    setError('')
    Promise.all([fetchCourseLearningOutcomes(courseId), fetchCloPoMatrix(courseId)])
      .then(([closRes, matrixRes]) => {
        setClos(closRes)
        setMatrix(matrixRes)
      })
      .catch((e) => setError('Unable to load course mapping: ' + e.message))
      .finally(() => setLoading(false))
  }, [courseId])

  // Map keyed by "cloId:poId" for quick cell lookup.
  const levels = useMemo(() => {
    const map = {}
    matrix.forEach((m) => {
      const cloId = m.clo_id?.id
      const poId = m.po_id?.id
      if (cloId && poId) map[`${cloId}:${poId}`] = m.level
    })
    return map
  }, [matrix])

  // Click a cell: blank → 1 → 2 → 3 → blank, persisting each change.
  const cycleCell = async (clo, po) => {
    if (savingKey || loading) return
    const key = `${clo.id}:${po.id}`
    const next = NEXT_LEVEL[levels[key] || '']
    setSavingKey(key)
    setError('')
    setMessage('')
    try {
      if (next === '') {
        await deleteCloPoMapping(clo.id, po.id)
        await addAuditLog(userEmail, 'clo_po_mapping.cleared', {
          course: clo.course_id,
          clo: clo.code,
          po: po.code,
        })
      } else {
        await upsertCloPoMapping(clo.id, po.id, next)
        await addAuditLog(userEmail, 'clo_po_mapping.set', {
          course: clo.course_id,
          clo: clo.code,
          po: po.code,
          level: next,
        })
      }
      const fresh = await fetchCloPoMatrix(courseId)
      setMatrix(fresh)
    } catch (e) {
      setError('Failed to update mapping: ' + e.message)
    } finally {
      setSavingKey('')
    }
  }

  return (
    <div className="clo-po-mapping">
      <div className="page-heading">
        <h2>CLO/PO Mapping</h2>
        <p>Set how each course learning outcome contributes to the program outcomes.</p>
      </div>

      <div className="sub-filter">
        <label>
          Program
          <select
            className="input input--sm"
            value={programId}
            onChange={(e) => { setProgramId(e.target.value); setCourseId('') }}
          >
            <option value="">Select a program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </label>

        <label>
          Course
          <select
            className="input input--sm"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={!programId}
          >
            <option value="">Select a course</option>
            {programCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      {!courseId ? (
        <div className="panel">
          <p className="panel__hint">Select a program, then a course, to edit its CLO/PO mapping matrix.</p>
        </div>
      ) : loading ? (
        <p>Loading mapping matrix...</p>
      ) : clos.length === 0 ? (
        <div className="panel">
          <p className="panel__hint">This course has no course learning outcomes yet — add some under Curriculum → Course Learning Outcomes.</p>
        </div>
      ) : pos.length === 0 ? (
        <div className="panel">
          <p className="panel__hint">This program has no program outcomes yet — add some under Curriculum → Program Outcomes.</p>
        </div>
      ) : (
        <>
          <div className="panel matrix-panel">
            <h3>Mapping matrix</h3>
            <p className="panel__hint">
              Click a cell to cycle the strength: blank → 1 (low) → 2 (medium) → 3 (high) → blank.
            </p>
            <div className="table-wrap">
              <table className="table matrix-table">
                <thead>
                  <tr>
                    <th className="matrix-corner">CLO \ PO</th>
                    {pos.map((p) => (
                      <th key={p.id} className="matrix-po-head" title={p.description}>{p.code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clos.map((c) => (
                    <tr key={c.id}>
                      <td className="matrix-clo-head">
                        <strong>{c.code}</strong>
                        <div className="matrix-clo-desc">{c.description}</div>
                      </td>
                      {pos.map((p) => {
                        const key = `${c.id}:${p.id}`
                        const level = levels[key]
                        const busy = savingKey === key
                        return (
                          <td key={p.id} className="matrix-cell-td">
                            <button
                              className={`matrix-cell ${level ? `matrix-cell--${level}` : 'matrix-cell--empty'}`}
                              onClick={() => cycleCell(c, p)}
                              disabled={!!savingKey}
                              title={level ? `${c.code} → ${p.code}: level ${level}` : `${c.code} → ${p.code}: not mapped`}
                            >
                              {busy ? '…' : level || ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="matrix-legend">
              <span className="legend-item"><span className="matrix-cell matrix-cell--1 legend-swatch">1</span> Low</span>
              <span className="legend-item"><span className="matrix-cell matrix-cell--2 legend-swatch">2</span> Medium</span>
              <span className="legend-item"><span className="matrix-cell matrix-cell--3 legend-swatch">3</span> High</span>
              <span className="legend-item"><span className="matrix-cell matrix-cell--empty legend-swatch" /> Not mapped</span>
            </div>
          </div>

          <div className="panel heatmap-panel">
            <h3>Heatmap</h3>
            <CloPoHeatmap clos={clos} pos={pos} levels={levels} />
          </div>
        </>
      )}
    </div>
  )
}

export default CloPoMapping

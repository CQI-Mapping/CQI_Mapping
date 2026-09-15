// Admin Subject View: browse courses grouped by program and curriculum.

import { useState, useEffect } from 'react'
import { fetchPrograms, fetchResources, fetchCourses } from '../../services/database'
import type { Program, Resource, Course } from '../../services/database'

export default function SubjectView() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [curriculums, setCurriculums] = useState<Resource[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [selectedCurriculumId, setSelectedCurriculumId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, res, c] = await Promise.all([fetchPrograms(), fetchResources(), fetchCourses()])
        if (!cancelled) {
          setPrograms(p)
          setCurriculums(res.filter((r) => r.status !== 'archived' && (r.code || r.title)))
          setCourses(c.filter((co) => !co.status || co.status === 'active'))
          if (p.length > 0 && !selectedProgramId) setSelectedProgramId(p[0].id)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load subjects.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filteredCourses = courses.filter((c) => {
    const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
    if (pid !== selectedProgramId) return false
    if (selectedCurriculumId) {
      const cid = c.curriculum_id && typeof c.curriculum_id === 'object' ? c.curriculum_id.id : c.curriculum_id
      return cid === selectedCurriculumId
    }
    return true
  })

  const programCurriculums = curriculums.filter((r) =>
    courses.some((c) => {
      const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
      const cid = c.curriculum_id && typeof c.curriculum_id === 'object' ? c.curriculum_id.id : c.curriculum_id
      return pid === selectedProgramId && cid === r.id
    }),
  )

  const curriculumLabel = (id: string | { id: string } | null) => {
    if (!id) return '—'
    const cid = typeof id === 'object' ? id.id : id
    const r = curriculums.find((x) => x.id === cid)
    return r ? (r.code || r.title) : '—'
  }

  if (loading) return <p>Loading subjects...</p>

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}

      <div className="panel">
        <h3>Subject View</h3>
        <div className="create-resource__row">
          <label className="field">
            <span>Program</span>
            <select className="input input--sm" value={selectedProgramId}
              onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedCurriculumId('') }}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.code}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Curriculum</span>
            <select className="input input--sm" value={selectedCurriculumId}
              onChange={(e) => setSelectedCurriculumId(e.target.value)}>
              <option value="">All Curricula</option>
              {programCurriculums.map((r) => (
                <option key={r.id} value={r.id}>{r.code || r.title}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Course Code</th>
              <th>Title</th>
              <th>Curriculum</th>
              <th>Pre-req</th>
              <th>Co-req</th>
              <th>Credits (Lec / Lab / Total)</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {filteredCourses.length === 0 && (
              <tr><td colSpan={7}>No subjects found.</td></tr>
            )}
            {filteredCourses.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.code}</strong></td>
                <td>{c.title}</td>
                <td>{curriculumLabel(c.curriculum_id)}</td>
                <td>{c.prerequisite || 'N/A'}</td>
                <td>{c.corequisite || 'N/A'}</td>
                <td>{c.credit_lecture ?? 0} / {c.credit_laboratory ?? 0} / {c.units ?? 0}</td>
                <td>{c.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

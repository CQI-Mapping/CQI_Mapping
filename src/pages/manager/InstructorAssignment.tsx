// Manager Instructor Assignment page: assign/unassign courses (subjects) to faculty.
// Managers can assign multiple courses to a single instructor. Uses the existing
// assignCourseInstructor service function — RLS enforces manager/admin-only updates.

import { useState, useEffect, useCallback } from 'react'
import Icon from '../../components/icons'
import {
  fetchAllProfiles,
  fetchCourses,
  assignCourseInstructor,
} from '../../services/database'
import type { Profile, Course } from '../../services/database'

function InstructorAssignment() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [p, c] = await Promise.all([
        fetchAllProfiles(),
        fetchCourses(),
      ])
      setProfiles(p)
      setCourses(c)
    } catch (e) {
      setError('Unable to load data: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const faculty = profiles.filter((p) => p.role === 'user')
  const selectedInstructor = profiles.find((p) => p.id === selectedInstructorId) ?? null

  const assignedCourses = selectedInstructorId
    ? courses.filter((c) => {
        const iid = typeof c.instructor_id === 'object' ? c.instructor_id?.id : c.instructor_id
        return iid === selectedInstructorId
      })
    : []

  const unassignedCourses = selectedInstructorId
    ? courses.filter((c) => {
        const iid = typeof c.instructor_id === 'object' ? c.instructor_id?.id : c.instructor_id
        return !iid
      })
    : []

  const handleAssign = async (courseId: string) => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await assignCourseInstructor(courseId, selectedInstructorId)
      setSuccess('Subject assigned successfully.')
      await load()
    } catch (e) {
      setError('Failed to assign: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleUnassign = async (courseId: string) => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await assignCourseInstructor(courseId, null)
      setSuccess('Subject unassigned successfully.')
      await load()
    } catch (e) {
      setError('Failed to unassign: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading...</p>

  return (
    <div className="instructor-assignment">
      <div className="page-heading">
        <h2>Instructor Assignment</h2>
        <p>Assign subjects (courses) to faculty members. Each instructor can have multiple subjects.</p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {success && <p className="msg msg--success" role="status">{success}</p>}

      {/* Instructor selector */}
      <div className="panel" style={{ borderTop: '3px solid #16a34a' }}>
        <h3>Select Instructor</h3>
        <label className="field">
          <span>Faculty member</span>
          <select
            className="input"
            value={selectedInstructorId}
            onChange={(e) => {
              setSelectedInstructorId(e.target.value)
              setError('')
              setSuccess('')
            }}
          >
            <option value="">— Choose a faculty member —</option>
            {faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name || f.email} ({f.email})
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedInstructor && (
        <>
          {/* Currently assigned subjects */}
          <div className="panel table-wrap" style={{ marginTop: 16 }}>
            <h3>
              Assigned Subjects
              {selectedInstructor && (
                <span style={{ fontWeight: 400, fontSize: 14, color: '#64748b' }}>
                  {' '}— {selectedInstructor.full_name || selectedInstructor.email}
                </span>
              )}
            </h3>
            {assignedCourses.length === 0 ? (
              <p style={{ color: '#64748b' }}>No subjects assigned yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Units</th>
                    <th>Program</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {assignedCourses.map((c) => {
                    const prog = typeof c.program_id === 'object' ? c.program_id : null
                    return (
                      <tr key={c.id}>
                        <td>{c.code}</td>
                        <td>{c.title}</td>
                        <td>{c.units}</td>
                        <td>{prog ? prog.code : '—'}</td>
                        <td>
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleUnassign(c.id)}
                            disabled={saving}
                            title="Unassign this subject"
                          >
                            <Icon name="x" size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Available subjects to assign */}
          <div className="panel table-wrap" style={{ marginTop: 16 }}>
            <h3>Available Subjects</h3>
            {unassignedCourses.length === 0 ? (
              <p style={{ color: '#64748b' }}>No unassigned subjects available.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Units</th>
                    <th>Program</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedCourses.map((c) => {
                    const prog = typeof c.program_id === 'object' ? c.program_id : null
                    return (
                      <tr key={c.id}>
                        <td>{c.code}</td>
                        <td>{c.title}</td>
                        <td>{c.units}</td>
                        <td>{prog ? prog.code : '—'}</td>
                        <td>
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handleAssign(c.id)}
                            disabled={saving}
                            title="Assign this subject"
                          >
                            <Icon name="plus" size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!selectedInstructor && (
        <div className="panel" style={{ marginTop: 16, textAlign: 'center', color: '#64748b' }}>
          <p>Select a faculty member above to manage their subject assignments.</p>
        </div>
      )}
    </div>
  )
}

export default InstructorAssignment

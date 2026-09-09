// Admin Course page: manages courses linked to a program. Pick a program from
// the dropdown, then create / edit / delete the courses inside it.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchPrograms,
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  addActivityLog,
} from '../../services/database'
import type { Program, Course } from '../../services/database'

interface CourseProps {
  profile?: { email?: string | null } | null
}

const blank = { code: '', title: '', units: '3' }

export default function Course({ profile }: CourseProps) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [programId, setProgramId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(blank)

  const userEmail = profile?.email ?? 'unknown'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [p, c] = await Promise.all([fetchPrograms(), fetchCourses()])
      setPrograms(p)
      setCourses(c)
      setProgramId((prev) => {
        if (prev && p.some((x) => x.id === prev)) return prev
        return p[0]?.id ?? ''
      })
    } catch (e) {
      setError('Unable to load courses: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = courses.filter((c) =>
    typeof c.program_id === 'object' ? c.program_id.id === programId : c.program_id === programId,
  )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!programId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await createCourse({
        program_id: programId,
        code: form.code.trim(),
        title: form.title.trim(),
        units: parseInt(form.units, 10) || undefined,
      })
      await addActivityLog(userEmail, 'course.created')
      setMessage('Course created.')
      setForm(blank)
      load()
    } catch (err) {
      setError('Failed to create course: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (item: Course) => {
    setEditId(item.id)
    setEditForm({ code: item.code, title: item.title, units: String(item.units) })
  }

  const saveEdit = async () => {
    if (!editId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await updateCourse(editId, {
        code: editForm.code.trim(),
        title: editForm.title.trim(),
        units: parseInt(editForm.units, 10) || undefined,
      })
      await addActivityLog(userEmail, 'course.updated')
      setMessage('Course updated.')
      setEditId(null)
      load()
    } catch (err) {
      setError('Failed to update course: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course permanently?')) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await deleteCourse(id)
      await addActivityLog(userEmail, 'course.deleted')
      setMessage('Course deleted.')
      load()
    } catch (err) {
      setError('Failed to delete course: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}
      {loading ? (
        <p>Loading courses...</p>
      ) : (
        <>
          <form className="panel create-resource" onSubmit={handleCreate}>
            <h3>New Course</h3>
            <div className="create-resource__row">
              <label className="field">
                <span>Program</span>
                <select className="input input--sm" value={programId} onChange={(e) => setProgramId(e.target.value)} required>
                  {programs.length === 0 && <option value="">No programs yet</option>}
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.code}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Code</span>
                <input className="input input--sm" type="text" placeholder="e.g. IT21"
                  value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </label>
              <label className="field">
                <span>Title</span>
                <input className="input input--sm" type="text" placeholder="Course title"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </label>
              <label className="field field--sm">
                <span>Units</span>
                <input className="input input--sm" type="number" min={1} max={20}
                  value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} required />
              </label>
            </div>
            <div className="create-resource__submit">
              <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Add'}</button>
            </div>
          </form>

          <div className="panel table-wrap">
            <table className="table">
              <thead>
                <tr><th>Course</th><th>Title</th><th>Units</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={4}>No courses in this program yet.</td></tr>
                )}
                {visible.map((c) => (
                  <tr key={c.id}>
                    {editId === c.id ? (
                      <>
                        <td><input className="input input--sm" value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></td>
                        <td><input className="input input--sm" value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></td>
                        <td><input className="input input--sm" type="number" min={1} max={20} value={editForm.units}
                          onChange={(e) => setEditForm({ ...editForm, units: e.target.value })} /></td>
                        <td>
                          <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                          <button className="btn btn--ghost btn--sm" onClick={() => setEditId(null)} disabled={busy}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><strong>{c.code}</strong></td>
                        <td>{c.title}</td>
                        <td>{c.units}</td>
                        <td>
                          <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)} disabled={busy || !!editId}>Edit</button>{' '}
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(c.id)} disabled={busy || !!editId}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
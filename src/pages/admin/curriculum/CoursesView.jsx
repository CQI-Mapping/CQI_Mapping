// Admin Curriculum — Courses sub-view: CRUD for courses under each program.

import { useState, useEffect } from 'react'
import { useEntityCrud } from './useEntityCrud.js'
import {
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  fetchPrograms,
} from '../../../services/database'

const EMPTY_FORM = { program_id: '', code: '', title: '', units: 3 }

function CoursesView({ userEmail }) {
  const crud = useEntityCrud({
    loadFn: fetchCourses,
    createFn: createCourse,
    updateFn: updateCourse,
    deleteFn: deleteCourse,
    userEmail,
    scope: 'Course',
  })
  const { items, loading, error, message, busy, setError, handleCreate, handleUpdate, handleDelete } = crud

  const [programs, setPrograms] = useState([])
  const [programFilter, setProgramFilter] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  // Load programs for the dropdowns, and the course list.
  useEffect(() => {
    fetchPrograms().then(setPrograms).catch(() => setPrograms([]))
    crud.load()
  }, [crud.load])

  const filtered = programFilter ? items.filter((c) => c.program_id?.id === programFilter) : items

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!form.program_id) {
      setError('Select a program first.')
      return
    }
    const ok = await handleCreate(
      { program_id: form.program_id, code: form.code.trim(), title: form.title.trim(), units: Number(form.units) },
      'course.created',
      { code: form.code.trim() }
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditForm({
      program_id: item.program_id?.id || '',
      code: item.code,
      title: item.title,
      units: item.units,
    })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { program_id: editForm.program_id, code: editForm.code.trim(), title: editForm.title.trim(), units: Number(editForm.units) },
      'course.updated',
      { id: editingId, code: editForm.code.trim() }
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New course</h3>
        <div className="create-resource__row">
          <select
            className="input input--sm"
            value={form.program_id}
            onChange={(e) => setForm({ ...form, program_id: e.target.value })}
            required
          >
            <option value="">Select program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <input
            className="input input--sm"
            type="text"
            placeholder="Code (e.g. IT101)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <input
            className="input input--sm"
            type="text"
            placeholder="Course title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <input
            className="input input--sm"
            type="number"
            min="1"
            placeholder="Units"
            value={form.units}
            onChange={(e) => setForm({ ...form, units: e.target.value })}
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      <div className="sub-filter">
        <label>
          Filter by program
          <select
            className="input input--sm"
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading courses...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Program</th>
                <th>Units</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="5">No courses yet.</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td>
                        <input
                          className="input input--sm"
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input input--sm"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="input input--sm"
                          value={editForm.program_id}
                          onChange={(e) => setEditForm({ ...editForm, program_id: e.target.value })}
                        >
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>{p.code}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input input--sm"
                          type="number"
                          min="1"
                          value={editForm.units}
                          onChange={(e) => setEditForm({ ...editForm, units: e.target.value })}
                        />
                      </td>
                      <td>
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{item.code}</strong></td>
                      <td>{item.title}</td>
                      <td>{item.program_id?.code || '—'}</td>
                      <td>{item.units}</td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'course.deleted', { id: item.id, code: item.code })}>Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default CoursesView

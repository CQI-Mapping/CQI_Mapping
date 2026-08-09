// Admin Curriculum — Course Learning Outcomes (CLO) sub-view: CRUD for the
// course learning outcomes of the selected course.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './useEntityCrud.js'
import {
  fetchCourseLearningOutcomes,
  createCourseLearningOutcome,
  updateCourseLearningOutcome,
  deleteCourseLearningOutcome,
  fetchPrograms,
  fetchCourses,
} from '../../../services/database'

const EMPTY_FORM = { code: '', description: '' }

function CloView({ userEmail }) {
  const [programs, setPrograms] = useState([])
  const [courses, setCourses] = useState([])
  const [programId, setProgramId] = useState('')
  const [courseId, setCourseId] = useState('')

  const loadFn = useCallback(
    () => fetchCourseLearningOutcomes(courseId || null),
    [courseId]
  )

  const crud = useEntityCrud({
    loadFn,
    createFn: createCourseLearningOutcome,
    updateFn: updateCourseLearningOutcome,
    deleteFn: deleteCourseLearningOutcome,
    userEmail,
    scope: 'Course learning outcome',
  })
  const { items, loading, error, message, busy, load, handleCreate, handleUpdate, handleDelete } = crud

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  // Load all programs (for the first dropdown) and all courses once.
  useEffect(() => {
    fetchPrograms().then(setPrograms).catch(() => setPrograms([]))
    fetchCourses()
      .then((c) => setCourses(c))
      .catch(() => setCourses([]))
  }, [])

  // Reload whenever the selected course changes (and on mount).
  useEffect(() => { load() }, [load])

  // Courses belonging to the selected program, for the second dropdown.
  const programCourses = programId
    ? courses.filter((c) => c.program_id?.id === programId)
    : []

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!courseId) {
      crud.setError('Select a course first.')
      return
    }
    const ok = await handleCreate(
      { course_id: courseId, code: form.code.trim(), description: form.description.trim() },
      'course_learning_outcome.created',
      { courseId, code: form.code.trim() }
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, description: item.description })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), description: editForm.description.trim() },
      'course_learning_outcome.updated',
      { id: editingId, code: editForm.code.trim() }
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      <div className="sub-filter">
        <label>
          Program
          <select
            className="input input--sm"
            value={programId}
            onChange={(e) => { setProgramId(e.target.value); setCourseId(''); setEditingId(null) }}
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
            onChange={(e) => { setCourseId(e.target.value); setEditingId(null) }}
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

      {courseId && (
        <form className="panel create-resource" onSubmit={onSubmit}>
          <h3>New course learning outcome</h3>
          <div className="create-resource__row">
            <input
              className="input input--sm"
              type="text"
              placeholder="Code (e.g. CLO1)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
            <input
              className="input input--sm"
              type="text"
              placeholder="Outcome description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {!courseId ? (
        <p className="msg msg--info">Select a program, then a course, to manage its course learning outcomes.</p>
      ) : loading ? (
        <p>Loading course learning outcomes...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan="3">No course learning outcomes yet for this course.</td></tr>
              )}
              {items.map((item) => (
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
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
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
                      <td>{item.description}</td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'course_learning_outcome.deleted', { id: item.id, code: item.code })}>Delete</button>
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

export default CloView

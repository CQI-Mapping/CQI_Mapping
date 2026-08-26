// Admin Strategic Goals: CRUD for institutional strategic goal records.
// Provides add, edit, and delete functionality for strategic goals
// managed by the admin role. Uses the useEntityCrud hook for shared state.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchStrategicGoals,
  createStrategicGoal,
  updateStrategicGoal,
  deleteStrategicGoal,
} from '../../services/database'
import type { StrategicGoal } from '../../services/database'

const EMPTY_FORM = { code: '', title: '', description: '' }

// Default strategic goals from the VCQI syllabus document.
const DEFAULTS = [
  { code: 'SG-1', title: 'Excellence in Teaching and Learning', description: null },
  { code: 'SG-2', title: 'Outstanding Human Resource Development', description: null },
  { code: 'SG-3', title: 'High Impact Research', description: null },
  { code: 'SG-4', title: 'Exemplary Service to the Profession and Community Engagement', description: null },
  { code: 'SG-5', title: '21st Century Infrastructure and Operational Sustainability', description: null },
]

interface StrategicGoalsProps {
  userEmail: string
}

function StrategicGoals({ userEmail }: StrategicGoalsProps) {
  const crud = useEntityCrud<StrategicGoal>({
    loadFn: fetchStrategicGoals,
    createFn: createStrategicGoal,
    updateFn: updateStrategicGoal,
    deleteFn: deleteStrategicGoal,
    userEmail,
    scope: 'Strategic Goal',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [seeded, setSeeded] = useState(false)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { crud.load() }, [crud.load])

  // Fill in any VCQI syllabus strategic goals missing from the table
  // (idempotent by code). Runs once after the first load completes.
  useEffect(() => {
    if (loading || seeded) return
    setSeeded(true)
    const existing = new Set(items.map((i) => i.code))
    const missing = DEFAULTS.filter((g) => !existing.has(g.code))
    if (missing.length === 0) return
    missing.reduce<Promise<unknown>>((prev, goal) => prev.then(() => createStrategicGoal(goal)), Promise.resolve())
      .then(() => crud.load())
  }, [loading, seeded])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await handleCreate(
      { code: form.code.trim(), title: form.title.trim(), description: form.description.trim() || null },
      'strategic_goal.created'
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item: StrategicGoal) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, title: item.title, description: item.description || '' })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), title: editForm.title.trim(), description: editForm.description.trim() || null },
      'strategic_goal.updated'
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New Strategic Goal</h3>
        <div className="create-resource__row create-resource__row--2col">
          <label className="field">
            <span>Goal</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="e.g. Goal 1"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea
            className="input input--sm"
            placeholder="Optional description"
            value={form.description}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value })
              autoResize(e.target)
            }}
            ref={autoResize}
            rows={3}
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Loading strategic goals...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Goal</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={3}>No strategic goals yet.</td></tr>
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
                        <textarea
                          className="input input--sm"
                          value={editForm.description}
                          onChange={(e) => {
                            setEditForm({ ...editForm, description: e.target.value })
                            autoResize(e.target)
                          }}
                          ref={autoResize}
                          rows={3}
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
                      <td>{item.description || '—'}</td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'strategic_goal.deleted')}>Delete</button>
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

export default StrategicGoals

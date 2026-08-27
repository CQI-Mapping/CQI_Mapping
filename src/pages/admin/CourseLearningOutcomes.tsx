// Admin Course Learning Outcomes: standalone CRUD for CLO records.
// Separate from the curriculum-tied course_learning_outcomes table used by CLO/PO mapping.
// Uses the admin_course_learning_outcomes table for admin-managed standalone CLO list.
// Uses the useEntityCrud hook for shared state.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchCourseLearningOutcomesStandalone,
  createCourseLearningOutcomeStandalone,
  updateCourseLearningOutcomeStandalone,
  deleteCourseLearningOutcomeStandalone,
  seedIt21Course,
} from '../../services/database'
import type { CourseLearningOutcomeStandalone } from '../../services/database'
import { SEED_CLOS } from '../../data/vcqiSyllabus.js'

const EMPTY_FORM = { code: '', description: '', programOutcomes: '' }

interface CourseLearningOutcomesProps {
  // False renders the page without the Delete button (non-admin roles);
  // RLS enforces the same rule server-side.
  allowDelete?: boolean
  // False hides Archive/Restore (non-admin roles); the DB guard trigger
  // rejects status changes from non-admins regardless.
  allowArchive?: boolean
}

function CourseLearningOutcomes({ allowDelete = true, allowArchive = true }: CourseLearningOutcomesProps) {
  const crud = useEntityCrud<CourseLearningOutcomeStandalone>({
    loadFn: fetchCourseLearningOutcomesStandalone,
    createFn: createCourseLearningOutcomeStandalone,
    updateFn: updateCourseLearningOutcomeStandalone,
    deleteFn: deleteCourseLearningOutcomeStandalone,
    scope: 'Course Learning Outcome',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete, handleToggleStatus } = crud

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [seeded, setSeeded] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const isActive = (item: CourseLearningOutcomeStandalone) => item.status === 'active'
  const visibleItems = items.filter((i) => showArchived ? !isActive(i) : isActive(i))
  const archivedCount = items.filter((i) => !isActive(i)).length

  const handleArchive = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const nextStatus = isActive(item) ? 'archived' : 'active'
    await handleUpdate(id, { status: nextStatus }, 'clo.updated')
  }

  useEffect(() => { crud.load() }, [crud.load])

  useEffect(() => {
    if (loading || seeded) return
    setSeeded(true)
    const existing = new Set(items.map((i) => i.code))
    const missing = SEED_CLOS.filter((c) => !existing.has(c.code))
    const fillClos = missing.length === 0
      ? Promise.resolve()
      : missing.reduce<Promise<unknown>>((prev, clo) => prev.then(() => createCourseLearningOutcomeStandalone(clo)), Promise.resolve())
    fillClos
      .then(() => seedIt21Course())
      .then(() => crud.load())
      .catch(() => {})
  }, [loading, seeded])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await handleCreate(
      { code: form.code.trim(), title: form.programOutcomes.trim(), description: form.description.trim() || null },
      'clo.created'
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item: CourseLearningOutcomeStandalone) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, title: item.title, description: item.description || '', programOutcomes: item.title || '' })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), title: editForm.programOutcomes.trim(), description: editForm.description.trim() || null },
      'clo.updated'
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New Course Learning Outcome</h3>
        <label className="field">
          <span>CLO Number</span>
          <input
            className="input input--sm"
            type="text"
            placeholder="e.g. CLO-1"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            className="input input--sm"
            rows={2}
            placeholder="e.g. Compare and contrast..."
            value={form.description}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value })
              autoResize(e.target)
            }}
            ref={autoResize}
          />
        </label>
        <label className="field">
          <span>Program Outcomes</span>
          <input
            className="input input--sm"
            type="text"
            placeholder="e.g. PLO 1, PLO 3, & PLO 10"
            value={form.programOutcomes}
            onChange={(e) => setForm({ ...form, programOutcomes: e.target.value })}
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Loading course learning outcomes...</p>
      ) : (
        <div className="panel table-wrap">
          <div className="sd-tabs">
            <button
              className={`sd-tab ${!showArchived ? 'sd-tab--active' : ''}`}
              onClick={() => setShowArchived(false)}
            >
              Active
            </button>
            <button
              className={`sd-tab ${showArchived ? 'sd-tab--active' : ''}`}
              onClick={() => setShowArchived(true)}
            >
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Program Outcomes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 && (
                <tr><td colSpan={5}>No course learning outcomes yet.</td></tr>
              )}
              {visibleItems.map((item) => (
                <tr key={item.id} className={!isActive(item) ? 'sd-archived' : ''}>
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
                          rows={2}
                          value={editForm.description}
                          onChange={(e) => {
                            setEditForm({ ...editForm, description: e.target.value })
                            autoResize(e.target)
                          }}
                          ref={autoResize}
                        />
                      </td>
                      <td>
                        <input
                          className="input input--sm"
                          value={editForm.programOutcomes}
                          onChange={(e) => setEditForm({ ...editForm, programOutcomes: e.target.value })}
                          placeholder="e.g. PO1, PO3"
                        />
                      </td>
                      <td></td>
                      <td>
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{item.code}</strong></td>
                      <td>{item.description || '—'}</td>
                      <td>{item.title || '—'}</td>
                      <td>
                        <span className={`sd-status-badge ${isActive(item) ? 'sd-status-badge--active' : 'sd-status-badge--archived'}`}>
                          {isActive(item) ? 'active' : 'archived'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          Edit
                        </button>{' '}
                        <button
                          className={`btn btn--sm ${isActive(item) ? 'btn--danger' : 'btn--ghost'}`}
                          onClick={() => handleArchive(item.id)}
                        >
                          {isActive(item) ? (
                            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg> Archive</>
                          ) : (
                            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg> Restore</>
                          )}
                        </button>
                        {!isActive(item) && (
                          <button
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDelete(item.id, 'clo.deleted')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            Delete
                          </button>
                        )}
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

export default CourseLearningOutcomes

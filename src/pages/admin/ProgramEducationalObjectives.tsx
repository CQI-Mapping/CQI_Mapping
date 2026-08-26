// Admin Program Educational Objectives: CRUD for PEO records.
// Provides add, edit, and delete functionality for Program Educational
// Objectives managed by the admin role. Uses the useEntityCrud hook for shared state.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchProgramEducationalObjectives,
  createProgramEducationalObjective,
  updateProgramEducationalObjective,
  deleteProgramEducationalObjective,
} from '../../services/database'
import type { ProgramEducationalObjective } from '../../services/database'
import { SEED_PEOS } from '../../data/vcqiSyllabus.js'

const EMPTY_FORM = { code: '', title: '', description: '' }

interface ProgramEducationalObjectivesProps {
  userEmail: string
}

function ProgramEducationalObjectives({ userEmail }: ProgramEducationalObjectivesProps) {
  const crud = useEntityCrud<ProgramEducationalObjective>({
    loadFn: fetchProgramEducationalObjectives,
    createFn: createProgramEducationalObjective,
    updateFn: updateProgramEducationalObjective,
    deleteFn: deleteProgramEducationalObjective,
    userEmail,
    scope: 'Program Educational Objective',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

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

  const isActive = (item: ProgramEducationalObjective) => item.status === 'active'
  const visibleItems = items.filter((i) => showArchived ? !isActive(i) : isActive(i))
  const archivedCount = items.filter((i) => !isActive(i)).length

  const handleArchive = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const nextStatus = isActive(item) ? 'archived' : 'active'
    await handleUpdate(id, { status: nextStatus }, 'peo.updated')
  }

  useEffect(() => { crud.load() }, [crud.load])

  // Fill in any VCQI syllabus PEOs missing from the table (idempotent by code).
  // Runs once after the first load completes; items is read but intentionally
  // omitted from deps so the effect does not re-run after seeding.
  useEffect(() => {
    if (loading || seeded) return
    setSeeded(true)
    const existing = new Set(items.map((i) => i.code))
    const missing = SEED_PEOS.filter((p) => !existing.has(p.code))
    if (missing.length === 0) return
    missing.reduce<Promise<unknown>>((prev, peo) => prev.then(() => createProgramEducationalObjective(peo)), Promise.resolve())
      .then(() => crud.load())
  }, [loading, seeded])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await handleCreate(
      { code: form.code.trim(), title: form.title.trim(), description: form.description.trim() || null },
      'peo.created'
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item: ProgramEducationalObjective) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, title: item.title, description: item.description || '' })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), title: editForm.title.trim(), description: editForm.description.trim() || null },
      'peo.updated'
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New Program Educational Objective</h3>
        <div className="create-resource__row">
          <label className="field">
            <span>Code</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="e.g. PEO-1"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="Enter title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea
            className="input input--sm"
            rows={2}
            placeholder="Optional description"
            value={form.description}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value })
              autoResize(e.target)
            }}
            ref={autoResize}
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Loading program educational objectives...</p>
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
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 && (
                <tr><td colSpan={5}>No program educational objectives yet.</td></tr>
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
                        <input
                          className="input input--sm"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
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
                      <td></td>
                      <td>
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{item.code}</strong></td>
                      <td>{item.title}</td>
                      <td>{item.description || '—'}</td>
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
                            onClick={() => handleDelete(item.id, 'peo.deleted')}
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

export default ProgramEducationalObjectives

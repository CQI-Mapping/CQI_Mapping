// Admin Program Outcomes: standalone CRUD for program outcome records.
// Separate from the curriculum-tied program_outcomes table used by CLO/PO mapping.
// Uses the admin_program_outcomes table for admin-managed standalone PO list.
// Uses the useEntityCrud hook for shared state.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'
import { SEED_PROGRAM_OUTCOMES } from '../../data/vcqiSyllabus.js'

const EMPTY_FORM = { code: '', title: '', description: '' }

interface ProgramOutcomesProps {
  userEmail: string
}

function ProgramOutcomes({ userEmail }: ProgramOutcomesProps) {
  const crud = useEntityCrud<ProgramOutcomeStandalone>({
    loadFn: fetchProgramOutcomesStandalone,
    createFn: createProgramOutcomeStandalone,
    updateFn: updateProgramOutcomeStandalone,
    deleteFn: deleteProgramOutcomeStandalone,
    userEmail,
    scope: 'Program Outcome',
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

  // Fill in any VCQI syllabus Program Outcomes missing from the table
  // (idempotent by code). Runs once after the first load completes; items is
  // read but intentionally omitted from deps so the effect does not re-run.
  useEffect(() => {
    if (loading || seeded) return
    setSeeded(true)
    const existing = new Set(items.map((i) => i.code))
    const missing = SEED_PROGRAM_OUTCOMES.filter((p) => !existing.has(p.code))
    if (missing.length === 0) return
    missing.reduce<Promise<unknown>>((prev, po) => prev.then(() => createProgramOutcomeStandalone(po)), Promise.resolve())
      .then(() => crud.load())
  }, [loading, seeded])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await handleCreate(
      { code: form.code.trim(), title: form.title.trim(), description: form.description.trim() || null },
      'program_outcome.created'
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item: ProgramOutcomeStandalone) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, title: item.title, description: item.description || '' })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), title: editForm.title.trim(), description: editForm.description.trim() || null },
      'program_outcome.updated'
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New Program Outcome</h3>
        <div className="create-resource__row">
          <label className="field">
            <span>Code</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="e.g. PO-1"
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
        <p>Loading program outcomes...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(i => i.status !== 'archived').length === 0 && (
                <tr><td colSpan={4}>No program outcomes yet.</td></tr>
              )}
              {items.filter(i => i.status !== 'archived').map((item) => (
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
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                        <button className="btn btn--danger btn--sm" onClick={async () => {
                          if (!window.confirm('Archive this PO?')) return
                          await handleUpdate(item.id, { status: 'archived' }, 'program_outcome.archived')
                        }}>Archive</button>
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

export default ProgramOutcomes

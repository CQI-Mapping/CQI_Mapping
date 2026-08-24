// Admin Program Educational Objectives: CRUD for PEO records.
// Provides add, edit, and delete functionality for Program Educational
// Objectives managed by the admin role. Uses the useEntityCrud hook for shared state.

import { useState, useEffect } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchProgramEducationalObjectives,
  createProgramEducationalObjective,
  updateProgramEducationalObjective,
  deleteProgramEducationalObjective,
} from '../../services/database'
import type { ProgramEducationalObjective } from '../../services/database'

const EMPTY_FORM = { code: '', title: '', description: '' }

interface ProgramEducationalObjectivesProps {
  // Archive/Restore and Delete render only when allowed (admin role).
  allowDelete?: boolean
  allowArchive?: boolean
}

function ProgramEducationalObjectives({ allowDelete = true, allowArchive = true }: ProgramEducationalObjectivesProps) {
  const crud = useEntityCrud<ProgramEducationalObjective>({
    loadFn: fetchProgramEducationalObjectives,
    createFn: createProgramEducationalObjective,
    updateFn: updateProgramEducationalObjective,
    deleteFn: deleteProgramEducationalObjective,
    scope: 'Program Educational Objective',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete, handleToggleStatus } = crud

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  useEffect(() => { crud.load() }, [crud.load])

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
          <input
            className="input input--sm"
            type="text"
            placeholder="Code (e.g. PEO-1)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <input
            className="input input--sm"
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <input
            className="input input--sm"
            type="text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Loading program educational objectives...</p>
      ) : (
        <div className="panel table-wrap">
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
              {items.length === 0 && (
                <tr><td colSpan={5}>No program educational objectives yet.</td></tr>
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
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input input--sm"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        />
                      </td>
                      <td><span className={`status-badge status-badge--${item.status}`}>{item.status}</span></td>
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
                      <td><span className={`status-badge status-badge--${item.status}`}>{item.status}</span></td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                        {allowArchive && (
                          <button className="btn btn--ghost btn--sm" onClick={() => handleToggleStatus(item, 'peo.archived')}>
                            {item.status === 'active' ? 'Archive' : 'Restore'}
                          </button>
                        )}{' '}
                        {allowDelete && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'peo.deleted')}>Delete</button>
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

// Admin Curriculum — Program Outcomes (PO) sub-view: CRUD for the program
// outcomes of the selected program.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './useEntityCrud.js'
import {
  fetchProgramOutcomes,
  createProgramOutcome,
  updateProgramOutcome,
  deleteProgramOutcome,
  fetchPrograms,
} from '../../../services/database'

const EMPTY_FORM = { code: '', description: '' }

function PoView({ userEmail }) {
  const [programs, setPrograms] = useState([])
  const [programId, setProgramId] = useState('')

  const loadFn = useCallback(
    () => fetchProgramOutcomes(programId || null),
    [programId]
  )

  const crud = useEntityCrud({
    loadFn,
    createFn: createProgramOutcome,
    updateFn: updateProgramOutcome,
    deleteFn: deleteProgramOutcome,
    userEmail,
    scope: 'Program outcome',
  })
  const { items, loading, error, message, busy, load, handleCreate, handleUpdate, handleDelete } = crud

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  useEffect(() => {
    fetchPrograms().then(setPrograms).catch(() => setPrograms([]))
  }, [])

  // Reload whenever the selected program changes (and on mount).
  useEffect(() => { load() }, [load])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!programId) {
      crud.setError('Select a program first.')
      return
    }
    const ok = await handleCreate(
      { program_id: programId, code: form.code.trim(), description: form.description.trim() },
      'program_outcome.created',
      { programId, code: form.code.trim() }
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
      'program_outcome.updated',
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
            onChange={(e) => { setProgramId(e.target.value); setEditingId(null) }}
          >
            <option value="">Select a program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      {programId && (
        <form className="panel create-resource" onSubmit={onSubmit}>
          <h3>New program outcome</h3>
          <div className="create-resource__row">
            <input
              className="input input--sm"
              type="text"
              placeholder="Code (e.g. PO1)"
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

      {!programId ? (
        <p className="msg msg--info">Select a program to manage its program outcomes.</p>
      ) : loading ? (
        <p>Loading program outcomes...</p>
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
                <tr><td colSpan="3">No program outcomes yet for this program.</td></tr>
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
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'program_outcome.deleted', { id: item.id, code: item.code })}>Delete</button>
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

export default PoView

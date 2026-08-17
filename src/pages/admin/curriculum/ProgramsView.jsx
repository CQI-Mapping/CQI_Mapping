// Admin Curriculum — Programs sub-view: CRUD for academic programs.

import { useState, useEffect } from 'react'
import { useEntityCrud } from './useEntityCrud.js'
import {
  fetchPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
} from '../../../services/database'

const EMPTY_FORM = { code: '', name: '', description: '' }

function ProgramsView({ userEmail }) {
  const crud = useEntityCrud({
    loadFn: fetchPrograms,
    createFn: createProgram,
    updateFn: updateProgram,
    deleteFn: deleteProgram,
    userEmail,
    scope: 'Program',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  useEffect(() => { crud.load() }, [crud.load])

  const onSubmit = async (e) => {
    e.preventDefault()
    const ok = await handleCreate(
      { code: form.code.trim(), name: form.name.trim(), description: form.description.trim() },
      'program.created',
      { code: form.code.trim() }
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, name: item.name, description: item.description || '' })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), name: editForm.name.trim(), description: editForm.description.trim() },
      'program.updated',
      { id: editingId, code: editForm.code.trim() }
    )
    if (ok) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New program</h3>
        <div className="create-resource__row">
          <input
            className="input input--sm"
            type="text"
            placeholder="Code (e.g. BSIT)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <input
            className="input input--sm"
            type="text"
            placeholder="Program name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
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
        <p>Loading programs...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan="5">No programs yet.</td></tr>
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
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
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
                      <td>{item.name}</td>
                      <td>{item.description || '—'}</td>
                      <td><span className={`status-badge status-badge--${item.status}`}>{item.status}</span></td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'program.deleted', { id: item.id, code: item.code })}>Delete</button>
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

export default ProgramsView

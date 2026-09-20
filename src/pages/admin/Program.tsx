import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
} from '../../services/database'
import type { Program } from '../../services/database'

type ProgramForm = {
  code: string
  name: string
  description: string
}

const blank: ProgramForm = { code: '', name: '', description: '' }

export default function Program() {
  const createWithName = async (payload: Partial<Program>) =>
    createProgram({ ...payload, name: (payload as Program).name || payload.code || '' })
  const updateWithName = async (id: string, payload: Partial<Program>) =>
    updateProgram(id, { ...payload, name: (payload as Program).name || payload.code || '' })

  const crud = useEntityCrud<Program>({
    loadFn: fetchPrograms,
    createFn: createWithName,
    updateFn: updateWithName,
    deleteFn: deleteProgram,
    scope: 'Program',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [form, setForm] = useState<ProgramForm>(blank)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const isActive = (p: Program) => !p.status || p.status === 'active'
  const archivedCount = items.filter((p) => !isActive(p)).length
  const q = query.trim().toLowerCase()
  const visible = items
    .filter((p) => (archived ? !isActive(p) : isActive(p)))
    .filter(
      (p) =>
        !q ||
        [p.code, p.name, p.description || ''].some((v) => (v || '').toLowerCase().includes(q)),
    )

  useEffect(() => {
    crud.load()
  }, [crud.load])

  const openAdd = () => {
    setEditing(null)
    setForm(blank)
    setShowModal(true)
  }

  const openEdit = (item: Program) => {
    setEditing(item)
    setForm({ code: item.code || '', name: item.name || '', description: item.description || '' })
    setShowModal(true)
  }

  const closeModal = () => {
    if (busy) return
    setShowModal(false)
    setEditing(null)
    setForm(blank)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<Program> = {
      code: form.code.trim(),
      name: form.name.trim() || form.code.trim(),
      description: form.description.trim() || null,
    }
    if (!payload.code || !payload.name) return
    const ok = editing
      ? await handleUpdate(editing.id, payload, 'program.updated')
      : await handleCreate(payload, 'program.created')
    if (ok) closeModal()
  }

  const handleArchive = async (item: Program) => {
    await handleUpdate(item.id, { status: isActive(item) ? 'archived' : 'active' }, 'program.updated')
  }

  return (
    <div className="curriculum-view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Programs</h2>
        <button className="btn btn--primary btn--sm" onClick={openAdd}>
          Add New
        </button>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal__header">
              <h3>{editing ? 'Edit Program' : 'Add Program'}</h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal__body">
                <div className="modal__grid-2">
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span>Program Code</span>
                    <input
                      className="input input--sm"
                      type="text"
                      placeholder="e.g. BSIT"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span>Program Title</span>
                    <input
                      className="input input--sm"
                      type="text"
                      placeholder="e.g. Bachelor of Science in Information Technology"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span>Description</span>
                  <textarea
                    className="input input--sm"
                    rows={3}
                    placeholder="Brief description of this program..."
                    value={form.description}
                    ref={autoResize}
                    onChange={(e) => {
                      setForm({ ...form, description: e.target.value })
                      autoResize(e.target)
                    }}
                  />
                </label>
              </div>
              <div className="modal__footer">
                <button type="button" className="btn btn--ghost btn--sm" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                  {busy ? 'Saving...' : editing ? 'Save' : 'Add Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading programs...</p>
      ) : (
        <div className="panel table-wrap">
          <div className="sd-tabs">
            <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>
              Active
            </button>
            <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
            <input
              className="input input--sm sd-tabs__search"
              type="search"
              placeholder="Search programs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5}>No {archived ? 'archived' : 'active'} programs yet.</td>
                </tr>
              )}
              {visible.map((item) => (
                <tr key={item.id} className={!isActive(item) ? 'sd-archived' : ''}>
                  <td>
                    <strong>{item.code}</strong>
                  </td>
                  <td>{item.name}</td>
                  <td>{item.description || '—'}</td>
                  <td>
                    <span className={`sd-status-badge ${isActive(item) ? 'sd-status-badge--active' : 'sd-status-badge--archived'}`}>
                      {isActive(item) ? 'active' : 'archived'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn--ghost btn--sm" onClick={() => openEdit(item)} disabled={busy}>
                      Edit
                    </button>{' '}
                    <button
                      className={`btn btn--sm ${isActive(item) ? 'btn--danger' : 'btn--ghost'}`}
                      onClick={() => handleArchive(item)}
                      disabled={busy}
                    >
                      {isActive(item) ? 'Archive' : 'Restore'}
                    </button>{' '}
                    {!isActive(item) && (
                      <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'program.deleted')} disabled={busy}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Admin CHED Memorandum Orders: CRUD for CMO records.
// Provides add, edit, and archive functionality for CHED Memorandum Orders
// managed by the admin role. Uses the useEntityCrud hook for shared state.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchChedMemoOrders,
  createChedMemoOrder,
  updateChedMemoOrder,
  deleteChedMemoOrder,
} from '../../services/database'
import type { ChedMemoOrder } from '../../services/database'
import { SEED_CMOS } from '../../data/vcqiSyllabus.js'

const EMPTY_FORM = { code: '', title: '', description: '' }

interface ChedMemoOrdersProps {
  userEmail: string
}

function ChedMemoOrders({ userEmail }: ChedMemoOrdersProps) {
  const crud = useEntityCrud<ChedMemoOrder>({
    loadFn: fetchChedMemoOrders,
    createFn: createChedMemoOrder,
    updateFn: updateChedMemoOrder,
    deleteFn: deleteChedMemoOrder,
    userEmail,
    scope: 'CHED Memorandum Order',
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

  useEffect(() => { crud.load() }, [crud.load])

  // Fill in any VCQI syllabus CMOs missing from the table (idempotent by code).
  // Runs once after the first load completes; items is read but intentionally
  // omitted from deps so the effect does not re-run after seeding.
  useEffect(() => {
    if (loading || seeded) return
    setSeeded(true)
    const existing = new Set(items.map((i) => i.code))
    const missing = SEED_CMOS.filter((c) => !existing.has(c.code))
    if (missing.length === 0) return
    missing.reduce<Promise<unknown>>((prev, cmo) => prev.then(() => createChedMemoOrder(cmo)), Promise.resolve())
      .then(() => crud.load())
  }, [loading, seeded])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await handleCreate(
      { code: form.code.trim(), title: form.title.trim(), description: form.description.trim() || null },
      'ched_memo_order.created'
    )
    if (ok) setForm(EMPTY_FORM)
  }

  const startEdit = (item: ChedMemoOrder) => {
    setEditingId(item.id)
    setEditForm({ code: item.code, title: item.title, description: item.description || '' })
  }

  const saveEdit = async () => {
    const ok = await handleUpdate(
      editingId,
      { code: editForm.code.trim(), title: editForm.title.trim(), description: editForm.description.trim() || null },
      'ched_memo_order.updated'
    )
    if (ok) setEditingId(null)
  }

  const isActive = (item: ChedMemoOrder) => !item.status || item.status === 'active'

  const handleArchive = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const nextStatus = isActive(item) ? 'archived' : 'active'
    const ok = await handleUpdate(id, { status: nextStatus }, 'ched_memo_order.updated')
    if (ok) {
      setMessage(`CHED Memorandum Order ${nextStatus === 'archived' ? 'archived' : 'restored'}.`)
    }
  }

  const visibleItems = items.filter((i) => showArchived ? !isActive(i) : isActive(i))
  const archivedCount = items.filter((i) => !isActive(i)).length

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={onSubmit}>
        <h3>New CHED Memorandum Order</h3>
        <div className="create-resource__row">
          <label className="field">
            <span>Code</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="e.g. CMO 1 s. 2024"
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
            rows={3}
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
        <p>Loading CHED Memorandum Orders...</p>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 && (
                <tr><td colSpan={4}>No CHED Memorandum Orders yet.</td></tr>
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
                          rows={3}
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
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId}>Edit</button>{' '}
                        <button
                          className={`btn btn--sm ${isActive(item) ? 'btn--danger' : 'btn--ghost'}`}
                          onClick={() => handleArchive(item.id)}
                          disabled={busy || !!editingId}
                        >
                          {isActive(item) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(item) && (
                          <button
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDelete(item.id, 'ched_memo_order.deleted')}
                            disabled={busy || !!editingId}
                          >
                            Delete
                          </button>
                        )}
                        {!isActive(item) && <span className="sd-archived-badge">archived</span>}
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

export default ChedMemoOrders

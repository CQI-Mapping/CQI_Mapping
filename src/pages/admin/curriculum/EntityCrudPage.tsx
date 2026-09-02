// Shared CRUD page for the nearly-identical admin entity managers
// (Strategic Goals, PEOs, Program Outcomes, CHED Memorandum Orders).
// Each page passes its own load/create/update/delete functions, action names,
// seed source, and labels as config — the shared JSX below is reused.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './useEntityCrud.js'

interface SeedItem {
  code: string
  title: string
  description: string | null
}

interface EntityCrudPageProps<T extends { id: string }> {
  title: string
  load: () => Promise<T[]>
  create: (p: Partial<T>) => Promise<T>
  update: (id: string, p: Partial<T>) => Promise<T>
  remove: (id: string) => Promise<void>
  scope: string
  createAction: string
  updateAction: string
  deleteAction: string
  codeLabel?: string
  codePlaceholder?: string
  seeds?: SeedItem[]
  isActive?: (item: T) => boolean
  sort?: (a: T, b: T) => number
}

export default function EntityCrudPage<T extends { id: string }>({
  title,
  load,
  create,
  update,
  remove,
  scope,
  createAction,
  updateAction,
  deleteAction,
  codeLabel = 'Code',
  codePlaceholder = 'e.g. CODE-1',
  seeds,
  isActive = (i) => !(i as { status?: string }).status || (i as { status?: string }).status === 'active',
  sort,
}: EntityCrudPageProps<T>) {
  const crud = useEntityCrud<T>({ loadFn: load, createFn: create, updateFn: update, deleteFn: remove, userEmail: '', scope })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

  const blank = { code: '', title: '', description: '' }
  const [form, setForm] = useState(blank)
  const [editForm, setEditForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [archived, setArchived] = useState(false)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const visible = items.filter((i) => (archived ? !isActive(i) : isActive(i)))
  if (sort) visible.sort(sort)
  const archivedCount = items.filter((i) => !isActive(i)).length

  useEffect(() => { crud.load() }, [crud.load])

  // Seed any records from `seeds` that are missing (matched by code).
  useEffect(() => {
    if (loading || seeded || !seeds || seeds.length === 0) return
    setSeeded(true)
    const existing = new Set(items.map((i) => (i as { code?: string }).code))
    const missing = seeds.filter((s) => !existing.has(s.code))
    if (missing.length === 0) return
    missing.reduce<Promise<unknown>>((prev, s) => prev.then(() => create(s as Partial<T>)), Promise.resolve())
      .then(() => crud.load())
      .catch(() => {})
    // items intentionally omitted from deps so seeding runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, seeded])

  const payload = (f: typeof blank) => ({
    code: f.code.trim(),
    title: f.title.trim(),
    description: f.description.trim() || null,
  }) as Partial<T>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await handleCreate(payload(form), createAction)) setForm(blank)
  }

  const startEdit = (item: T) => {
    setEditingId(item.id)
    setEditForm({
      code: (item as { code?: string }).code || '',
      title: (item as { title?: string }).title || '',
      description: (item as { description?: string }).description || '',
    })
  }

  const saveEdit = async () => {
    if (await handleUpdate(editingId, payload(editForm), updateAction)) setEditingId(null)
  }

  const codeOf = (i: T) => (i as { code?: string }).code || ''
  const titleOf = (i: T) => (i as { title?: string }).title || ''
  const descOf = (i: T) => (i as { description?: string }).description

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={submit}>
        <h3>New {title}</h3>
        <div className="create-resource__row">
          <label className="field">
            <span>{codeLabel}</span>
            <input className="input input--sm" type="text" placeholder={codePlaceholder} value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </label>
          <label className="field">
            <span>Title</span>
            <input className="input input--sm" type="text" placeholder="Enter title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea className="input input--sm" rows={3} placeholder="Optional description" ref={autoResize}
            value={form.description}
            onChange={(e) => { setForm({ ...form, description: e.target.value }); autoResize(e.target) }} />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Add'}</button>
        </div>
      </form>

      {loading ? (
        <p>Loading {title.toLowerCase()}...</p>
      ) : (
        <div className="panel table-wrap">
          <div className="sd-tabs">
            <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
            <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
          <table className="table">
            <thead><tr><th>Code</th><th>Title</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={5}>No {title.toLowerCase()} yet.</td></tr>}
              {visible.map((item) => (
                <tr key={item.id} className={!isActive(item) ? 'sd-archived' : ''}>
                  {editingId === item.id ? (
                    <>
                      <td><input className="input input--sm" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></td>
                      <td><input className="input input--sm" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></td>
                      <td><textarea className="input input--sm" rows={3} ref={autoResize} value={editForm.description}
                        onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} /></td>
                      <td></td>
                      <td>
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{codeOf(item)}</strong></td>
                      <td>{titleOf(item)}</td>
                      <td>{descOf(item) || '—'}</td>
                      <td>
                        <span className={`sd-status-badge ${isActive(item) ? 'sd-status-badge--active' : 'sd-status-badge--archived'}`}>
                          {isActive(item) ? 'active' : 'archived'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId}>Edit</button>{' '}
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--danger' : 'btn--ghost'}`}
                          onClick={() => handleUpdate(item.id, { status: isActive(item) ? 'archived' : 'active' }, updateAction)} disabled={busy || !!editingId}>
                          {isActive(item) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(item) && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, deleteAction)} disabled={busy || !!editingId}>Delete</button>
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

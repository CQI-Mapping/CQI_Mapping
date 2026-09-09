// Shared CRUD page for the nearly-identical admin entity managers
// (Strategic Goals, PEOs, Program Outcomes, CHED Memorandum Orders).
// Each page passes its own load/create/update/delete functions, action names,
// seed source, and labels as config — the shared JSX below is reused.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './useEntityCrud.js'

// One selectable "alignment" option. `value` is the text stored in the entity's
// description column (also the select's round-trippable value); `cmo_id`
// (optional) records the CHED Memorandum Order to link to for that choice.
export interface AlignmentOption {
  value: string
  cmo_id?: string | null
  relationId?: string | null
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
  isActive?: (item: T) => boolean
  sort?: (a: T, b: T) => number
  showDescription?: boolean
  descriptionLabel?: string
  descriptionOptions?: AlignmentOption[]
  descriptionLabel2?: string
  descriptionOptions2?: AlignmentOption[]
  relationField2?: string
  showTitle?: boolean
  titleField?: string
  titleLabel?: string
  titleMultiline?: boolean
  formatCode?: (code: string) => string
  allowDelete?: boolean
  relationField?: string
  counts?: Record<string, number>
  countLabel?: string
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
  isActive = (i) => !(i as { status?: string }).status || (i as { status?: string }).status === 'active',
  sort,
  showDescription = true,
  descriptionLabel = 'Description',
  descriptionOptions,
  descriptionLabel2,
  descriptionOptions2,
  relationField2,
  showTitle = true,
  titleField = 'title',
  titleLabel = 'Title',
  titleMultiline = false,
  formatCode = (c) => c,
  allowDelete = true,
  relationField,
  counts,
  countLabel = 'Linked',
}: EntityCrudPageProps<T>) {
  const crud = useEntityCrud<T>({ loadFn: load, createFn: create, updateFn: update, deleteFn: remove, userEmail: '', scope })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

  const blank = { code: '', title: '', description: '', description2: '' }
  const [form, setForm] = useState(blank)
  const [editForm, setEditForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const payload = (f: typeof blank) => {
    const value = f.description.trim() || ''
    const opt = descriptionOptions?.find((o) => o.value === value)
    const base: Record<string, unknown> = {
      code: f.code.trim(),
      [titleField]: f.title.trim(),
      description: opt ? opt.value : (value || null),
    }
    if (relationField) base[relationField] = opt ? (opt.relationId ?? opt.cmo_id ?? null) : null
    if (descriptionOptions2 && relationField2) {
      const value2 = f.description2.trim() || ''
      const opt2 = descriptionOptions2.find((o) => o.value === value2)
      base[relationField2] = opt2 ? (opt2.relationId ?? opt2.cmo_id ?? null) : null
    }
    return base as Partial<T>
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await handleCreate(payload(form), createAction)) setForm(blank)
  }

  const startEdit = (item: T) => {
    setEditingId(item.id)
    const peoId = (item as { peo_id?: string | null }).peo_id ?? null
    setEditForm({
      code: (item as { code?: string }).code || '',
      title: ((item as Record<string, unknown>)[titleField] as string | undefined) || '',
      description: (item as { description?: string }).description || '',
      description2: descriptionOptions2?.find((o) => (o.relationId ?? o.cmo_id ?? null) === peoId)?.value || '',
    })
  }

  const saveEdit = async () => {
    if (await handleUpdate(editingId, payload(editForm), updateAction)) setEditingId(null)
  }

  const codeOf = (i: T) => (i as { code?: string }).code || ''
  const titleOf = (i: T) => ((i as Record<string, unknown>)[titleField] as string | undefined) || ''
  const descOf = (i: T) => (i as { description?: string }).description

  const alignmentSelect = (value: string, onChange: (v: string) => void) => (
    <select className="input input--sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {descriptionOptions?.map((o) => (
        <option key={o.value} value={o.value}>{o.value}</option>
      ))}
    </select>
  )

  const alignmentSelect2 = (value: string, onChange: (v: string) => void) => (
    <select className="input input--sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {descriptionOptions2?.map((o) => (
        <option key={o.value} value={o.value}>{o.value}</option>
      ))}
    </select>
  )

  const labelOf2 = (item: T) => {
    const id = relationField2 ? ((item as Record<string, unknown>)[relationField2] as string | null) : null
    return descriptionOptions2?.find((o) => (o.relationId ?? o.cmo_id ?? null) === id)?.value || '—'
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={submit}>
        <h3>New {title}</h3>
        {titleMultiline ? (
          <>
            <label className="field">
              <span>{codeLabel}</span>
              <input className="input input--sm" type="text" placeholder={codePlaceholder} value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            {showTitle && (
              <label className="field">
                <span>{titleLabel}</span>
                <textarea className="input input--sm" rows={3} placeholder={`Enter full ${titleLabel.toLowerCase()}`} ref={autoResize}
                  value={form.title}
                  onChange={(e) => { setForm({ ...form, title: e.target.value }); autoResize(e.target) }} required />
              </label>
            )}
          </>
        ) : (
        <div className="create-resource__row">
          <label className="field">
            <span>{codeLabel}</span>
            <input className="input input--sm" type="text" placeholder={codePlaceholder} value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </label>
          {showTitle && (
            <label className="field">
              <span>{titleLabel}</span>
              <input className="input input--sm" type="text" placeholder={`Enter ${titleLabel.toLowerCase()}`} value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
          )}
        </div>
        )}
        {showDescription && (
          <label className="field">
            <span>{descriptionLabel}</span>
            {descriptionOptions ? alignmentSelect(form.description, (v) => setForm({ ...form, description: v })) : (
              <textarea className="input input--sm" rows={3} placeholder="Optional description" ref={autoResize}
                value={form.description}
                onChange={(e) => { setForm({ ...form, description: e.target.value }); autoResize(e.target) }} />
            )}
          </label>
        )}
        {descriptionOptions2 && (
          <label className="field">
            <span>{descriptionLabel2}</span>
            {alignmentSelect2(form.description2, (v) => setForm({ ...form, description2: v }))}
          </label>
        )}
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
            <thead>
              <tr>
                <th>Code</th>
                {showTitle && <th>{titleLabel}</th>}
                {showDescription && <th>{descriptionLabel}</th>}
                {descriptionOptions2 && <th>{descriptionLabel2}</th>}
                {counts && <th>{countLabel}</th>}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3 + (showTitle ? 1 : 0) + (showDescription ? 1 : 0) + (descriptionOptions2 ? 1 : 0) + (counts ? 1 : 0)}>
                    No {title.toLowerCase()} yet.
                  </td>
                </tr>
              )}
              {visible.map((item) => (
                <tr key={item.id} className={!isActive(item) ? 'sd-archived' : ''}>
                  {editingId === item.id ? (
                    <>
                      <td><input className="input input--sm" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></td>
                      {showTitle && (
                        <td>{titleMultiline ? (
                          <textarea className="input input--sm" rows={3} ref={autoResize} value={editForm.title}
                            onChange={(e) => { setEditForm({ ...editForm, title: e.target.value }); autoResize(e.target) }} />
                        ) : (
                          <input className="input input--sm" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                        )}</td>
                      )}
                      {showDescription && (
                        <td>{descriptionOptions ? alignmentSelect(editForm.description, (v) => setEditForm({ ...editForm, description: v })) : (
                          <textarea className="input input--sm" rows={3} ref={autoResize} value={editForm.description}
                            onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} />
                        )}</td>
                      )}
                      {descriptionOptions2 && (
                        <td>{alignmentSelect2(editForm.description2, (v) => setEditForm({ ...editForm, description2: v }))}</td>
                      )}
                      {counts && <td></td>}
                      <td></td>
                      <td>
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{formatCode(codeOf(item))}</strong></td>
                      {showTitle && <td>{titleOf(item)}</td>}
                      {showDescription && <td>{descOf(item) || '—'}</td>}
                      {descriptionOptions2 && <td>{labelOf2(item)}</td>}
                      {counts && <td>{counts[item.id] ?? 0}</td>}
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
                        {!isActive(item) && allowDelete && (
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
// Shared CRUD page for the nearly-identical admin entity managers
// (Strategic Goals, PEOs, Program Outcomes, CHED Memorandum Orders).
// Each page passes its own load/create/update/delete functions, action names,
// seed source, and labels as config — the shared JSX below is reused.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './useEntityCrud.js'
import SuggestionInput, { type SuggestionOption } from '../../../components/SuggestionInput.js'

// One selectable "alignment" option. `value` is the text shown in the select (and,
// for text-based alignments, stored in the entity's description column); `cmo_id`
// and `relationId` (optional) record the related record to link for that choice.
export interface AlignmentOption {
  value: string
  cmo_id?: string | null
  relationId?: string | null
}

export interface AlignmentField {
  label: string
  options: AlignmentOption[]
  relationField: string
  // If set, the chosen option's `value` is also persisted here
  // (e.g. CMO alignment text stored in the `description` column).
  textField?: string
  type?: 'select' | 'text' | 'suggest'
  placeholder?: string
  // For `type: 'suggest'`, the list of options shown in the autocomplete dropdown.
  suggestionOptions?: SuggestionOption[]
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
  codeWidth?: string
  isActive?: (item: T) => boolean
  sort?: (a: T, b: T) => number
  showDescription?: boolean
  descriptionLabel?: string
  alignments?: AlignmentField[]
  tableAlignments?: AlignmentField[]
  inlineForm?: boolean
  stackedAlignments?: AlignmentField[]
  showTitle?: boolean
  titleField?: string
  titleLabel?: string
  titleMultiline?: boolean
  formatCode?: (code: string) => string
  allowDelete?: boolean
  counts?: Record<string, number>
  countLabel?: string
}

interface FormState {
  code: string
  title: string
  description: string
  align: Record<string, string>
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
  codeWidth,
  isActive = (i) => !(i as { status?: string }).status || (i as { status?: string }).status === 'active',
  sort,
  showDescription = true,
  descriptionLabel = 'Description',
alignments,
  tableAlignments,
  inlineForm = false,
  stackedAlignments = [],
  showTitle = true,
  titleField = 'title',
  titleLabel = 'Title',
  titleMultiline = false,
  formatCode = (c) => c,
  allowDelete = true,
  counts,
  countLabel = 'Linked',
}: EntityCrudPageProps<T>) {
  const crud = useEntityCrud<T>({ loadFn: load, createFn: create, updateFn: update, deleteFn: remove, userEmail: '', scope })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete } = crud

  const allAlignments = tableAlignments ?? alignments ?? []

  const blank = (): FormState => ({
    code: '',
    title: '',
    description: '',
    align: (allAlignments).reduce((acc, a) => ({ ...acc, [a.relationField]: '' }), {}),
  })
  const [form, setForm] = useState<FormState>(blank)
  const [editForm, setEditForm] = useState<FormState>(blank)
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

  const optionId = (o: AlignmentOption) => o.relationId ?? o.cmo_id ?? null

  const payload = (f: FormState) => {
    const base: Record<string, unknown> = {
      code: f.code.trim(),
      [titleField]: f.title.trim(),
      description: f.description.trim() || null,
    }
    for (const a of allAlignments) {
      const val = (f.align[a.relationField] || '').trim()
      if (a.type === 'text' || a.type === 'suggest') {
        base[a.relationField] = val || null
        if (a.textField) base[a.textField] = val || null
        continue
      }
      const opt = a.options.find((o) => o.value === val)
      if (a.textField) base[a.textField] = opt ? opt.value : null
      base[a.relationField] = opt ? optionId(opt) : null
    }
    return base as Partial<T>
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await handleCreate(payload(form), createAction)) setForm(blank())
  }

  const startEdit = (item: T) => {
    setEditingId(item.id)
    const align: Record<string, string> = {}
    for (const a of allAlignments) {
      if (a.type === 'text' || a.type === 'suggest') {
        align[a.relationField] = ((item as Record<string, unknown>)[a.relationField] as string | undefined) || ''
        continue
      }
      if (a.textField) {
        align[a.relationField] = ((item as Record<string, unknown>)[a.textField] as string | undefined) || ''
      } else {
        const relVal = (item as Record<string, unknown>)[a.relationField] as string | null
        align[a.relationField] = a.options.find((o) => optionId(o) === relVal)?.value || ''
      }
    }
    setEditForm({
      code: (item as { code?: string }).code || '',
      title: ((item as Record<string, unknown>)[titleField] as string | undefined) || '',
      description: (item as { description?: string }).description || '',
      align,
    })
  }

  const saveEdit = async () => {
    if (await handleUpdate(editingId, payload(editForm), updateAction)) setEditingId(null)
  }

  const codeOf = (i: T) => (i as { code?: string }).code || ''
  const titleOf = (i: T) => ((i as Record<string, unknown>)[titleField] as string | undefined) || ''
  const descOf = (i: T) => (i as { description?: string }).description
  const alignLabelOf = (item: T, field: AlignmentField) => {
    if (field.type === 'text' || field.type === 'suggest') return ((item as Record<string, unknown>)[field.relationField] as string | undefined) || '—'
    if (field.textField) return ((item as Record<string, unknown>)[field.textField] as string | undefined) || '—'
    const relVal = (item as Record<string, unknown>)[field.relationField] as string | null
    return field.options.find((o) => optionId(o) === relVal)?.value || '—'
  }

  const alignmentSelect = (field: AlignmentField, value: string, onChange: (v: string) => void) => {
    if (field.type === 'suggest') {
      return (
        <SuggestionInput
          value={value}
          onChange={onChange}
          options={field.suggestionOptions ?? []}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
        />
      )
    }
    if (field.type === 'text') {
      return (
        <input
          className="input input--sm"
          type="text"
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    return (
      <select className="input input--sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.value}</option>
        ))}
      </select>
    )
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
              <input className="input input--sm" type="text" placeholder={codePlaceholder} style={codeWidth ? { width: codeWidth } : undefined} value={form.code}
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
        ) : inlineForm ? (
          <div className="create-resource__row" style={{ gridTemplateColumns: codeWidth ? `${codeWidth} repeat(${(showTitle ? 1 : 0) + ((alignments ?? []).length || (showDescription ? 1 : 0))}, minmax(0, 1fr))` : `repeat(${1 + (showTitle ? 1 : 0) + ((alignments ?? []).length || (showDescription ? 1 : 0))}, minmax(0, 1fr))`, gap: '6px' }}>
            <label className="field">
              <span>{codeLabel}</span>
              <input className="input input--sm" type="text" placeholder={codePlaceholder} style={codeWidth ? { width: codeWidth } : undefined} value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            {showTitle && (
              <label className="field">
                <span>{titleLabel}</span>
                <input className="input input--sm" type="text" placeholder={`Enter ${titleLabel.toLowerCase()}`} value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </label>
            )}
            {alignments ? alignments.map((a) => (
              <label className="field" key={a.relationField}>
                <span>{a.label}</span>
                {alignmentSelect(a, form.align[a.relationField] || '', (v) =>
                  setForm({ ...form, align: { ...form.align, [a.relationField]: v } }))}
              </label>
            )) : showDescription && (
              <label className="field">
                <span>{descriptionLabel}</span>
                <textarea className="input input--sm" rows={3} placeholder="Optional description" ref={autoResize}
                  value={form.description}
                  onChange={(e) => { setForm({ ...form, description: e.target.value }); autoResize(e.target) }} />
              </label>
            )}
          </div>
        ) : (
        <div className="create-resource__row create-resource__row--2col">
          <label className="field">
            <span>{codeLabel}</span>
            <input className="input input--sm" type="text" placeholder={codePlaceholder} style={codeWidth ? { width: codeWidth } : undefined} value={form.code}
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
        {inlineForm && stackedAlignments.map((a) => (
          <label className="field" key={a.relationField}>
            <span>{a.label}</span>
            {alignmentSelect(a, form.align[a.relationField] || '', (v) =>
              setForm({ ...form, align: { ...form.align, [a.relationField]: v } }))}
          </label>
        ))}
        {!inlineForm && (alignments
        ? alignments.map((a) => (
            <label className="field" key={a.relationField}>
              <span>{a.label}</span>
              {alignmentSelect(a, form.align[a.relationField] || '', (v) =>
                setForm({ ...form, align: { ...form.align, [a.relationField]: v } }))}
            </label>
          ))
        : showDescription && (
            <label className="field">
              <span>{descriptionLabel}</span>
              <textarea className="input input--sm" rows={3} placeholder="Optional description" ref={autoResize}
                value={form.description}
                onChange={(e) => { setForm({ ...form, description: e.target.value }); autoResize(e.target) }} />
            </label>
          ))}
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
                {(tableAlignments ?? alignments ?? []).map((a) => <th key={a.relationField}>{a.label}</th>)}
                {!alignments && showDescription && <th>{descriptionLabel}</th>}
                {counts && <th>{countLabel}</th>}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3 + (showTitle ? 1 : 0) + ((alignments ?? []).length || (showDescription ? 1 : 0)) + (counts ? 1 : 0)}>
                    No {title.toLowerCase()} yet.
                  </td>
                </tr>
              )}
              {visible.map((item) => (
                <tr key={item.id} className={!isActive(item) ? 'sd-archived' : ''}>
                  {editingId === item.id ? (
                    <>
                      <td><input className="input input--sm" style={codeWidth ? { width: codeWidth } : undefined} value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></td>
                      {showTitle && (
                        <td>{titleMultiline ? (
                          <textarea className="input input--sm" rows={3} ref={autoResize} value={editForm.title}
                            onChange={(e) => { setEditForm({ ...editForm, title: e.target.value }); autoResize(e.target) }} />
                        ) : (
                          <input className="input input--sm" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                        )}</td>
                      )}
                      {(tableAlignments ?? alignments ?? []).map((a) => (
                        <td key={a.relationField}>
                          {alignmentSelect(a, editForm.align[a.relationField] || '', (v) =>
                            setEditForm({ ...editForm, align: { ...editForm.align, [a.relationField]: v } }))}
                        </td>
                      ))}
                      {!alignments && showDescription && (
                        <td>
                          <textarea className="input input--sm" rows={3} ref={autoResize} value={editForm.description}
                            onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} />
                        </td>
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
                      {(tableAlignments ?? alignments ?? []).map((a) => (
                        <td key={a.relationField}>{alignLabelOf(item, a)}</td>
                      ))}
                      {!alignments && showDescription && <td>{descOf(item) || '—'}</td>}
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
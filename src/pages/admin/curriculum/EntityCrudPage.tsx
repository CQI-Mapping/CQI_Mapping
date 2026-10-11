// Shared CRUD page for the nearly-identical admin entity managers
// (Strategic Goals, PEOs, Program Outcomes, CHED Memorandum Orders).
// Each page passes its own load/create/update/delete functions, action names,
// seed source, and labels as config — the shared JSX below is reused.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './useEntityCrud.js'
import { useViewMode } from '../../../hooks/useViewMode.js'
import ViewModeToggle from '../../../components/ViewModeToggle.js'
import Icon from '../../../components/icons.js'
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

  const draftKey = `cqi.draft.${title}`
  const readDraft = (): FormState => {
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return { ...blank(), ...parsed }
      }
    } catch {
      /* ignore invalid draft */
    }
    return blank()
  }

  const [form, setForm] = useState<FormState>(readDraft)
  const [editForm, setEditForm] = useState<FormState>(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  // List (default) or grid card style — the user decides per browser,
  // remembered separately for each entity type.
  const [viewMode, setViewMode] = useViewMode(`cqi.viewMode.${title}`)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const archivedCount = items.filter((i) => !isActive(i)).length

  useEffect(() => { crud.load() }, [crud.load])

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(form))
    } catch {
      /* ignore quota errors */
    }
  }, [form, draftKey])

  // For Program Outcome: PEO/SG only apply when CMO is BSIT or Specific sub-discipline.
  // If CMO switches to a non-applicable value, clear stale PEO/SG so they don't get saved
  // and don't show suggestions.
  useEffect(() => {
    if (title !== 'Program Outcome') return
    const cmo = (form.align['cmo_id'] || '').toLowerCase()
    const allowed = cmo.includes('bachelor of science in information technology') || cmo.includes('specific to a sub-discipline') || cmo.includes('bachelor of science in computer science')
    if (!allowed && (form.align['peo_text'] || form.align['sg_text'])) {
      setForm((prev) => ({ ...prev, align: { ...prev.align, peo_text: '', sg_text: '' } }))
    }
  }, [form.align['cmo_id']]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (title !== 'Program Outcome') return
    const cmo = (editForm.align['cmo_id'] || '').toLowerCase()
    const allowed = cmo.includes('bachelor of science in information technology') || cmo.includes('specific to a sub-discipline') || cmo.includes('bachelor of science in computer science')
    if (!allowed && (editForm.align['peo_text'] || editForm.align['sg_text'])) {
      setEditForm((prev) => ({ ...prev, align: { ...prev.align, peo_text: '', sg_text: '' } }))
    }
  }, [editForm.align['cmo_id']]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (await handleCreate(payload(form), createAction)) {
      try {
        sessionStorage.removeItem(draftKey)
      } catch {
        /* ignore */
      }
      setForm(blank())
    }
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

  const q = query.trim().toLowerCase()
  const visible = items
    .filter((i) => (archived ? !isActive(i) : isActive(i)))
    .filter(
      (i) =>
        !q ||
        [codeOf(i), titleOf(i), descOf(i) || '', ...(tableAlignments ?? alignments ?? []).map((a) => alignLabelOf(i, a))]
          .some((v) => (v || '').toLowerCase().includes(q)),
    )
  if (sort) visible.sort(sort)

  const isPeoSgDisabled = (align: Record<string, string>, field: AlignmentField) => {
    if (title !== 'Program Outcome') return false
    if (field.relationField !== 'peo_text' && field.relationField !== 'sg_text') return false
    const cmo = (align['cmo_id'] || '').toLowerCase()
    if (!cmo) return true
    // Only these CMO categories have PEO/SG alignments per spec
    const allowed = cmo.includes('bachelor of science in information technology') || cmo.includes('specific to a sub-discipline')
    // Keep legacy CS variant allowed for backward compat if present in DB
    const legacyAllowed = cmo.includes('bachelor of science in computer science')
    return !(allowed || legacyAllowed)
  }

  const alignmentSelect = (field: AlignmentField, value: string, onChange: (v: string) => void, disabled = false) => {
    if (field.type === 'suggest') {
      // No suggestions at all when disabled or when user hasn't typed 2 letters — handled inside SuggestionInput
      const opts = disabled ? [] : (field.suggestionOptions ?? [])
      const ph = disabled ? 'Select CMO first' : (field.placeholder || `Enter ${field.label.toLowerCase()}`)
      return (
        <SuggestionInput
          value={value}
          onChange={onChange}
          options={opts}
          placeholder={ph}
          disabled={disabled}
        />
      )
    }
    if (field.type === 'text') {
      return (
        <input
          className="input input--sm"
          type="text"
          placeholder={disabled ? 'Select CMO first' : (field.placeholder || `Enter ${field.label.toLowerCase()}`)}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    return (
      <select className="input input--sm" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.value}</option>
        ))}
      </select>
    )
  }

  const totalCount = items.length
  const activeCount = items.filter(isActive).length

  const heroMeta: Record<string, { icon: string; subtitle: string }> = {
    'Strategic Goal': { icon: 'SG', subtitle: 'Institutional strategic goals aligned to PEOs and program outcomes.' },
    'Program Educational Objective': { icon: 'PEO', subtitle: 'Long-term career and professional achievements of graduates.' },
    'Program Outcome': { icon: 'PO', subtitle: 'Competencies and skills graduates attain — mapped to CMO & PEO.' },
    'CHED Memorandum Order': { icon: 'CMO', subtitle: 'CHED issuances and policies governing program offerings.' },
  }
  const meta = heroMeta[title] || { icon: title.slice(0, 2).toUpperCase(), subtitle: `Manage ${title.toLowerCase()} records — add, edit, archive and organize.` }

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">{meta.icon}</div>
          <div className="program-hero__titles">
            <h2>{title}</h2>
            <p>{meta.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{totalCount}</div>
          <div className="program-stat__sub">All {title.toLowerCase()}s</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Active</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="program-stat__sub">Currently in use</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Archived</div>
          <div className="program-stat__value" style={{ color: '#64748b' }}>{archivedCount}</div>
          <div className="program-stat__sub">Hidden from selection</div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {message && <p className="msg msg--success" role="status">{message}</p>}

      <form className="panel create-resource" onSubmit={submit} style={{ borderTop: '3px solid #16a34a' }}>
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
                  setForm({ ...form, align: { ...form.align, [a.relationField]: v } }), isPeoSgDisabled(form.align, a))}
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
              setForm({ ...form, align: { ...form.align, [a.relationField]: v } }), isPeoSgDisabled(form.align, a))}
          </label>
        ))}
        {!inlineForm && (alignments
        ? alignments.map((a) => (
            <label className="field" key={a.relationField}>
              <span>{a.label}</span>
              {alignmentSelect(a, form.align[a.relationField] || '', (v) =>
                setForm({ ...form, align: { ...form.align, [a.relationField]: v } }), isPeoSgDisabled(form.align, a))}
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
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : (<><Icon name="plus" size={13} /> Add</>)}</button>
        </div>
      </form>

      {loading ? (
        <div className="program-grid" style={{ marginTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="program-card--2026" style={{ opacity: 0.6 }}>
              <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '40%' }} />
              <div style={{ height: 16, background: '#f1f5f9', borderRadius: 6 }} />
              <div style={{ height: 40, background: '#f8fafc', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="program-panel">
          <div className="program-toolbar">
            <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
              <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
              <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
                Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
              </button>
            </div>
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            <label className="program-search" aria-label={`Search ${title.toLowerCase()}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20L15.5 15.5"/></svg>
              <input className="input input--sm" type="search" placeholder={`Search ${title.toLowerCase()}...`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          {visible.length === 0 ? (
            <div className="program-empty" style={{ marginTop: 14 }}>
              <strong>No {title.toLowerCase()} yet.</strong>
              <span>{query ? `No results for "${query}"` : `Create your first ${title.toLowerCase()} above.`}</span>
            </div>
          ) : viewMode === 'list' ? (
            <div className="resource-list">
              {visible.map((item) => (
                <div key={item.id} className={`resource-card ${isActive(item) ? '' : 'resource-card--archived'}`}>
                  {editingId === item.id ? (
                    <div className="resource-card__edit">
                      <label className="field">
                        <span>{codeLabel}</span>
                        <input className="input input--sm" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} placeholder={codeLabel} />
                      </label>
                      {showTitle && (
                        <label className="field">
                          <span>{titleLabel}</span>
                          {titleMultiline ? (
                            <textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.title} onChange={(e) => { setEditForm({ ...editForm, title: e.target.value }); autoResize(e.target) }} placeholder={titleLabel} />
                          ) : (
                            <input className="input input--sm" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder={titleLabel} />
                          )}
                        </label>
                      )}
                      {(tableAlignments ?? alignments ?? []).map((a) => (
                        <label className="field" key={a.relationField} style={{ marginBottom: 0 }}>
                          <span>{a.label}</span>
                          {alignmentSelect(a, editForm.align[a.relationField] || '', (v) =>
                            setEditForm({ ...editForm, align: { ...editForm.align, [a.relationField]: v } }), isPeoSgDisabled(editForm.align, a))}
                        </label>
                      ))}
                      {!alignments && showDescription && (
                        <label className="field">
                          <span>{descriptionLabel}</span>
                          <textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.description} onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} placeholder={descriptionLabel} />
                        </label>
                      )}
                      <div className="resource-card__actions">
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}><Icon name="check" size={13} /> Save</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="resource-card__body">
                        <h4>{formatCode(codeOf(item))}{showTitle && titleOf(item) ? ` — ${titleOf(item)}` : ''}</h4>
                        {(tableAlignments ?? alignments ?? []).length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {(tableAlignments ?? alignments ?? []).map((a) => (
                              <div key={a.relationField} style={{ fontSize: 12.5, color: '#475569' }}>
                                <strong style={{ color: '#64748b' }}>{a.label}:</strong>{' '}{alignLabelOf(item, a)}
                              </div>
                            ))}
                          </div>
                        )}
                        {!alignments && showDescription && descOf(item) && <p>{descOf(item)}</p>}
                        {counts && <div style={{ fontSize: 12, color: '#64748b' }}>{countLabel}: <strong style={{ color: '#0f172a' }}>{counts[item.id] ?? 0}</strong></div>}
                        <div className="resource-card__meta" style={{ marginTop: 6 }}>
                          <span className={`status-badge status-badge--${isActive(item) ? 'active' : 'archived'}`}>{isActive(item) ? 'Active' : 'Archived'}</span>
                        </div>
                      </div>
                      <div className="resource-card__actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId}><Icon name="edit" size={13} /> Edit</button>
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleUpdate(item.id, { status: isActive(item) ? 'archived' : 'active' }, updateAction)} disabled={busy || !!editingId}>
                          <Icon name={isActive(item) ? 'archive' : 'restore'} size={13} /> {isActive(item) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(item) && allowDelete && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, deleteAction)} disabled={busy || !!editingId} style={{ marginLeft: 'auto' }}><Icon name="trash" size={13} /> Delete</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="program-grid" style={{ marginTop: 14 }}>
              {visible.map((item) => (
                <div key={item.id} className="program-card--2026 card-enter" data-status={isActive(item) ? 'active' : 'archived'}>
                  {editingId === item.id ? (
                    <>
                      <div className="program-card__top">
                        <input className="input input--sm" style={codeWidth ? { width: codeWidth, flex: 1 } : { flex: 1 }} value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} placeholder={codeLabel} />
                      </div>
                      {showTitle && (
                        <div>
                          {titleMultiline ? (
                            <textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.title} onChange={(e) => { setEditForm({ ...editForm, title: e.target.value }); autoResize(e.target) }} placeholder={titleLabel} />
                          ) : (
                            <input className="input input--sm" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder={titleLabel} />
                          )}
                        </div>
                      )}
                      {(tableAlignments ?? alignments ?? []).map((a) => (
                        <div key={a.relationField}>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span>{a.label}</span>
                            {alignmentSelect(a, editForm.align[a.relationField] || '', (v) =>
                              setEditForm({ ...editForm, align: { ...editForm.align, [a.relationField]: v } }), isPeoSgDisabled(editForm.align, a))}
                          </label>
                        </div>
                      ))}
                      {!alignments && showDescription && (
                        <textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.description} onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} placeholder={descriptionLabel} />
                      )}
                      <div className="program-card__actions">
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}><Icon name="check" size={13} /> Save</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="program-card__top">
                        <span className="program-card__code">{formatCode(codeOf(item))}</span>
                        <span className={`program-card__status ${isActive(item) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                          <span className="program-card__status-dot" />{isActive(item) ? 'Active' : 'Archived'}
                        </span>
                      </div>
                      {showTitle && <h3 className="program-card__name">{titleOf(item)}</h3>}
                      {(tableAlignments ?? alignments ?? []).length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {(tableAlignments ?? alignments ?? []).map((a) => (
                            <div key={a.relationField} style={{ fontSize: 12.5, color: '#475569', display: 'flex', gap: 6 }}>
                              <span style={{ fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{a.label}:</span>
                              <span style={{ color: '#0f172a' }}>{alignLabelOf(item, a)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {!alignments && showDescription && <p className="program-card__desc">{descOf(item) || '—'}</p>}
                      {counts && <div style={{ fontSize: 12, color: '#64748b' }}>{countLabel}: <strong style={{ color: '#0f172a' }}>{counts[item.id] ?? 0}</strong></div>}
                      <div className="program-card__actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId}><Icon name="edit" size={13} /> Edit</button>
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleUpdate(item.id, { status: isActive(item) ? 'archived' : 'active' }, updateAction)} disabled={busy || !!editingId}>
                          <Icon name={isActive(item) ? 'archive' : 'restore'} size={13} /> {isActive(item) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(item) && allowDelete && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, deleteAction)} disabled={busy || !!editingId} style={{ marginLeft: 'auto' }}><Icon name="trash" size={13} /> Delete</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
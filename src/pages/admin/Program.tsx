import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import { useSelection } from '../../hooks/useSelection'
import { useViewMode } from '../../hooks/useViewMode'
import ViewModeToggle from '../../components/ViewModeToggle'
import {
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomes,
  createProgram,
  updateProgram,
  deleteProgram,
} from '../../services/database'
import type { Program, Course, ProgramOutcome } from '../../services/database'

const relProgramId = (v: string | { id: string; code: string; name: string } | null | undefined) =>
  v && typeof v === 'object' ? v.id : v || ''

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
  // Browser-only selection: which program the user chose to view in detail.
  const [selectedId, select, clearSelection] = useSelection('cqi.selected.programId')
  // List (default) or grid card style — the user decides per browser.
  const [viewMode, setViewMode] = useViewMode('cqi.viewMode.program')
  const [relatedCourses, setRelatedCourses] = useState<Course[]>([])
  const [relatedOutcomes, setRelatedOutcomes] = useState<ProgramOutcome[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const isActive = (p: Program) => !p.status || p.status === 'active'
  const totalCount = items.length
  const activeCount = items.filter(isActive).length
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

  // Load courses + outcomes linked to the selected program for the details panel.
  useEffect(() => {
    if (!selectedId) {
      setRelatedCourses([])
      setRelatedOutcomes([])
      return
    }
    setRelatedLoading(true)
    Promise.all([fetchCourses(), fetchProgramOutcomes(selectedId)])
      .then(([allCourses, outcomes]) => {
        setRelatedCourses(allCourses.filter((c) => relProgramId(c.program_id) === selectedId))
        setRelatedOutcomes(outcomes)
      })
      .catch(() => {
        setRelatedCourses([])
        setRelatedOutcomes([])
      })
      .finally(() => setRelatedLoading(false))
  }, [selectedId])

  const selectedItem = items.find((p) => p.id === selectedId) ?? null

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
    <div className="programs-page">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">P</div>
          <div className="program-hero__titles">
            <h2>Programs</h2>
            <p>Manage academic programs — add, edit, archive and organize offerings.</p>
          </div>
        </div>
        <div className="program-hero__action">
          <button className="btn btn--primary" onClick={openAdd}>
            + Add New
          </button>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{totalCount}</div>
          <div className="program-stat__sub">All programs</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Active</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="program-stat__sub">Currently offered</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Archived</div>
          <div className="program-stat__value" style={{ color: '#64748b' }}>{archivedCount}</div>
          <div className="program-stat__sub">Hidden from lists</div>
        </div>
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

      <div className="program-panel">
        <div className="program-toolbar">
          <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
            <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>
              Active
            </button>
            <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <label className="program-search" aria-label="Search programs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20L15.5 15.5" />
            </svg>
            <input
              className="input input--sm"
              type="search"
              placeholder="Search programs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <div className="program-grid" style={{ marginTop: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="program-card--2026" style={{ opacity: 0.6 }}>
                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '40%' }} />
                <div style={{ height: 16, background: '#f1f5f9', borderRadius: 6 }} />
                <div style={{ height: 40, background: '#f8fafc', borderRadius: 6 }} />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="program-empty" style={{ marginTop: 14 }}>
            <strong>No {archived ? 'archived' : 'active'} programs yet.</strong>
            <span>{q ? `No results for "${query}"` : archived ? 'Archived programs will appear here.' : 'Click "Add New" to create your first program.'}</span>
          </div>
        ) : viewMode === 'list' ? (
          <div className="resource-list">
            {visible.map((item) => (
              <div
                key={item.id}
                className={`resource-card ${isActive(item) ? '' : 'resource-card--archived'} ${selectedId === item.id ? 'resource-card--selected' : ''}`}
              >
                <div className="resource-card__body">
                  <h4>{item.code}{item.name && item.name !== item.code ? ` — ${item.name}` : ''}</h4>
                  {item.description && <p>{item.description}</p>}
                  <div className="resource-card__meta">
                    <span className={`status-badge status-badge--${isActive(item) ? 'active' : 'archived'}`}>
                      {isActive(item) ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>
                <div className="resource-card__actions">
                  <button
                    className={`btn btn--sm ${selectedId === item.id ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={() => select(item.id)}
                    disabled={busy}
                    aria-pressed={selectedId === item.id}
                  >
                    {selectedId === item.id ? 'Selected' : 'Select'}
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(item)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`}
                    onClick={() => handleArchive(item)}
                    disabled={busy}
                  >
                    {isActive(item) ? 'Archive' : 'Restore'}
                  </button>
                  {!isActive(item) && (
                    <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'program.deleted')} disabled={busy} style={{ marginLeft: 'auto' }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="program-grid" style={{ marginTop: 14 }}>
            {visible.map((item) => (
              <div
                key={item.id}
                className={`program-card--2026 ${selectedId === item.id ? 'program-card--selected' : ''}`}
                data-status={isActive(item) ? 'active' : 'archived'}
                data-selected={selectedId === item.id ? 'true' : 'false'}
              >
                <div className="program-card__top">
                  <span className="program-card__code">{item.code}</span>
                  <span className={`program-card__status ${isActive(item) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                    <span className="program-card__status-dot" />
                    {isActive(item) ? 'Active' : 'Archived'}
                  </span>
                </div>
                <h3 className="program-card__name">{item.name}</h3>
                <p className="program-card__desc">{item.description || 'No description provided.'}</p>
                <div className="program-card__actions">
                  <button
                    className={`btn btn--sm ${selectedId === item.id ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={() => select(item.id)}
                    disabled={busy}
                    aria-pressed={selectedId === item.id}
                  >
                    {selectedId === item.id ? 'Selected' : 'Select'}
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(item)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`}
                    onClick={() => handleArchive(item)}
                    disabled={busy}
                  >
                    {isActive(item) ? 'Archive' : 'Restore'}
                  </button>
                  {!isActive(item) && (
                    <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'program.deleted')} disabled={busy} style={{ marginLeft: 'auto' }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="selection-details" aria-live="polite">
          {selectedItem ? (
            <>
              <div className="selection-details__header">
                <div>
                  <strong>
                    Selected: {selectedItem.code}
                    {selectedItem.name ? ` — ${selectedItem.name}` : ''}
                  </strong>
                  {selectedItem.description && <p>{selectedItem.description}</p>}
                </div>
                <button className="btn btn--ghost btn--sm" onClick={clearSelection}>
                  Clear
                </button>
              </div>
              <div className="selection-details__body">
                {relatedLoading ? (
                  <p>Loading linked courses and outcomes...</p>
                ) : (
                  <>
                    <p>
                      {relatedCourses.length} course{relatedCourses.length === 1 ? '' : 's'} ·{' '}
                      {relatedOutcomes.length} outcome{relatedOutcomes.length === 1 ? '' : 's'}
                    </p>
                    {relatedCourses.length === 0 ? (
                      <p>No courses linked to this program yet.</p>
                    ) : (
                      <ul className="selection-details__list">
                        {relatedCourses.map((c) => (
                          <li key={c.id}>
                            <strong>{c.code}</strong> — {c.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="selection-details__empty">Select a program to see its details, courses, and outcomes.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Admin Program Outcomes: resource-card layout grouped by CMO.
// Form inputs: CMO dropdown, Number, Description.
// Cards show numbered outcomes with edit/archive/delete icon buttons.

import { useEffect, useState } from 'react'
import { useViewMode } from '../../hooks/useViewMode'
import ViewModeToggle from '../../components/ViewModeToggle'
import Icon from '../../components/icons'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
} from '../../services/database'
import type { ProgramOutcomeStandalone, ChedMemoOrder } from '../../services/database'

const FIXED_CMO_OPTIONS = [
  { id: 'fixed-common', title: 'Common to All Programs in All Types of Schools', code: '' },
  { id: 'fixed-bscs', title: 'Bachelor of Science in Computer Science Program Outcomes', code: '' },
  { id: 'fixed-college', title: 'College Defined Program Outcome', code: '' },
]

export default function ProgramOutcomesAdmin() {
  const [items, setItems] = useState<ProgramOutcomeStandalone[]>([])
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setError2] = useState('')
  const [busy, setBusy] = useState(false)
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useViewMode('cqi.viewMode.programOutcomes')
  // Double-click detail view
  const [detail, setDetail] = useState<{ group: string; idx: number; item: ProgramOutcomeStandalone } | null>(null)

  // Form state
  const [cmoId, setCmoId] = useState('')
  const [number, setNumber] = useState('')
  const [description, setDescription] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [pos, c] = await Promise.all([
        fetchProgramOutcomesStandalone('admin'),
        fetchChedMemoOrders(),
      ])
      setItems(pos)
      setCmos(c.filter((x) => x.status === 'active'))
    } catch (e) {
      setError('Unable to load: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const isActive = (i: ProgramOutcomeStandalone) => !i.status || i.status === 'active'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setError2('')
    if (!cmoId || !number.trim() || !description.trim()) {
      setError('CMO, Number, and Description are required.')
      return
    }
    setBusy(true)
    try {
      const code = `PO-${number.trim()}`
      const isFixed = FIXED_CMO_OPTIONS.some((c) => c.id === cmoId)
      await createProgramOutcomeStandalone({
        code,
        title: description.trim(),
        description: description.trim(),
        cmo_id: isFixed ? null : cmoId,
        cmo_text: isFixed ? cmoId : undefined,
        source: 'admin',
      })
      setError2(`Program Outcome ${code} added.`)
      setCmoId('')
      setNumber('')
      setDescription('')
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : String(e)
      setError('Failed to add: ' + msg)
    } finally {
      setBusy(false)
    }
  }

  const handleArchive = async (item: ProgramOutcomeStandalone) => {
    setError('')
    setError2('')
    const next = isActive(item) ? 'archived' : 'active'
    setBusy(true)
    try {
      await updateProgramOutcomeStandalone(item.id, { status: next })
      setError2(`Program Outcome ${next}.`)
      await load()
    } catch (e) {
      setError('Failed to update: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (item: ProgramOutcomeStandalone) => {
    if (!window.confirm('Delete this program outcome permanently?')) return
    setError('')
    setError2('')
    setBusy(true)
    try {
      await deleteProgramOutcomeStandalone(item.id)
      setError2('Program Outcome deleted.')
      await load()
    } catch (e) {
      setError('Failed to delete: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  // Group items by CMO (use cmo_text for fixed options when cmo_id is null)
  const cmoMap = new Map<string, ProgramOutcomeStandalone[]>()
  for (const item of items) {
    const key = item.cmo_id || (item as { cmo_text?: string }).cmo_text || 'uncategorized'
    if (!cmoMap.has(key)) cmoMap.set(key, [])
    cmoMap.get(key)!.push(item)
  }

  // Sort each group by numeric PO order
  const sortPo = (a: ProgramOutcomeStandalone, b: ProgramOutcomeStandalone) => {
    const n = (s: string) => {
      const m = s.match(/PO\D*(\d+)/i)
      return m ? parseInt(m[1], 10) : 9999
    }
    return n(a.code || '') - n(b.code || '')
  }

  const cmoLabel = (id: string) => {
    const fixed = FIXED_CMO_OPTIONS.find((c) => c.id === id)
    if (fixed) return fixed.title
    const cmo = cmos.find((c) => c.id === id)
    return cmo ? `${cmo.title} (${cmo.code})` : '—'
  }

  const filteredGroup = (group: ProgramOutcomeStandalone[]) =>
    group.filter((i) => (archived ? !isActive(i) : isActive(i)))

  const archivedCount = items.filter((i) => !isActive(i)).length

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">PO</div>
          <div className="program-hero__titles">
            <h2>Program Outcomes</h2>
            <p>Add and browse program outcomes by CMO category.</p>
          </div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {success && <p className="msg msg--success" role="status">{success}</p>}

      {/* Add form */}
      <form className="panel create-resource" onSubmit={handleSubmit} style={{ borderTop: '3px solid #16a34a' }}>
        <h3>Add Program Outcome</h3>
        <div className="create-resource__row create-resource__row--2col">
          <label className="field">
            <span>CMO Alignment</span>
            <select className="input" value={cmoId} onChange={(e) => setCmoId(e.target.value)} required>
              <option value="">Select CMO...</option>
              {FIXED_CMO_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
              {cmos.map((c) => (
                <option key={c.id} value={c.id}>{c.title} ({c.code})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Number</span>
            <input
              className="input"
              type="text"
              placeholder="e.g. 1"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea
            className="input"
            rows={3}
            placeholder="Enter program outcome description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : (<><Icon name="plus" size={13} /> Add Program Outcome</>)}
          </button>
        </div>
      </form>

      {/* Categorized resource cards */}
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
            <label className="program-search" aria-label="Search outcomes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20L15.5 15.5" />
              </svg>
              <input
                className="input input--sm"
                type="search"
                placeholder="Search outcomes..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {(() => {
            // Flatten all outcomes into one list with their CMO group and index.
            const allItems: { item: ProgramOutcomeStandalone; group: string; groupIdx: number; idx: number }[] = []
            for (const [cmoIdKey, group] of Array.from(cmoMap.entries())) {
              const visible = filteredGroup(group)
              visible.sort(sortPo)
              visible.forEach((item, idx) => {
                allItems.push({ item, group: cmoIdKey, groupIdx: idx, idx })
              })
            }
            const q = query.trim().toLowerCase()
            const filtered = q
              ? allItems.filter((x) =>
                  [x.item.description || '', x.item.title || '', x.item.code || '', cmoLabel(x.group)]
                    .some((v) => (v || '').toLowerCase().includes(q)))
              : allItems

            if (filtered.length === 0) {
              return (
                <div className="program-empty" style={{ marginTop: 14 }}>
                  <strong>No {archived ? 'archived' : 'active'} outcomes yet.</strong>
                  <span>{q ? `No results for "${query}"` : 'Add your first program outcome above.'}</span>
                </div>
              )
            }

            if (viewMode === 'list') {
              return (
                <div className="resource-list">
                  {filtered.map(({ item, group, idx }) => (
                    <div
                      key={item.id}
                      className={`resource-card ${isActive(item) ? '' : 'resource-card--archived'}`}
                      onDoubleClick={() => setDetail({ group, idx, item })}
                      title="Double-click to view details"
                    >
                      <div className="resource-card__body">
                        <h4>
                          <span style={{ color: '#64748b', marginRight: 8 }}>{idx + 1}.</span>
                          {item.description || item.title || '—'}
                        </h4>
                        <p style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>{cmoLabel(group)}</p>
                        <div className="resource-card__meta">
                          <span className={`status-badge status-badge--${isActive(item) ? 'active' : 'archived'}`}>
                            {isActive(item) ? 'Active' : 'Archived'}
                          </span>
                        </div>
                      </div>
                      <div className="resource-card__actions">
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleArchive(item)}
                          disabled={busy}
                          title={isActive(item) ? 'Archive' : 'Restore'}
                          aria-label={isActive(item) ? `Archive ${item.code}` : `Restore ${item.code}`}
                        >
                          <Icon name={isActive(item) ? 'archive' : 'restore'} size={13} />
                        </button>
                        {!isActive(item) && (
                          <button
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDelete(item)}
                            disabled={busy}
                            style={{ marginLeft: 'auto' }}
                            title="Delete"
                            aria-label={`Delete ${item.code}`}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }

            // Grid view
            return (
              <div className="program-grid" style={{ marginTop: 14 }}>
                {filtered.map(({ item, group, idx }) => (
                  <div
                    key={item.id}
                    className="program-card--2026 card-enter"
                    data-status={isActive(item) ? 'active' : 'archived'}
                    onDoubleClick={() => setDetail({ group, idx, item })}
                    title="Double-click to view details"
                  >
                    <div className="program-card__top">
                      <span className="program-card__code">{item.code}</span>
                      <span className={`program-card__status ${isActive(item) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                        <span className="program-card__status-dot" />
                        {isActive(item) ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    <h3 className="program-card__name">
                      <span style={{ color: '#64748b', marginRight: 6 }}>{idx + 1}.</span>
                      {item.description || item.title || '—'}
                    </h3>
                    <p style={{ fontSize: 12.5, color: '#475569' }}>{cmoLabel(group)}</p>
                    <div className="program-card__actions">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleArchive(item)}
                        disabled={busy}
                        title={isActive(item) ? 'Archive' : 'Restore'}
                        aria-label={isActive(item) ? `Archive ${item.code}` : `Restore ${item.code}`}
                      >
                        <Icon name={isActive(item) ? 'archive' : 'restore'} size={13} />
                      </button>
                      {!isActive(item) && (
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => handleDelete(item)}
                          disabled={busy}
                          style={{ marginLeft: 'auto' }}
                          title="Delete"
                          aria-label={`Delete ${item.code}`}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Selection details — shows the double-clicked outcome */}
          <div className="selection-details" aria-live="polite">
            {detail ? (
              <>
                <div className="selection-details__header">
                  <div>
                    <strong>{cmoLabel(detail.group)}</strong>
                    <p>{detail.idx + 1}. {detail.item.description || detail.item.title || '—'}</p>
                    <div className="resource-card__meta">
                      <span className={`status-badge status-badge--${isActive(detail.item) ? 'active' : 'archived'}`}>
                        {isActive(detail.item) ? 'Active' : 'Archived'}
                      </span>
                    </div>
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <p className="selection-details__empty">Double-click a program outcome to see its details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

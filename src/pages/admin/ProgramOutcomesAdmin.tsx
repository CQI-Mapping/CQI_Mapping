// Admin Program Outcomes: resource-card layout grouped by CMO.
// Form inputs: CMO dropdown, Number, Description.
// Cards show numbered outcomes with edit/archive/delete icon buttons.

import { useEffect, useState } from 'react'
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
        <p>Loading program outcomes...</p>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Active/Archive tabs */}
          <div className="program-toolbar" style={{ marginBottom: 0 }}>
            <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
              <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
              <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
                Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
              </button>
            </div>
          </div>

          {Array.from(cmoMap.entries()).map(([cmoIdKey, group]) => {
            const visible = filteredGroup(group)
            return (
              <div key={cmoIdKey} className="panel table-wrap">
                <h3 style={{ marginBottom: 12 }}>
                  {cmoIdKey === 'uncategorized' ? 'Uncategorized' : cmoLabel(cmoIdKey)}
                </h3>
                {visible.length === 0 ? (
                  <p style={{ color: '#64748b' }}>No {archived ? 'archived' : 'active'} outcomes yet.</p>
                ) : (
                  <div className="resource-list">
                    {[...visible].sort(sortPo).map((item, idx) => (
                      <div
                        key={item.id}
                        className={`resource-card ${isActive(item) ? '' : 'resource-card--archived'}`}
                        onDoubleClick={() => setDetail({ group: cmoIdKey, idx, item })}
                        title="Double-click to view details"
                      >
                        <div className="resource-card__body">
                          <h4>
                            <span style={{ color: '#64748b', marginRight: 8 }}>{idx + 1}.</span>
                            {item.description || item.title || '—'}
                          </h4>
                          <div className="resource-card__meta">
                            <span className={`status-badge status-badge--${isActive(item) ? 'active' : 'archived'}`}>
                              {isActive(item) ? 'Active' : 'Archived'}
                            </span>
                            <span>{item.code}</span>
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
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Detail panel (double-click) */}
      {detail && (
        <div className="selection-details" aria-live="polite" style={{ marginTop: 16 }}>
          <div className="selection-details__header">
            <div>
              <strong>{cmoLabel(detail.group)}</strong>
              <p>{detail.idx + 1}. {detail.item.description || detail.item.title || '—'}</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <div className="selection-details__body">
            <div className="resource-card__meta">
              <span className={`status-badge status-badge--${isActive(detail.item) ? 'active' : 'archived'}`}>
                {isActive(detail.item) ? 'Active' : 'Archived'}
              </span>
              <span>{detail.item.code}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

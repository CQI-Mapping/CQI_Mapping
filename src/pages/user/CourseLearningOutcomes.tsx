// User Course Learning Outcomes page: read-only browse of CLO records.
// Mirrors the admin CLO page's list/grid layout, but has no create / edit /
// archive / delete controls, no closest-PO suggestion picker, and no curation
// log (RLS enforces the same restrictions server-side).

import { useEffect, useState } from 'react'
import { fetchCourseLearningOutcomesStandalone } from '../../services/database'
import { useViewMode } from '../../hooks/useViewMode'
import ViewModeToggle from '../../components/ViewModeToggle'
import type { CourseLearningOutcomeStandalone } from '../../services/database'

function CourseLearningOutcomes() {
  const [items, setItems] = useState<CourseLearningOutcomeStandalone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useViewMode('cqi.viewMode.clo')

  const isActive = (i: CourseLearningOutcomeStandalone) => !i.status || i.status === 'active'
  const q = query.trim().toLowerCase()
  const visible = items
    .filter((i) => (archived ? !isActive(i) : isActive(i)))
    .filter((i) => !q || [i.course, i.code, i.description, i.title].some((v) => (v || '').toLowerCase().includes(q)))
  const archivedCount = items.filter((i) => !isActive(i)).length

  useEffect(() => {
    let cancelled = false
    fetchCourseLearningOutcomesStandalone()
      .then((rows) => { if (!cancelled) setItems(rows) })
      .catch((e: unknown) => {
        if (!cancelled) setError('Unable to load course learning outcomes: ' + (e instanceof Error ? e.message : String(e)))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const totalCount = items.length
  const activeCount = items.filter(isActive).length

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">CLO</div>
          <div className="program-hero__titles">
            <h2>Course Learning Outcomes</h2>
            <p>Browse the CLOs published for each subject and their Program Outcome alignments.</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{totalCount}</div>
          <div className="program-stat__sub">All CLOs</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Active</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="program-stat__sub">Currently mapped</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Archived</div>
          <div className="program-stat__value">{archivedCount}</div>
          <div className="program-stat__sub">Hidden</div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}

      {loading ? (
        <div className="program-grid" style={{ marginTop: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="program-card--2026">
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
            <label className="program-search" aria-label="Search CLOs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20L15.5 15.5"/></svg>
              <input className="input input--sm" type="search" placeholder="Search CLOs..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          {visible.length === 0 ? (
            <div className="program-empty" style={{ marginTop: 14 }}>
              <strong>No course learning outcomes yet.</strong>
              <span>{query ? `No results for "${query}"` : 'Nothing published yet.'}</span>
            </div>
          ) : viewMode === 'list' ? (
            <div className="resource-list">
              {visible.map((item) => (
                <div key={item.id} className={`resource-card ${isActive(item) ? '' : 'resource-card--archived'}`}>
                  <div className="resource-card__body">
                    <h4>{item.code} — {item.course || 'No course'}</h4>
                    {item.description && <p>{item.description}</p>}
                    <div style={{ fontSize: 12.5, background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px', color: '#475569', marginTop: 6 }}>
                      <strong style={{ color: '#64748b' }}>POs:</strong> {item.title || '—'}
                    </div>
                    <div className="resource-card__meta" style={{ marginTop: 6 }}>
                      <span className={`status-badge status-badge--${isActive(item) ? 'active' : 'archived'}`}>{isActive(item) ? 'Active' : 'Archived'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="program-grid" style={{ marginTop: 14 }}>
              {visible.map((item) => (
                <div key={item.id} className="program-card--2026 card-enter" data-status={isActive(item) ? 'active' : 'archived'}>
                  <div className="program-card__top">
                    <span className="program-card__code">{item.code}</span>
                    <span className="program-card__status" style={{ background: '#f1f5f9', color: '#64748b', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>{item.course || '—'}</span>
                    <span className={`program-card__status ${isActive(item) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                      <span className="program-card__status-dot" />{isActive(item) ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <p className="program-card__desc">{item.description || 'No description.'}</p>
                  <div style={{ fontSize: 12.5, background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px', color: '#475569' }}>
                    <strong style={{ color: '#64748b' }}>POs:</strong> {item.title || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CourseLearningOutcomes
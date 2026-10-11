// User Curriculum page: read-only browse of published curriculum records.
// No create/edit/archive/delete controls for this role (RLS enforces the same).

import { useState, useEffect } from 'react'
import { fetchResources, fetchCourses } from '../../services/database'
import { useSelection } from '../../hooks/useSelection'
import type { Resource, Course } from '../../services/database'

const relId = (v: string | { id: string } | null | undefined) =>
  v && typeof v === 'object' ? v.id : v || ''

function Curriculum() {
  const [items, setItems] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archived, setArchived] = useState(false)
  const [selectedId, select, clearSelection] = useSelection('cqi.selected.curriculumId')
  const [relatedCourses, setRelatedCourses] = useState<Course[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  const isActive = (i: Resource) => !i.status || i.status === 'active'
  const visible = items.filter((i) => (archived ? !isActive(i) : isActive(i)))
  const archivedCount = items.filter((i) => !isActive(i)).length

  // Fetch the list from the DB.
  useEffect(() => {
    fetchResources()
      .then(setItems)
      .catch((e: unknown) => setError('Unable to load resources: ' + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setRelatedCourses([])
      return
    }
    setRelatedLoading(true)
    fetchCourses()
      .then((all) => setRelatedCourses(all.filter((c) => relId(c.curriculum_id) === selectedId)))
      .catch(() => setRelatedCourses([]))
      .finally(() => setRelatedLoading(false))
  }, [selectedId])

  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  return (
    <div className="resources">
      <div className="page-heading">
        <h2>Curriculum</h2>
        <p>Browse published curriculum records.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}

      {loading ? (
        <p>Loading curriculum...</p>
      ) : (
        <div className="panel table-wrap">
          <div className="sd-tabs">
            <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
            <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
          <div className="resource-list">
            {visible.length === 0 && <p>No {archived ? 'archived' : 'active'} curriculum records.</p>}
            {visible.map((item) => (
              <div
                className={`resource-card ${item.status === 'archived' ? 'resource-card--archived' : ''} ${selectedId === item.id ? 'resource-card--selected' : ''}`}
                key={item.id}
              >
                <div className="resource-card__body">
                  <h4>{item.code || item.title}</h4>
                  {item.description && <p>{item.description}</p>}
                  <div className="resource-card__meta">
                    <span className={`status-badge status-badge--${item.status}`}>{item.status}</span>
                    {item.units != null && <span>{item.units} unit{item.units === 1 ? '' : 's'}</span>}
                    <span>by {(typeof item.created_by === 'object' && item.created_by?.full_name) || 'Unknown'}</span>
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="resource-card__actions">
                  <button
                    className={`btn btn--sm ${selectedId === item.id ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={() => select(item.id)}
                    aria-pressed={selectedId === item.id}
                  >
                    {selectedId === item.id ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="selection-details" aria-live="polite">
            {selectedItem ? (
              <>
                <div className="selection-details__header">
                  <div>
                    <strong>Selected: {selectedItem.code || selectedItem.title}</strong>
                    {selectedItem.description && <p>{selectedItem.description}</p>}
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={clearSelection}>
                    Clear
                  </button>
                </div>
                <div className="selection-details__body">
                  {relatedLoading ? (
                    <p>Loading linked courses...</p>
                  ) : relatedCourses.length === 0 ? (
                    <p>No courses linked to this curriculum yet.</p>
                  ) : (
                    <ul className="selection-details__list">
                      {relatedCourses.map((c) => (
                        <li key={c.id}>
                          <strong>{c.code}</strong> — {c.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="selection-details__empty">Select a curriculum to see its details and linked courses.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Curriculum

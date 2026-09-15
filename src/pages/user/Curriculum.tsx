// User Curriculum page: read-only browse of published curriculum records.
// No create/edit/archive/delete controls for this role (RLS enforces the same).

import { useState, useEffect } from 'react'
import { fetchResources } from '../../services/database'
import type { Resource } from '../../services/database'

function Curriculum() {
  const [items, setItems] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archived, setArchived] = useState(false)

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
              <div className={`resource-card ${item.status === 'archived' ? 'resource-card--archived' : ''}`} key={item.id}>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Curriculum

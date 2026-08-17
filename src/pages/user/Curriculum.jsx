// User Curriculum page: read-only browse of published curriculum records.
// No create/edit/archive/delete controls for this role (RLS enforces the same).

import { useState, useEffect } from 'react'
import { fetchResources } from '../../services/database'

function Curriculum() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch the list from the DB.
  useEffect(() => {
    fetchResources()
      .then(setItems)
      .catch((e) => setError('Unable to load resources: ' + e.message))
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
        <div className="resource-list">
          {items.length === 0 && <p>No curriculum records yet.</p>}
          {items.map((item) => (
            <div className={`resource-card ${item.status === 'archived' ? 'resource-card--archived' : ''}`} key={item.id}>
              <div className="resource-card__body">
                <h4>{item.title}</h4>
                {item.description && <p>{item.description}</p>}
                <div className="resource-card__meta">
                  <span className={`status-badge status-badge--${item.status}`}>{item.status}</span>
                  <span>by {item.created_by?.full_name || 'Unknown'}</span>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Curriculum

// Manager Audit Log page: shows the latest 100 recorded actions.
// Only admins and managers can reach this page (RLS blocks users from reading audit_log).

import { useState, useEffect } from 'react'
import { fetchAuditLog } from '../../services/database'

function AuditLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch once on mount.
  useEffect(() => {
    fetchAuditLog()
      .then(setEntries)
      .catch((e) => setError('Unable to load audit log: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="audit-log">
      <div className="page-heading">
        <h2>Audit Log</h2>
        <p>Record of actions taken in the system (latest 100).</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}

      {loading ? (
        <p>Loading audit log...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan="4">No entries yet.</td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>{entry.user_email || '—'}</td>
                  <td><code>{entry.action}</code></td>
                  <td className="table__details">{JSON.stringify(entry.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AuditLog

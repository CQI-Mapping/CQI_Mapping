// Manager Users page: read-only faculty directory.
// Shows all user profiles with role badges; role changes are admin-only.

import { useState, useEffect } from 'react'
import { fetchAllProfiles } from '../../services/database'

function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch the full user list.
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAllProfiles()
      setUsers(data)
    } catch (e) {
      setError('Unable to load users: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Faculty Directory</h2>
        <p>Browse faculty profiles. Role changes are admin-only.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name || '—'}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-badge role-badge--${u.role}`}>{u.role}</span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Users

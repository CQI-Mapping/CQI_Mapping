// Manager Users page: read-only faculty directory.
// Account creation, role changes, and removal are admin-only
// (the admin-users Edge Function requires the admin role, so a
// manager calling it would always get 403 - RLS enforces the same).

import { useState, useEffect } from 'react'
import { fetchAllProfiles } from '../../services/database'
import type { Profile } from '../../services/database'

function Users() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await fetchAllProfiles())
    } catch (e) {
      setError('Unable to load users: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Users</h2>
        <p>Faculty directory (read-only). Account creation and removal are admin-only.</p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="panel table-wrap" style={{ marginTop: 16 }}>
          <h3>All Users</h3>
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

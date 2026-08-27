// Admin Users page: create new manager accounts.
// Minimal page with a form to add a manager by email, password, and full name.

import { useState, useEffect } from 'react'
import { adminCreateUser, addActivityLog, fetchAllProfiles } from '../../services/database'
import type { Profile } from '../../services/database'

function Users() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const loadUsers = async () => {
    setLoading(true)
    try {
      setUsers(await fetchAllProfiles())
    } catch (e) {
      setError('Unable to load users: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.')
      return
    }

    setBusy(true)
    try {
      await adminCreateUser(email.trim(), password, fullName.trim(), 'manager')
      await addActivityLog(email.trim(), 'user.created')
      setSuccess(`Manager ${email} created.`)
      setEmail('')
      setPassword('')
      setFullName('')
      loadUsers()
    } catch (e) {
      setError('Failed to create manager: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Users &amp; Accounts</h2>
        <p>Create new manager accounts.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {success && <p className="msg msg--success">{success}</p>}

      <div className="panel create-user">
        <h3>Add Manager</h3>
        <form onSubmit={handleSubmit}>
          <div className="create-user__row">
            <label className="field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                placeholder="manager@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="password-wrapper">
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="field">
              <span>Full name</span>
              <input
                className="input"
                type="text"
                placeholder="Juan Dela Cruz"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create Manager'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel table-wrap" style={{ marginTop: 16 }}>
        <h3>All Users</h3>
        {loading ? (
          <p>Loading users...</p>
        ) : (
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
        )}
      </div>
    </div>
  )
}

export default Users

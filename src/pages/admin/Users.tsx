// Admin Users page: create new manager accounts.
// Minimal page with a form to add a manager by email, password, and full name.

import { useState } from 'react'
import { adminCreateUser, addActivityLog } from '../../services/database'

function Users() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      await addActivityLog('user.created')
      setSuccess(`Manager ${email} created.`)
      setEmail('')
      setPassword('')
      setFullName('')
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
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create Manager'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Users

// Admin Users page: create new manager accounts and list all users.

import { useState, useEffect } from 'react'
import { useDraft } from '../../hooks/useDraft'
import { adminCreateUser, addActivityLog, fetchAllProfiles } from '../../services/database'
import type { Profile } from '../../services/database'

export default function Users() {
  // Draft persists email + name across page navigation. The password is
  // deliberately kept in memory-only state and never written to storage.
  const [draft, setDraft, clearDraft] = useDraft('cqi.draft.Users', { email: '', fullName: '' })
  const { email, fullName } = draft
  const setEmail = (v: string) => setDraft((d) => ({ ...d, email: v }))
  const setFullName = (v: string) => setDraft((d) => ({ ...d, fullName: v }))
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const loadUsers = async () => {
    setLoading(true)
    try { setUsers(await fetchAllProfiles()) }
    catch (e) { setError('Unable to load users: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadUsers() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!email.trim() || !password.trim()) { setError('Email and password are required.'); return }
    setBusy(true)
    try {
      await adminCreateUser(email.trim(), password, fullName.trim(), 'manager')
      await addActivityLog(email.trim(), 'user.created')
      setSuccess(`Manager ${email} created.`)
      clearDraft()
      setPassword('')
      loadUsers()
    } catch (e) {
      setError('Failed to create manager: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  const totalUsers = users.length
  const activeManagers = users.filter((u) => u.role === 'manager').length

  return (
    <div className="programs-page users">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">U</div>
          <div className="program-hero__titles">
            <h2>Users &amp; Accounts</h2>
            <p>Create manager accounts and audit user roles — admin-only.</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total users</div>
          <div className="program-stat__value">{totalUsers}</div>
          <div className="program-stat__sub">All roles</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Managers</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{activeManagers}</div>
          <div className="program-stat__sub">Faculty / managers</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Status</div>
          <div className="program-stat__value" style={{ fontSize: 16, color: '#0f172a' }}>Secure</div>
          <div className="program-stat__sub">Admin-managed</div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {success && <p className="msg msg--success" role="status">{success}</p>}

      <div className="panel create-user" style={{ borderTop: '3px solid #16a34a' }}>
        <h3>Add Manager</h3>
        <form onSubmit={handleSubmit}>
          <div className="create-user__row">
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" placeholder="manager@example.com" value={email} required
                onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="password-wrapper">
                <input className="input" type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••" value={password} required
                  onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="field">
              <span>Full name</span>
              <input className="input" type="text" placeholder="Juan Dela Cruz" value={fullName}
                onChange={(e) => setFullName(e.target.value)} />
            </label>
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create Manager'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel table-wrap program-panel" style={{ marginTop: 0 }}>
        <h3>All Users</h3>
        {loading ? (
          <div className="program-grid" style={{ marginTop: 12 }}>
            {[0,1,2].map((i) => (
              <div key={i} className="program-card--2026" style={{ opacity: 0.6 }}>
                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '40%' }} />
                <div style={{ height: 16, background: '#f1f5f9', borderRadius: 6 }} />
                <div style={{ height: 12, background: '#f8fafc', borderRadius: 6, width: '60%' }} />
              </div>
            ))}
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name || '—'}</td>
                  <td>{u.email}</td>
                  <td><span className={`role-badge role-badge--${u.role}`}>{u.role}</span></td>
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

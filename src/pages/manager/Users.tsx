// Manager Users page: faculty directory + add faculty accounts.
// Managers may create 'user' (faculty) accounts only — the admin-users Edge
// Function forces the role to 'user' for manager callers. Role changes and
// removal stay admin-only.

import { useState, useEffect } from 'react'
import Icon from '../../components/icons'
import { adminCreateUser, addActivityLog, fetchAllProfiles } from '../../services/database'
import { supabase } from '../../utils/supabaseClient'
import type { Profile } from '../../services/database'

function Users() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatorName, setCreatorName] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const profiles = await fetchAllProfiles()
      setUsers(profiles)
      try {
        const { data } = await supabase!.auth.getUser()
        const me = profiles.find((u) => u.id === data?.user?.id)
        setCreatorName(me?.full_name || me?.email || '')
      } catch {
        // Name stays blank — the notification still shows the added email.
      }
    } catch (e) {
      setError('Unable to load users: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!email.trim() || !password.trim()) { setError('Email and password are required.'); return }
    setBusy(true)
    try {
      const createdEmail = email.trim()
      const created = await adminCreateUser(createdEmail, password, fullName.trim(), 'user')
      await addActivityLog('user.created')
      const base = creatorName
        ? `Faculty ${createdEmail} has been added to the system by ${creatorName}.`
        : `Faculty ${createdEmail} has been added to the system.`
      setSuccess(
        created.welcomeEmailSent
          ? `${base} A welcome email was sent to ${createdEmail}.`
          : `${base} No welcome email was sent (email service not set up) — please tell them their login directly.`,
      )
      setEmail('')
      setPassword('')
      setFullName('')
      load()
    } catch (e) {
      setError('Failed to create faculty: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Users</h2>
        <p>Faculty directory. You can add faculty accounts; role changes and removal are admin-only.</p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {success && <p className="msg msg--success" role="status">{success}</p>}

      <div className="panel create-user" style={{ borderTop: '3px solid #16a34a' }}>
        <h3>Add Faculty</h3>
        <form onSubmit={handleSubmit}>
          <div className="create-user__row">
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" placeholder="faculty@example.com" value={email} required
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
              {busy ? 'Creating...' : (<><Icon name="plus" size={13} /> Create Faculty</>)}
            </button>
          </div>
        </form>
      </div>

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

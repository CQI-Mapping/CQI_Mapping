// Manager Users page: faculty directory + add faculty accounts.
// Managers may create 'user' (faculty) accounts only — the admin-users Edge
// Function forces the role to 'user' for manager callers. Role changes and
// removal stay admin-only.
//
// Add Faculty collects just the email: the Edge Function generates the
// account password server-side and emails the faculty member a one-time
// "set your password" link, so the person adding the account never handles
// a password and the new faculty sets their own.

import { useState, useEffect } from 'react'
import Icon from '../../components/icons'
import { adminCreateUser, addActivityLog, fetchAllProfiles } from '../../services/database'
import { isActive } from '../../utils/report'
import { supabase } from '../../utils/supabaseClient'
import type { Profile } from '../../services/database'

function Users() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatorName, setCreatorName] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const profiles = await fetchAllProfiles()
      // Faculty directory scope: admin accounts are not this page's business —
      // managers add faculty and review accounts, they don't administer admins —
      // and archived accounts are parked (their sign-in is refused), so both
      // are filtered out of the table. The inviter-name lookup below still
      // reads the full list.
      setUsers(profiles.filter((u) => u.role !== 'admin' && isActive(u)))
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
    if (!email.trim()) { setError('Email is required.'); return }
    setBusy(true)
    try {
      const createdEmail = email.trim()
      // Empty password/name by design: the Edge Function generates a random
      // password the inviter never sees and emails a one-time set-password
      // link; the name is left blank until the faculty member fills it in
      // on their Profile page.
      const created = await adminCreateUser(createdEmail, '', '', 'user')
      await addActivityLog('user.created', {
        entity: 'user',
        entity_id: created?.id,
        label: createdEmail,
      })
      const base = creatorName
        ? `Faculty ${createdEmail} has been added to the system by ${creatorName}.`
        : `Faculty ${createdEmail} has been added to the system.`
      setSuccess(
        created.welcomeEmailSent
          ? `${base} A welcome email was sent to ${createdEmail} with a one-time link to set their password.`
          : `${base} No welcome email was sent (email service not set up) — please tell them to use "Forgot password" on the sign-in page to choose one.`,
      )
      setEmail('')
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
          <div className="create-user__row create-user__row--email-only">
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" placeholder="faculty@example.com" value={email} required
                onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
              {busy ? 'Creating...' : (<><Icon name="plus" size={13} /> Create Faculty</>)}
            </button>
          </div>
          <p className="create-user__hint">
            <Icon name="mail" size={14} />
            Only an email is needed. The faculty member gets an email with a one-time link to
            set their password, and can fill in their name on their Profile page.
          </p>
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

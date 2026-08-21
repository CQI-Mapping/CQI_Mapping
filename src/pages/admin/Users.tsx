// Admin Users page: full account management.
//  - Table of all users with an inline role dropdown.
//  - "Create user" form (needs the service role key).
// Every change writes an audit entry.

import { useState, useEffect } from 'react'
import {
  fetchAllProfiles,
  updateUserRole,
  adminCreateUser,
  addActivityLog,
} from '../../services/database'
import { supabase } from '../../utils/supabaseClient'
import type { Profile, UserRole } from '../../services/database'

// The selectable roles (must match the user_role enum in the DB).
const ROLES: UserRole[] = ['admin', 'manager', 'user']

interface CreateForm {
  email: string
  password: string
  fullName: string
  role: UserRole
}

function Users() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Create-user form state.
  const [form, setForm] = useState<CreateForm>({ email: '', password: '', fullName: '', role: 'user' })
  const [creating, setCreating] = useState(false)

  // Fetch the full user list.
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAllProfiles()
      setUsers(data)
    } catch (e) {
      setError('Unable to load users: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Read the current user's email for the audit log entry.
  const currentUserEmail = async () => {
    const { data } = await supabase!.auth.getUser()
    return data?.user?.email ?? ''
  }

  // Change a user's role, then write an audit entry.
  const handleRoleChange = async (profileId: string, newRole: string) => {
    setError('')
    setMessage('')
    try {
      await updateUserRole(profileId, newRole as UserRole)
      const email = await currentUserEmail()
      await addActivityLog(email, 'role.updated', { profileId, newRole })
      setMessage('Role updated.')
      load()
    } catch (e) {
      setError('Failed to update role: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // Create a new auth user (email_confirm true = can sign in immediately),
  // then log it. Requires VITE_SUPABASE_SERVICE_ROLE_KEY in .env.
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setCreating(true)
    try {
      const created = await adminCreateUser(
        form.email.trim(),
        form.password,
        form.fullName.trim(),
        form.role
      )
      const email = await currentUserEmail()
      await addActivityLog(email, 'user.created', {
        createdEmail: created.email,
        role: form.role,
      })
      setMessage(`User ${created.email} created.`)
      setForm({ email: '', password: '', fullName: '', role: 'user' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Users &amp; Accounts</h2>
        <p>Manage accounts and roles.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-user" onSubmit={handleCreate}>
        <h3>Create user</h3>
        <p className="panel__hint">
          Requires VITE_SUPABASE_SERVICE_ROLE_KEY in .env. New users can sign in immediately.
        </p>
        <div className="create-user__row">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
          />
          <input
            className="input"
            type="text"
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button className="btn btn--primary" type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>

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
                    <select
                      className="input input--sm"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
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

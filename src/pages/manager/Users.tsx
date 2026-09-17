import { useState, useEffect } from 'react'
import { useDraft } from '../../hooks/useDraft'
import { fetchAllProfiles, adminCreateUser, adminDeleteUser, addActivityLog } from '../../services/database'
import type { Profile } from '../../services/database'

interface UsersProps {
  userEmail: string
}

function Users({ userEmail }: UsersProps) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Draft persists email + name across page navigation. The password stays
  // in memory-only state and is never written to storage.
  const [draft, setDraft, clearDraft] = useDraft('cqi.draft.Faculty', { email: '', name: '' })
  const { email: newEmail, name: newName } = draft
  const setNewEmail = (v: string) => setDraft((d) => ({ ...d, email: v }))
  const setNewName = (v: string) => setDraft((d) => ({ ...d, name: v }))
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!newEmail.trim() || !newPassword.trim()) {
      setError('Email and password are required.')
      return
    }
    setCreating(true)
    try {
      await adminCreateUser(newEmail.trim(), newPassword, newName.trim(), 'user')
      setSuccess(`Faculty member ${newEmail} created.`)
      addActivityLog('user.created')
      clearDraft()
      setNewPassword('')
      load()
    } catch (e) {
      setError('Failed to create user: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Remove faculty member ${email}? This cannot be undone.`)) return
    setError('')
    setSuccess('')
    try {
      await adminDeleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      setSuccess(`Faculty member ${email} removed.`)
      addActivityLog('user.deleted')
    } catch (e) {
      setError('Failed to remove user: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Faculty Directory</h2>
        <p>Browse faculty profiles and add new members.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {success && <p className="msg msg--success">{success}</p>}

      <div className="panel create-user">
        <h3>Add Faculty Member</h3>
        <form onSubmit={handleCreate}>
          <div className="create-user__row">
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <input
              className="input"
              type="text"
              placeholder="Full name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn--primary" type="submit" disabled={creating}>
              {creating ? 'Adding...' : 'Add Faculty'}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="panel table-wrap" style={{ marginTop: 16 }}>
          <h3>All Faculty</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th></th>
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
                  <td>
                    {u.role === 'user' && u.email !== userEmail && (
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => handleDelete(u.id, u.email)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
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

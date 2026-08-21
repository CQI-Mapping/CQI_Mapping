import { useState, useEffect } from 'react'
import { fetchAllProfiles, updateUserRole, adminCreateUser, adminDeleteUser, addActivityLog } from '../../services/database'
import type { Profile, UserRole } from '../../services/database'

interface UsersProps {
  userEmail: string
}

function Users({ userEmail }: UsersProps) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('user')
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

  const handleRoleChange = async (profileId: string, newRole: UserRole) => {
    setError('')
    setSuccess('')
    try {
      const updated = await updateUserRole(profileId, newRole)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setSuccess(`Role updated to ${newRole}.`)
      addActivityLog(userEmail, 'role.updated')
    } catch (e) {
      setError('Failed to update role: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

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
      await adminCreateUser(newEmail.trim(), newPassword, newName.trim(), newRole)
      setSuccess(`User ${newEmail} created.`)
      addActivityLog(userEmail, 'user.created')
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      setNewRole('user')
      load()
    } catch (e) {
      setError('Failed to create user: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return
    setError('')
    setSuccess('')
    try {
      await adminDeleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      setSuccess(`User ${email} deleted.`)
      addActivityLog(userEmail, 'user.deleted')
    } catch (e) {
      setError('Failed to delete user: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="users">
      <div className="page-heading">
        <h2>Users &amp; Accounts</h2>
        <p>Manage user accounts, roles, and create new users.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {success && <p className="msg msg--success">{success}</p>}

      <div className="panel create-user">
        <h3>Create New User</h3>
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
            <select
              className="input"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            >
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn--primary" type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>All Users</h3>
        {loading ? (
          <p>Loading users...</p>
        ) : (
          <div className="table-wrap">
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
                      <select
                        className="input input--sm"
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      {u.email !== userEmail && (
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => handleDelete(u.id, u.email)}
                        >
                          Delete
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
    </div>
  )
}

export default Users

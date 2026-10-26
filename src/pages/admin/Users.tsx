// Admin Users page: create new accounts (admin, manager, or faculty) and list all users.

import { useState, useEffect } from 'react'
import Icon from '../../components/icons'
import { useDraft } from '../../hooks/useDraft'
import { adminCreateUser, adminDeleteUser, addActivityLog, fetchAllProfilesWithProgram, fetchPrograms, profileProgramOf, updateUserRole } from '../../services/database'
import { supabase } from '../../utils/supabaseClient'
import type { ProfileWithProgram, Program, UserRole } from '../../services/database'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  user: 'Faculty',
}

export default function Users() {
  // Draft persists email + name across page navigation. The password is
  // deliberately kept in memory-only state and never written to storage.
  const [draft, setDraft, clearDraft] = useDraft('cqi.draft.Users', { email: '', fullName: '' })
  const { email, fullName } = draft
  const setEmail = (v: string) => setDraft((d) => ({ ...d, email: v }))
  const setFullName = (v: string) => setDraft((d) => ({ ...d, fullName: v }))
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Role starts unselected: the placeholder option forces a conscious
  // pick (Manager/Admin/Faculty) instead of a silent default.
  const [role, setRole] = useState<UserRole | ''>('')
  // Program assignment for manager/faculty accounts (hidden for admins,
  // and until a role that needs one is actually chosen).
  const [programId, setProgramId] = useState('')
  const [programs, setPrograms] = useState<Program[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [users, setUsers] = useState<ProfileWithProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [currentEmail, setCurrentEmail] = useState('')
  const [roleBusyId, setRoleBusyId] = useState('')
  const [deleteBusyId, setDeleteBusyId] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    try { setUsers(await fetchAllProfilesWithProgram()) }
    catch (e) { setError('Unable to load users: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadUsers()
    fetchPrograms()
      .then(setPrograms)
      .catch(() => { /* dropdown shows its empty state; creating still possible for admins */ })
    supabase?.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setCurrentEmail(data.user.email)
    }).catch(() => { /* keep empty; self-guard falls back to allowing row actions */ })
  }, [])

  // The Program field only meaningfully pairs with a scoped role — it
  // stays hidden until Manager or Faculty is actually picked.
  const roleNeedsProgram = role === 'manager' || role === 'user'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!role) { setError('Please select a role for this account.'); return }
    if (!email.trim() || !password.trim()) { setError('Email and password are required.'); return }
    // Managers and faculty are program-scoped accounts — the program is
    // required so the dropdown choice can't silently be forgotten.
    if (roleNeedsProgram && !programId) { setError('Choose the program this account belongs to.'); return }
    setBusy(true)
    try {
      const createdEmail = email.trim()
      const created = await adminCreateUser(createdEmail, password, fullName.trim(), role, programId || null)
      await addActivityLog('user.created', {
        entity: 'user',
        entity_id: created?.id,
        label: createdEmail,
      })
      const creator = users.find((u) => u.email === currentEmail)
      const creatorName = creator?.full_name || currentEmail
      const base = creatorName
        ? `${ROLE_LABELS[role]} ${createdEmail} has been added to the system by ${creatorName}.`
        : `${ROLE_LABELS[role]} ${createdEmail} has been added to the system.`
      setSuccess(
        created.welcomeEmailSent
          ? `${base} A welcome email was sent to ${createdEmail}.`
          : `${base} No welcome email was sent (email service not set up) — please tell them their login directly.`,
      )
      clearDraft()
      setPassword('')
      // The next creation is a fresh conscious pick: role and program reset
      // with the credentials so an earlier assignment can't be reused.
      setRole('')
      setProgramId('')
      loadUsers()
    } catch (e) {
      setError('Failed to create user: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  const handleRoleChange = async (profileId: string, nextRole: UserRole, email: string) => {
    if (email === currentEmail && !window.confirm(`Change your own role to ${nextRole}? You could lose admin access.`)) return
    setError('')
    setSuccess('')
    setRoleBusyId(profileId)
    try {
      const updated = await updateUserRole(profileId, nextRole)
      setUsers((prev) => prev.map((u) => (u.id === profileId ? updated : u)))
      await addActivityLog('role.updated', {
        entity: 'user',
        entity_id: profileId,
        label: `${email} → ${nextRole}`,
      })
      setSuccess(`Role for ${email} changed to ${nextRole}.`)
    } catch (e) {
      setError('Failed to update role: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setRoleBusyId('')
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Remove user ${email}? This cannot be undone.`)) return
    setError('')
    setSuccess('')
    setDeleteBusyId(userId)
    try {
      await adminDeleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      await addActivityLog('user.deleted', { entity: 'user', entity_id: userId, label: email })
      setSuccess(`User ${email} removed.`)
    } catch (e) {
      setError('Failed to remove user: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeleteBusyId('')
    }
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
            <p>Create admin, manager, or faculty accounts — admin-only.</p>
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

      {/* Add User — the persona-card concept from design/add-user-redesign.html:
          fields grouped by intent (who the person is, then how they sign in),
          the role as three explainer cards instead of a blind dropdown, and a
          program field that only exists when the role actually scopes one. */}
      <div className="panel au">
        <div className="au__head">
          <h3><span className="au__badge" aria-hidden="true">＋</span>Add User</h3>
          <p>Creates the account immediately — everything can be changed later in Profile.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="au__body">
            {/* 1 · Who is this person */}
            <div>
              <div className="au__section-title"><span className="au__step">1</span>Who is this person</div>
              <div className="au__who">
                <label className="field">
                  <span>Full name</span>
                  <input className="input" type="text" placeholder="Juan Dela Cruz" value={fullName}
                    onChange={(e) => setFullName(e.target.value)} />
                </label>
                <div className="field">
                  <span>Role</span>
                  <div className="role-cards" role="group" aria-label="Role">
                    <button type="button" className="role-card" aria-pressed={role === 'admin'}
                      onClick={() => setRole('admin')}>
                      <span className="rc-tick" aria-hidden="true"><Icon name="check" size={9} strokeWidth={3.6} /></span>
                      <span className="rc-head">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
                        </svg>
                        Administrator
                      </span>
                      <p className="rc-desc">Runs the whole system — programs, accounts, reports. Not bounded to one program.</p>
                    </button>
                    <button type="button" className="role-card" aria-pressed={role === 'manager'}
                      onClick={() => setRole('manager')}>
                      <span className="rc-tick" aria-hidden="true"><Icon name="check" size={9} strokeWidth={3.6} /></span>
                      <span className="rc-head">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="7" width="18" height="13" rx="2" />
                          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Program Head
                      </span>
                      <p className="rc-desc">Leads CQI for one program — outcomes, alignment and that program's courses.</p>
                    </button>
                    <button type="button" className="role-card" aria-pressed={role === 'user'}
                      onClick={() => setRole('user')}>
                      <span className="rc-tick" aria-hidden="true"><Icon name="check" size={9} strokeWidth={3.6} /></span>
                      <span className="rc-head">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M7 10h10M7 14h6" />
                        </svg>
                        Faculty
                      </span>
                      <p className="rc-desc">Teaches assigned subjects and tracks CLO progress for their own classes.</p>
                    </button>
                  </div>
                </div>
              </div>

              {role === 'admin' ? (
                <div className="au__hint">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16.5v.5" />
                  </svg>
                  Administrators see every program — no assignment needed.
                </div>
              ) : roleNeedsProgram ? (
                <label className="field au__program">
                  <span>Program</span>
                  <div className="au__select">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" />
                    </svg>
                    <select
                      className="input"
                      value={programId}
                      required
                      disabled={busy || programs.length === 0}
                      onChange={(e) => setProgramId(e.target.value)}
                    >
                      <option value="">
                        {programs.length === 0 ? 'No programs on file — add one first' : 'Select program…'}
                      </option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                  </div>
                </label>
              ) : null}
            </div>

            {/* 2 · How they sign in */}
            <div>
              <div className="au__section-title"><span className="au__step">2</span>How they sign in</div>
              <div className="au__creds">
                <label className="field">
                  <span>Email</span>
                  <div className="au-mail">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-10 6L2 7" />
                    </svg>
                    <input className="input" type="email" placeholder="user@example.com" value={email} required
                      onChange={(e) => setEmail(e.target.value)} />
                  </div>
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
                <p className="au__cred-note">
                  At least 6 characters — the new user can change it after signing in, or reset it from the sign-in page themselves.
                </p>
              </div>
            </div>
          </div>

          <div className="au__foot">
            <p>A welcome email is sent when the mail service is configured — otherwise share the password directly.</p>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Creating...' : (<><Icon name="plus" size={13} /> Create User</>)}
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
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Program</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const assigned = profileProgramOf(u)
                return (
                  <tr key={u.id}>
                    <td>{u.full_name || '—'}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-badge--${u.role}`}>{u.role}</span>
                      <select
                        className="input input--sm"
                        style={{ marginLeft: 8, maxWidth: 130 }}
                        aria-label={`Change role for ${u.email}`}
                        value={u.role}
                        disabled={roleBusyId === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole, u.email)}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="user">Faculty</option>
                      </select>
                    </td>
                    <td>
                      {assigned ? (
                        <span className="users-program-chip" title={assigned.name}>{assigned.code}</span>
                      ) : (
                        <span className="users-program-chip users-program-chip--none">
                          {u.role === 'admin' ? 'All programs' : 'None'}
                        </span>
                      )}
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      {u.email !== currentEmail && (
                        <button
                          className="btn btn--danger btn--sm"
                          disabled={deleteBusyId === u.id}
                          onClick={() => handleDelete(u.id, u.email)}
                        >
                          {deleteBusyId === u.id ? 'Removing...' : (<><Icon name="trash" size={13} /> Remove</>)}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

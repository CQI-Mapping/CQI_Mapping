// Admin Users page: create new accounts (admin, manager, or faculty), list
// all users, and manage their lifecycle — roles, program assignment, the
// display name, and the archive/restore cycle. Archiving is the app's soft
// delete: the account stays restorable, sign-in is refused while archived,
// and only archived rows can be hard-deleted.

import { useState, useEffect } from 'react'
import Icon from '../../components/icons'
import { useDraft } from '../../hooks/useDraft'
import { adminCreateUser, adminDeleteUser, addActivityLog, fetchAllProfilesWithProgram, fetchPrograms, profileProgramOf, updateProfile, updateUserProgram, updateUserRole, updateUserStatus } from '../../services/database'
import { isActive } from '../../utils/report'
import { supabase } from '../../utils/supabaseClient'
import type { ProfileWithProgram, Program, UserRole } from '../../services/database'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  user: 'Faculty',
}

/** Same caps the Profile page's display-name editor stamps on the fields —
    fixing someone's name here must never exceed what they could set there. */
const NAME_MAX_LENGTH = 80
const NICKNAME_MAX_LENGTH = 40

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
  // The row's program select shares the busy pattern with the one above.
  const [programBusyId, setProgramBusyId] = useState('')
  const [deleteBusyId, setDeleteBusyId] = useState('')
  // Archive tab: the parked accounts, listed separately so the directory
  // stays a roster of people who can actually sign in.
  const [archived, setArchived] = useState(false)
  const [statusBusyId, setStatusBusyId] = useState('')
  // Fix-profile modal: the admin repairing another account's identity (a
  // placeholder name like "test") without waiting for that user to sign in
  // and fix their own Profile page. Mirrors the Program page's modal.
  const [editingUser, setEditingUser] = useState<ProfileWithProgram | null>(null)
  const [editForm, setEditForm] = useState({ fullName: '', nickname: '' })
  const [editBusy, setEditBusy] = useState(false)

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
    // Password policy matches the profile card and reset screen: 8+ characters.
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
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
      // Administrators are not program-bound: promoting an account into the
      // role clears its assignment so the scope keeps matching. Every other
      // role keeps whatever assignment the row already shows.
      if (nextRole === 'admin') await updateUserProgram(profileId, null)
      setUsers((prev) =>
        prev.map((u) =>
          u.id === profileId
            ? { ...u, ...updated, program_id: nextRole === 'admin' ? null : u.program_id }
            : u,
        ),
      )
      await addActivityLog('role.updated', {
        entity: 'user',
        entity_id: profileId,
        label: `${email} → ${nextRole}`,
      })
      setSuccess(
        nextRole === 'admin'
          ? `Role for ${email} changed to ${nextRole}. Its program assignment was cleared — administrators span every program.`
          : `Role for ${email} changed to ${nextRole}.`,
      )
    } catch (e) {
      setError('Failed to update role: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setRoleBusyId('')
    }
  }

  // The row's Program select: how pre-existing accounts — registered before
  // the program column existed — get their assignment corrected. Patched
  // state can never carry the joined row, so this reloads the list whole.
  const handleProgramChange = async (profileId: string, programId: string, email: string) => {
    setError('')
    setSuccess('')
    setProgramBusyId(profileId)
    try {
      const assigned = programId ? programs.find((p) => p.id === programId) ?? null : null
      await updateUserProgram(profileId, programId || null)
      await addActivityLog('user.program_assigned', {
        entity: 'user',
        entity_id: profileId,
        label: `${email} → ${assigned?.code ?? 'none'}`,
      })
      await loadUsers()
      setSuccess(
        assigned
          ? `Program for ${email} set to ${assigned.code}.`
          : `Program for ${email} cleared — the account has no assignment.`,
      )
    } catch (e) {
      setError('Failed to assign program: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setProgramBusyId('')
    }
  }

  // Hard delete — offered on ARCHIVED rows only. An active account always
  // goes through the archive first, so a mistaken removal can be undone;
  // by the time an account reaches this path it has already been parked.
  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Permanently remove user ${email}? This cannot be undone.`)) return
    setError('')
    setSuccess('')
    setDeleteBusyId(userId)
    try {
      await adminDeleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      await addActivityLog('user.deleted', { entity: 'user', entity_id: userId, label: email })
      setSuccess(`User ${email} permanently removed.`)
    } catch (e) {
      setError('Failed to remove user: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeleteBusyId('')
    }
  }

  // Archive (soft delete): the auth user is untouched, so nothing is lost —
  // the account stops signing in (Login refuses archived rows) and waits
  // here for a restore. The inviter's own row is guarded the same way the
  // delete path is: an admin cannot park themselves.
  const handleArchive = async (userId: string, email: string) => {
    if (!window.confirm(`Archive user ${email}? They cannot sign in until the account is restored.`)) return
    setError('')
    setSuccess('')
    setStatusBusyId(userId)
    try {
      await updateUserStatus(userId, 'archived')
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'archived' } : u)))
      await addActivityLog('user.archived', { entity: 'user', entity_id: userId, label: email })
      setSuccess(`Account ${email} archived. You can restore it from the Archive tab.`)
    } catch (e) {
      setError('Failed to archive user: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setStatusBusyId('')
    }
  }

  const handleRestore = async (userId: string, email: string) => {
    setError('')
    setSuccess('')
    setStatusBusyId(userId)
    try {
      await updateUserStatus(userId, 'active')
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u)))
      await addActivityLog('user.restored', { entity: 'user', entity_id: userId, label: email })
      setSuccess(`Account ${email} restored — they can sign in again.`)
    } catch (e) {
      setError('Failed to restore user: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setStatusBusyId('')
    }
  }

  // ----- Fix profile -----

  // Seeded from the row so the fields open pre-filled, exactly the identity
  // the user sees on their own Profile page.
  const openEdit = (u: ProfileWithProgram) => {
    setEditingUser(u)
    setEditForm({ fullName: u.full_name || '', nickname: u.nickname ?? '' })
  }

  const closeEdit = () => {
    // Mid-save the modal must stay put: the save writes the fields it shows.
    if (editBusy) return
    setEditingUser(null)
    setEditForm({ fullName: '', nickname: '' })
  }

  // Saves the repaired name through the same updateProfile the Profile page
  // uses — RLS already lets admins update any profile row, so no new SQL is
  // needed. Nickname follows the Profile page's normalization: trimmed, and
  // empty becomes null rather than an empty string in the DB.
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    const name = editForm.fullName.trim()
    if (!name) return
    const nickname = editForm.nickname.trim()
    setError('')
    setSuccess('')
    setEditBusy(true)
    let saved = false
    try {
      await updateProfile(editingUser.id, { full_name: name, nickname: nickname || null })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id ? { ...u, full_name: name, nickname: nickname || null } : u,
        ),
      )
      await addActivityLog('user.profile_updated', {
        entity: 'user',
        entity_id: editingUser.id,
        label: `${editingUser.email} → ${name}`,
      })
      setSuccess(
        nickname
          ? `Profile of ${editingUser.email} fixed — reports will show ${name} "${nickname}".`
          : `Profile of ${editingUser.email} fixed — reports will show ${name}.`,
      )
      saved = true
    } catch (e) {
      setError('Failed to update profile: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEditBusy(false)
    }
    // On success the modal closes; on failure it stays open so the error is
    // read against the fields that produced it.
    if (saved) {
      setEditingUser(null)
      setEditForm({ fullName: '', nickname: '' })
    }
  }

  const totalUsers = users.length
  const activeUsers = users.filter(isActive)
  const archivedUsers = users.filter((u) => !isActive(u))
  // The directory follows the tab: active accounts are the roster, archived
  // ones are the park waiting for a restore.
  const shown = archived ? archivedUsers : activeUsers
  const activeManagers = activeUsers.filter((u) => u.role === 'manager').length

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
          <div className="program-stat__sub">Active program heads</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Archived</div>
          <div className="program-stat__value" style={{ color: '#64748b' }}>{archivedUsers.length}</div>
          <div className="program-stat__sub">Restorable accounts</div>
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
                  At least 8 characters — the new user can change it after signing in, or reset it from the sign-in page themselves.
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
          <>
          <div className="program-toolbar">
            <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
              <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
              <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
                Archive {archivedUsers.length > 0 && <span className="sd-tab__count">{archivedUsers.length}</span>}
              </button>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Program</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {archived ? 'No archived accounts — everything is active.' : 'No active accounts yet.'}
                  </td>
                </tr>
              )}
              {shown.map((u) => {
                const assigned = profileProgramOf(u)
                const rowArchived = !isActive(u)
                return (
                  <tr key={u.id} style={rowArchived ? { opacity: 0.65 } : undefined}>
                    <td>{u.full_name || '—'}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-badge--${u.role}`}>{u.role}</span>
                      <select
                        className="input input--sm"
                        style={{ marginLeft: 8, maxWidth: 130 }}
                        aria-label={`Change role for ${u.email}`}
                        value={u.role}
                        disabled={roleBusyId === u.id || rowArchived}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole, u.email)}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="user">Faculty</option>
                      </select>
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <span className="users-program-chip users-program-chip--none">All programs</span>
                      ) : (
                        <select
                          className="input input--sm"
                          style={{ maxWidth: 130 }}
                          aria-label={`Assign program for ${u.email}`}
                          value={assigned?.id ?? ''}
                          disabled={programBusyId === u.id || programs.length === 0 || rowArchived}
                          onChange={(e) => handleProgramChange(u.id, e.target.value, u.email)}
                        >
                          <option value="">None</option>
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>{p.code}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      {u.email !== currentEmail && (
                        rowArchived ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => openEdit(u)}
                              title="Fix their name & nickname — the same fields their Profile page shows"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--ghost btn--sm"
                              disabled={statusBusyId === u.id}
                              onClick={() => handleRestore(u.id, u.email)}
                              title="Bring the account back — they can sign in again"
                            >
                              {statusBusyId === u.id ? 'Restoring...' : 'Restore'}
                            </button>
                            <button
                              className="btn btn--danger btn--sm"
                              disabled={deleteBusyId === u.id}
                              onClick={() => handleDelete(u.id, u.email)}
                              title="Permanent — the account cannot come back"
                            >
                              {deleteBusyId === u.id ? 'Removing...' : (<><Icon name="trash" size={13} /> Remove</>)}
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => openEdit(u)}
                              title="Fix their name & nickname — the same fields their Profile page shows"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--ghost btn--sm"
                              disabled={statusBusyId === u.id}
                              onClick={() => handleArchive(u.id, u.email)}
                              title="Soft delete — reversible from the Archive tab"
                            >
                              {statusBusyId === u.id ? 'Archiving...' : 'Archive'}
                            </button>
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Fix profile — same modal the Programs page uses. Fields mirror the
          Profile page's display-name editor (same caps, same nickname
          normalization), so what the admin sets here is exactly what the
          user could have set themselves. */}
      {editingUser && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal__header">
              <h3>Edit profile</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{editingUser.email}</p>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal__body">
                <div className="modal__grid-2">
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span>Full name</span>
                    <input
                      className="input input--sm"
                      type="text"
                      placeholder="Juan Dela Cruz"
                      value={editForm.fullName}
                      maxLength={NAME_MAX_LENGTH}
                      onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span>Nickname</span>
                    <input
                      className="input input--sm"
                      type="text"
                      placeholder='optional — e.g. "Bebot"'
                      autoComplete="off"
                      value={editForm.nickname}
                      maxLength={NICKNAME_MAX_LENGTH}
                      onChange={(e) => setEditForm((f) => ({ ...f, nickname: e.target.value }))}
                    />
                  </label>
                </div>
                <p className="au__cred-note" style={{ marginTop: 10 }}>
                  Reports and audit logs use the full name; the nickname shows in quotes. Clearing it removes the quoted name.
                </p>
              </div>
              <div className="modal__footer">
                <button type="button" className="btn btn--ghost btn--sm" onClick={closeEdit} disabled={editBusy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={editBusy || !editForm.fullName.trim()}>
                  {editBusy ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

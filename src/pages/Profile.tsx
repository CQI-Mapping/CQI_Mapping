// Profile page: identity summary, display-name editor, password change, and a
// peek at the user's own audit trail. Layout mirrors the interactive concept in
// design/profile-redesign.html: a role-tinted hero avatar, an identity card with
// fact tiles, a two-column body, and a personal activity timeline.

import { useEffect, useRef, useState } from 'react'
import { useDraft } from '../hooks/useDraft'
import Icon from '../components/icons'
import { updateProfile, addActivityLog, fetchActivityLogs, uploadAvatar } from '../services/database'
import { supabase } from '../utils/supabaseClient'
import { gravatarUrl, initialsOf } from '../utils/avatar'
import { ACTION_LABELS } from './admin/ActivityLabels'
import type { Profile as ProfileType, ActivityLogEntry, UserRole } from '../services/database'

interface ProfileProps {
  profile: ProfileType | null
  onSaved: (profile: ProfileType) => void
}

/** Supabase's minimum password length — keep in sync with the project's auth config. */
const MIN_PASSWORD_LENGTH = 6

/** Same cap the concept mockup stamped on the name field. */
const NAME_MAX_LENGTH = 80

/** Handles: 3–30 of a-z, 0-9, dot, dash, underscore — starts alphanumerically.
 *  The DB unique index is the last guard; users without handles read null. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,29}$/

/** How recent a log entry must be for the "active" dot to keep pulsing green. */
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  user: 'Faculty',
}

/** Plain-language summary of what the signed-in role may touch. */
const CAPABILITIES: Record<UserRole, { title: string; sub: string }> = {
  admin: { title: 'Full system access', sub: 'users · curriculum · logs' },
  manager: { title: 'Reviewer access', sub: 'curriculum · reports · logs' },
  user: { title: 'Faculty access', sub: 'own courses · CLOs · TOS' },
}

/** Consistent error text for either form. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 'Today · 9:14 AM', 'Yesterday · …', or a calendar date — matches the mockup. */
function formatDayTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const localDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((localDay(now) - localDay(d)) / 86400000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (diffDays <= 0) return `Today · ${time}`
  if (diffDays === 1) return `Yesterday · ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`
}

/** The action's entity family — the string before the first dot. */
function categoryOf(action: string): string {
  return action.split('.')[0] ?? ''
}

/** Human text for the timeline pill. */
function categoryLabel(category: string): string {
  if (!category) return 'Other'
  if (category === 'auth') return 'Auth'
  if (category === 'page') return 'Browse'
  if (category === 'role') return 'Roles'
  if (category === 'user') return 'Users'
  return category[0].toUpperCase() + category.slice(1)
}

/** Pill colour family. Unknown categories share the neutral tone. */
function categoryTone(category: string): string {
  if (category === 'auth' || category === 'profile' || category === 'page') return category
  return 'misc'
}

function Profile({ profile, onSaved }: ProfileProps) {
  // Draft survives page navigation; cleared on successful save and on Discard.
  const [draft, setDraft] = useDraft('cqi.draft.Profile', {
    fullName: profile?.full_name || '',
    username: profile?.username ?? '',
  })
  const { fullName, username } = draft
  const setFullName = (v: string) => setDraft((d) => ({ ...d, fullName: v }))
  const setUsername = (v: string) => setDraft((d) => ({ ...d, username: v.replace(/\s/g, '') }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const role: UserRole = profile?.role ?? 'user'
  const savedName = profile?.full_name ?? ''
  const displayName = savedName || profile?.email || ''
  const savedUsername = profile?.username ?? ''

  // Handles save normalized: trimmed + downcased, empty clears the handle.
  const usernameNormalized = username.trim().toLowerCase()
  const usernameValid = usernameNormalized === '' || USERNAME_PATTERN.test(usernameNormalized)
  const nameDirty = fullName.trim() !== savedName
  const usernameDirty = usernameNormalized !== savedUsername
  const dirty = nameDirty || usernameDirty
  const canSave = Boolean(profile) && dirty && fullName.trim().length > 0 && usernameValid

  // Passwords stay in state only — useDraft persists to sessionStorage, which the
  // hook's own docs say never to use for secrets.
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  // Live checklist beneath the password fields — feedback before submit, not after.
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const passwordStrength = !password
    ? 0
    : passwordLongEnough
      ? 0.45 + 0.55 * Math.min(password.length / 16, 1)
      : 0.15

  // The user's own recent audit entries drive two views: the hero's "Active"
  // chip and the timeline card. A fetch failure is not worth a page error.
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [activityRefresh, setActivityRefresh] = useState(0)
  const latestEntry = logs[0] ?? null
  const activeRecently = Boolean(
    latestEntry && Date.now() - new Date(latestEntry.created_at).getTime() < ACTIVE_WINDOW_MS,
  )

  useEffect(() => {
    if (!profile?.email) return
    let cancelled = false
    fetchActivityLogs({ userEmail: profile.email, limit: 4 })
      .then((entries) => {
        if (!cancelled) setLogs(entries)
      })
      .catch(() => {
        // The log is nice-to-have here; an empty trail reads fine.
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email, activityRefresh])

  // Ownership of the email is a fact of the auth user, not the profile row;
  // confirm quietly so "Verified" only renders when it is actually true.
  const [emailVerified, setEmailVerified] = useState(false)
  useEffect(() => {
    if (!profile?.email) return
    let cancelled = false
    supabase!.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setEmailVerified(Boolean(data.user?.email_confirmed_at))
      })
      .catch(() => {
        // Chip simply stays hidden.
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email])

  // Picture precedence: an uploaded file wins; otherwise the email's
  // Gravatar (d=initials with the name's letters) is automatically every
  // account's picture, no upload required. While the hash is being computed
  // the initials tile shows, so there is never an empty corner.
  const [emailAvatar, setEmailAvatar] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    gravatarUrl(profile?.email, 256, initialsOf(displayName))
      .then((url) => {
        if (!cancelled) setEmailAvatar(url)
      })
      .catch(() => {
        if (!cancelled) setEmailAvatar(null)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email, displayName])
  const avatarSrc = profile?.avatar_url ?? emailAvatar

  // Save the edited name, log it, and push the updated profile up to App.tsx.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    if (!usernameValid) {
      setError('Username must be 3–30 characters: letters, numbers, dots, dashes or underscores.')
      return
    }
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const updated = await updateProfile(profile.id, {
        full_name: fullName.trim(),
        username: usernameNormalized || null,
      })
      await addActivityLog('profile.updated', {
        entity: 'profile',
        entity_id: updated.id,
        label: updated.full_name || updated.email,
      })
      onSaved(updated)
      setDraft({ fullName: updated.full_name || '', username: updated.username ?? '' })
      setMessage('Profile saved.')
      setActivityRefresh((n) => n + 1)
    } catch (err) {
      // The DB's UNIQUE constraint is the last guard on handles.
      const text = describe(err).toLowerCase()
      if (text.includes('unique') || text.includes('duplicate key')) {
        setError('That username is already taken.')
      } else {
        setError('Failed to save profile: ' + describe(err))
      }
    } finally {
      setSaving(false)
    }
  }

  // Set the name and handle back to the saved values, wiping half-typed edits.
  const handleDiscard = () => {
    setError('')
    setMessage('')
    setDraft({ fullName: savedName, username: savedUsername })
  }

  // ----- Profile picture -----

  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarPick = () => avatarInputRef.current?.click()

  // Upload to the caller's own folder in the public bucket, then stamp the
  // URL onto the profile row in one flow. The hidden input is re-armed after
  // every change so picking the same file again still fires an event.
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setAvatarError('')
    setAvatarBusy(true)
    try {
      const url = await uploadAvatar(profile.id, file)
      const updated = await updateProfile(profile.id, { avatar_url: url })
      await addActivityLog('profile.avatar_changed', {
        entity: 'profile',
        entity_id: updated.id,
        label: updated.full_name || updated.email,
      })
      onSaved(updated)
      setActivityRefresh((n) => n + 1)
    } catch (err) {
      setAvatarError(describe(err))
    } finally {
      setAvatarBusy(false)
    }
  }

  // Update the Supabase auth password for the signed-in user. Requires the
  // user to already hold a fresh session — Supabase rejects stale sessions.
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setPasswordError('')
    setPasswordMessage('')
    if (!passwordLongEnough) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (!passwordsMatch) {
      setPasswordError('Passwords do not match.')
      return
    }
    setChangingPassword(true)
    try {
      const { error: updateError } = await supabase!.auth.updateUser({ password })
      if (updateError) throw updateError
      await addActivityLog('profile.password_changed', {
        entity: 'profile',
        entity_id: profile.id,
        label: profile.full_name || profile.email,
      })
      setPassword('')
      setConfirmPassword('')
      setPasswordMessage('Password updated.')
      setActivityRefresh((n) => n + 1)
    } catch (err) {
      setPasswordError('Failed to change password: ' + describe(err))
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="programs-page profile">
      <header className="profile-hero" data-role={role}>
        <div className="profile-hero__left">
          {avatarSrc ? (
            <div className="profile-avatar">
              <img className="profile-avatar__img" src={avatarSrc} alt="" />
            </div>
          ) : (
            <div className="profile-avatar" aria-hidden="true">{initialsOf(displayName)}</div>
          )}
          <div className="profile-hero__titles">
            <h2>Profile</h2>
            <p>
              {profile
                ? `${displayName || 'Your account'}${profile.username ? ` · @${profile.username}` : ''}`
                : 'Loading your account…'}
            </p>
          </div>
        </div>

        <div className="profile-facts">
          <span className="profile-chip" title="Role">
            <Icon name="user" size={13} />
            {ROLE_LABELS[role]}
          </span>
          <span className="profile-chip" title="Member since">
            <Icon name="calendar" size={13} />
            {profile?.created_at ? `Member since ${new Date(profile.created_at).toLocaleDateString()}` : 'Member since —'}
          </span>
          <span className="profile-chip" title="Last activity">
            <span
              className={`profile-chip__dot${activeRecently ? '' : ' profile-chip__dot--idle'}`}
              aria-hidden="true"
            />
            {latestEntry ? formatDayTime(latestEntry.created_at) : 'No activity yet'}
          </span>
        </div>
      </header>

      <div className="profile-grid">
        {/* LEFT: identity + display name editor */}
        <div className="profile-col">
          <section className="panel profile-card card-enter profile-identity" aria-label="Account identity">
            <div className="profile-identity__main">
              <button
                type="button"
                className="profile-identity__avatar-btn"
                onClick={handleAvatarPick}
                disabled={!profile || avatarBusy}
                aria-label="Change profile picture"
                title={profile?.avatar_url ? 'Change your uploaded picture' : 'Derived from your email via Gravatar — click to upload your own'}
              >
                <div className="profile-identity__avatar" aria-hidden="true">
                  {avatarSrc ? (
                    <img className="profile-avatar__img" src={avatarSrc} alt="" />
                  ) : (
                    initialsOf(displayName)
                  )}
                  <span className="profile-identity__avatar-overlay">
                    {avatarBusy ? 'Uploading…' : 'Change'}
                  </span>
                </div>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={handleAvatarChange}
              />
              <div className="profile-identity__who">
                <div className="profile-identity__name">{profile ? displayName : '—'}</div>
                <div className="profile-identity__meta">
                  <Icon name="mail" size={13} />
                  <span>{profile?.email ?? '—'}</span>
                  {profile?.username && (
                    <span className="profile-identity__handle" title="Your public handle">
                      @{profile.username}
                    </span>
                  )}
                  {emailVerified && (
                    <span className="profile-verified" title="Email ownership was confirmed at sign-up">
                      <Icon name="check" size={9} strokeWidth={3.4} />
                      Verified
                    </span>
                  )}
                </div>
              </div>
              <span className={`role-badge role-badge--${profile?.role}`}>{ROLE_LABELS[role]}</span>
            </div>
            {avatarError && <p className="msg msg--error" role="alert">{avatarError}</p>}

            <div className="profile-facts-grid">
              <div className="profile-tile">
                <span className="profile-tile__k">
                  <Icon name="shield" size={11} />
                  Role capabilities
                </span>
                <span className="profile-tile__v">
                  {CAPABILITIES[role].title}
                  <small>{CAPABILITIES[role].sub}</small>
                </span>
              </div>
              <div className="profile-tile">
                <span className="profile-tile__k">
                  <Icon name="clock" size={11} />
                  Last activity
                </span>
                <span className="profile-tile__v">
                  {latestEntry ? ACTION_LABELS[latestEntry.action] ?? latestEntry.action : 'No activity yet'}
                  <small>{latestEntry ? formatDayTime(latestEntry.created_at) : '—'}</small>
                </span>
              </div>
            </div>
          </section>

          <form className="panel profile-card card-enter" aria-label="Display name" onSubmit={handleSubmit}>
            <div className="profile-card__head">
              <h3><Icon name="user" size={15} />Display name</h3>
              <span className="profile-card__hint">shown across reports &amp; audit logs</span>
            </div>

            <label className="field">
              <span>Full name</span>
              <input
                className="input"
                type="text"
                value={fullName}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => setFullName(e.target.value)}
                disabled={!profile}
              />
              <span className="profile-name-count" aria-hidden="true">
                {fullName.length} / {NAME_MAX_LENGTH}
              </span>
            </label>

            <label className="field">
              <span>Username</span>
              <div className="input-prefix-wrap">
                <span className="input-prefix" aria-hidden="true">@</span>
                <input
                  className="input"
                  type="text"
                  value={username}
                  maxLength={30}
                  placeholder="juan.delacruz"
                  autoComplete="off"
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!profile}
                />
              </div>
              <span
                className={`profile-name-count${username && !usernameValid ? ' profile-name-count--error' : ''}`}
                aria-hidden="true"
              >
                {usernameValid || !username ? 'letters · numbers · _ . -' : 'not a valid handle yet'}
              </span>
            </label>

            {profile && dirty && fullName.trim() === savedName && !usernameValid && (
              <p className="profile-note profile-note--warn" role="status">
                <Icon name="warning" size={14} />
                Fix the highlighted fields to save.
              </p>
            )}
            {profile && dirty && !fullName.trim() && (
              <p className="profile-note profile-note--warn" role="status">
                <Icon name="warning" size={14} />
                Full name is required to save.
              </p>
            )}
            {profile && dirty && fullName.trim() && (
              <p className="profile-note" role="status">
                <Icon name="warning" size={14} />
                Unsaved changes — reports keep showing{' '}
                <b>{savedName || 'the current name'}</b> until you save.
              </p>
            )}
            {message && <p className="msg msg--success" role="status">{message}</p>}
            {error && <p className="msg msg--error" role="alert">{error}</p>}

            <div className="profile-card__actions">
              {dirty && (
                <button className="btn btn--ghost" type="button" onClick={handleDiscard} disabled={saving}>
                  Discard
                </button>
              )}
              <button className="btn btn--primary" type="submit" disabled={!canSave || saving}>
                {!profile ? 'Loading…' : dirty ? (saving ? 'Saving...' : 'Save changes') : 'Saved ✓'}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT: security + recent activity */}
        <div className="profile-col">
          <section className="panel profile-card card-enter" aria-label="Password">
            <div className="profile-card__head">
              <h3><Icon name="lock" size={15} />Password</h3>
              <span className="profile-card__hint">changed only by you</span>
            </div>

            <form onSubmit={handlePasswordChange} noValidate>
              <label className="field">
                <span>New password</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!profile}
                />
              </label>
              <label className="field">
                <span>Confirm new password</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={!profile}
                />
              </label>

              <div className="profile-reqs">
                <span className={`profile-req${passwordLongEnough ? ' profile-req--ok' : ''}`}>
                  <span className="profile-req__tick"><Icon name="check" size={9} strokeWidth={3.6} /></span>
                  At least {MIN_PASSWORD_LENGTH} characters
                </span>
                <span className={`profile-req${passwordsMatch ? ' profile-req--ok' : ''}`}>
                  <span className="profile-req__tick"><Icon name="check" size={9} strokeWidth={3.6} /></span>
                  Both fields match
                </span>
              </div>

              <div className="profile-strength">
                <div className="profile-strength__bar" aria-hidden="true">
                  <div className="profile-strength__fill" style={{ width: `${passwordStrength * 100}%` }} />
                </div>
                <div className="profile-strength__labels">
                  <span>Weak</span>
                  <span>Strong</span>
                </div>
              </div>

              {passwordError && <p className="msg msg--error" role="alert">{passwordError}</p>}
              {passwordMessage && <p className="msg msg--success" role="status">{passwordMessage}</p>}

              <button className="btn btn--primary profile-security-btn" type="submit" disabled={!profile || changingPassword || !password || !confirmPassword}>
                {changingPassword ? 'Updating...' : 'Update password'}
              </button>
            </form>

            <p className="profile-security-foot">
              <Icon name="shield" size={15} />
              Your current session stays signed in, and the change is written to the audit log.
            </p>
          </section>

          <section className="panel profile-card card-enter" aria-label="Recent activity">
            <div className="profile-card__head">
              <h3><Icon name="clock" size={15} />Recent activity</h3>
              <span className="profile-card__hint">your audit trail</span>
            </div>

            {logs.length > 0 ? (
              <ul className="profile-timeline">
                {logs.map((entry) => {
                  const category = categoryOf(entry.action)
                  return (
                    <li key={entry.id}>
                      <div className="pt-action">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                        <span className={`pt-pill pt-pill--${categoryTone(category)}`}>
                          {categoryLabel(category)}
                        </span>
                      </div>
                      <div className="pt-time">{formatDayTime(entry.created_at)}</div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="profile-note-plain">No activity recorded yet — actions you take will appear here.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default Profile

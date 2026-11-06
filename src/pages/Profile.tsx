// Profile page: the account's identity record, laid out as the concept in
// design/profile-redesign.html.
//
// Two columns. The left holds who the account is: the identity card (picture,
// name, verified email, role, capabilities and last activity) and the
// "Profile information" card, where only the picture, full name and nickname
// are editable, through an explicit Edit profile → Save changes / Cancel
// cycle. Email, department, program, designation, role and account status
// display read-only. The right holds a security summary that links to the
// Security & privacy page, where password and session control live, and the
// personal activity trail.
//
// Backend authorization note: the read-only fields are enforced server-side
// by the profiles_edit_guard trigger (migrations/013) — the UI simply never
// renders editors for them.

import { useEffect, useRef, useState } from 'react'
import { useDraft } from '../hooks/useDraft'
import Icon from '../components/icons'
import {
  updateProfile,
  addActivityLog,
  fetchActivityLogs,
  uploadAvatar,
  fetchPrograms,
} from '../services/database'
import { supabase } from '../utils/supabaseClient'
import { loadEmailAvatar, initialsOf } from '../utils/avatar'
import { formatDayTime } from '../utils/time'
import { ACTION_LABELS } from './admin/ActivityLabels'
import type { Profile as ProfileType, ActivityLogEntry, Program, UserRole } from '../services/database'

interface ProfileProps {
  profile: ProfileType | null
  onSaved: (profile: ProfileType) => void
  onNavigate?: (page: string) => void
}

/** Same cap the concept mockup stamped on the name field. */
const NAME_MAX_LENGTH = 80

/** Nicknames stay casual — a short, quotable word. */
const NICKNAME_MAX_LENGTH = 40

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

function Profile({ profile, onSaved, onNavigate }: ProfileProps) {
  const role: UserRole = profile?.role ?? 'user'
  const savedName = profile?.full_name ?? ''
  const savedNickname = profile?.nickname ?? ''
  const savedDepartment = profile?.department ?? null
  const savedDesignation = profile?.designation ?? null

  // Draft survives page navigation; cleared on successful save and on Cancel.
  const [draft, setDraft] = useDraft('cqi.draft.Profile', {
    fullName: savedName,
    nickname: savedNickname,
  })
  const { fullName, nickname } = draft
  const setFullName = (v: string) => setDraft((d) => ({ ...d, fullName: v }))
  const setNickname = (v: string) => setDraft((d) => ({ ...d, nickname: v }))

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const displayName = savedName || profile?.email || ''

  // Nickname is casual and optional: trimmed, never empty-string in the DB.
  const nicknameNormalized = nickname.trim()
  const dirty = fullName.trim() !== savedName || nicknameNormalized !== savedNickname
  // Save only fires when something actually changed — a clean form pressing
  // Save would rewrite the row and stamp a needless profile.updated audit
  // entry. Cancel stays available as the off-ramp either way.
  const canSave = Boolean(profile) && dirty && fullName.trim().length > 0

  // ----- Profile picture (always editable, inside the fields card) -----

  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const avatarBusyRef = useRef(false)
  const handleAvatarPick = () => {
    if (avatarBusyRef.current) return
    avatarInputRef.current?.click()
  }

  // Upload to the caller's own folder in the public bucket, then stamp the
  // URL onto the profile row in one flow. The hidden input is re-armed after
  // every change so picking the same file again still fires an event.
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setAvatarError('')
    setAvatarBusy(true)
    avatarBusyRef.current = true
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
      avatarBusyRef.current = false
    }
  }

  // Clear the picture (the identity falls back to Gravatar/initials). The
  // upload stays in the bucket, harmless and overwritten by the next pick.
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const handleAvatarRemove = async () => {
    if (!profile?.avatar_url || avatarBusy) return
    setAvatarError('')
    setRemovingAvatar(true)
    try {
      const updated = await updateProfile(profile.id, { avatar_url: null })
      await addActivityLog('profile.avatar_removed', {
        entity: 'profile',
        entity_id: updated.id,
        label: updated.full_name || updated.email,
      })
      onSaved(updated)
      setActivityRefresh((n) => n + 1)
    } catch (err) {
      setAvatarError(describe(err))
    } finally {
      setRemovingAvatar(false)
    }
  }

  // ----- Save / cancel the display-name editor -----

  const startEditing = () => {
    setError('')
    setMessage('')
    setEditing(true)
  }

  const cancelEditing = () => {
    setFullName(savedName)
    setNickname(savedNickname)
    setError('')
    setMessage('')
    setEditing(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const updated = await updateProfile(profile.id, {
        full_name: fullName.trim(),
        nickname: nicknameNormalized || null,
      })
      await addActivityLog('profile.updated', {
        entity: 'profile',
        entity_id: updated.id,
        label: updated.full_name || updated.email,
      })
      onSaved(updated)
      setDraft({
        fullName: updated.full_name || '',
        nickname: updated.nickname ?? '',
      })
      setMessage('Profile saved.')
      setEditing(false)
      setActivityRefresh((n) => n + 1)
    } catch (err) {
      setError('Failed to save profile: ' + describe(err))
    } finally {
      setSaving(false)
    }
  }

  // ----- Personal audit trail -----

  // The user's own recent audit entries drive two views: the hero's "Active"
  // chip and the timeline card. Twelve entries keep the trail's column as
  // tall as its neighbour; a fetch failure is shown as its own state rather
  // than being disguised as an empty trail.
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [logsError, setLogsError] = useState(false)
  const [activityRefresh, setActivityRefresh] = useState(0)
  const latestEntry = logs[0] ?? null
  const activeRecently = Boolean(
    latestEntry && Date.now() - new Date(latestEntry.created_at).getTime() < ACTIVE_WINDOW_MS,
  )

  useEffect(() => {
    if (!profile?.email) return
    let cancelled = false
    fetchActivityLogs({ userEmail: profile.email, limit: 12 })
      .then((entries) => {
        if (!cancelled) setLogs(entries)
      })
      .catch(() => {
        if (!cancelled) setLogsError(true)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email, activityRefresh])

  // Program name: the assignment lives on the profile row; the readable
  // label comes from the programs table (tolerant — an unknown/missing
  // assignment simply reads "Not assigned").
  const [programs, setPrograms] = useState<Program[]>([])
  useEffect(() => {
    let cancelled = false
    fetchPrograms()
      .then((rows) => {
        if (!cancelled) setPrograms(rows)
      })
      .catch(() => {
        // A failed lookup degrades to "Not assigned"; not worth a page error.
      })
    return () => {
      cancelled = true
    }
  }, [])
  const program = programs.find((p) => p.id === profile?.program_id) ?? null

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

  // Picture precedence: an uploaded file wins; otherwise the email's real
  // Gravatar photo if the account has one (probed off-DOM), else the
  // theme's initials tile. Gravatar's generated initials are never shown —
  // their hash-driven colours can clash badly with the palette.
  const [emailAvatar, setEmailAvatar] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadEmailAvatar(profile?.email)
      .then((url) => {
        if (!cancelled) setEmailAvatar(url)
      })
      .catch(() => {
        if (!cancelled) setEmailAvatar(null)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email])
  const avatarSrc = profile?.avatar_url ?? emailAvatar
  const isArchived = profile?.status === 'archived'

  return (
    <div className="programs-page profile prf">
      <header className="prf-hero" data-role={role}>
        <div className="prf-hero__left">
          <div className="prf-avatar" aria-hidden="true">
            {avatarSrc ? <img className="prf-avatar__img" src={avatarSrc} alt="" /> : initialsOf(displayName)}
          </div>
          <div className="prf-hero__titles">
            <h2>Profile</h2>
            <p>
              {profile
                ? `${displayName || 'Your account'}${profile.nickname ? ` "${profile.nickname}"` : ''} · ${ROLE_LABELS[role]} account`
                : 'Loading your account…'}
            </p>
          </div>
        </div>

        <div className="prf-chips">
          <span className="prf-chip" title="Role">
            <Icon name="user" size={13} />
            {ROLE_LABELS[role]}
          </span>
          <span className="prf-chip" title="Member since">
            <Icon name="calendar" size={13} />
            {profile?.created_at
              ? `Member since ${new Date(profile.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'Member since —'}
          </span>
          <span className="prf-chip" title="Last activity">
            <span
              className={`prf-chip__dot${activeRecently ? '' : ' prf-chip__dot--idle'}`}
              aria-hidden="true"
            />
            {latestEntry ? formatDayTime(latestEntry.created_at) : 'No activity yet'}
          </span>
        </div>
      </header>

      <div className="prf-grid">
        <div className="prf-col">
          {/* Identity: who the account is, with the two facts the concept
              pairs with it. */}
          <section className="prf-panel card-enter" aria-label="Account identity">
            <div className="prf-identity__main">
              <div className="prf-mini" aria-hidden="true">
                {avatarSrc ? <img src={avatarSrc} alt="" /> : initialsOf(displayName)}
              </div>
              <div className="prf-identity__who">
                <div className="prf-identity__name">{displayName || '—'}</div>
                <div className="prf-identity__meta">
                  <Icon name="mail" size={13} />
                  <span>{profile?.email ?? '—'}</span>
                  {emailVerified && (
                    <span className="prf-verified" title="Email ownership was confirmed at sign-up">
                      <Icon name="check" size={11} strokeWidth={3} />
                      Verified
                    </span>
                  )}
                </div>
              </div>
              <span className={`prf-role prf-role--${role}`}>{ROLE_LABELS[role]}</span>
            </div>

            <div className="prf-facts">
              <div className="prf-tile">
                <span className="prf-tile__k">Role capabilities</span>
                <span className="prf-tile__v">
                  {CAPABILITIES[role].title}
                  <small>{CAPABILITIES[role].sub}</small>
                </span>
              </div>
              <div className="prf-tile">
                <span className="prf-tile__k">Last activity</span>
                <span className="prf-tile__v">
                  {latestEntry ? (ACTION_LABELS[latestEntry.action] ?? latestEntry.action) : 'Nothing yet'}
                  <small>
                    {latestEntry ? formatDayTime(latestEntry.created_at) : 'Actions you take will show here'}
                  </small>
                </span>
              </div>
            </div>
          </section>

          {/* Profile information: the three editable fields sit behind the
              explicit edit cycle; everything else is plain text, never a
              disabled input, so nothing looks editable that isn't. */}
          <section className="prf-panel card-enter" aria-label="Profile information">
            <div className="prf-panel__head">
              <h3>
                <Icon name="user" size={15} />
                Profile information
              </h3>
              {!editing ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={startEditing}
                  disabled={!profile}
                  title="Changes your picture, full name and nickname only"
                >
                  Edit profile
                </button>
              ) : (
                <span className="prf-panel__hint" role="status">
                  Editing name &amp; picture only — academic fields are managed by the administrator
                </span>
              )}
            </div>

            {/* Picture row — explicit controls, no hover-only affordance. */}
            <div className="prf-photo">
              <div className="prf-mini" aria-hidden="true">
                {avatarSrc ? <img src={avatarSrc} alt="" /> : initialsOf(displayName)}
              </div>
              <div className="prf-photo__tools">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleAvatarPick}
                  disabled={!profile || avatarBusy}
                >
                  {avatarBusy ? 'Uploading…' : 'Change photo'}
                </button>
                {profile?.avatar_url && (
                  <button
                    type="button"
                    className="pf-link"
                    onClick={handleAvatarRemove}
                    // avatarBusy too: removing while an upload is mid-flight would
                    // let the two writes to avatar_url race and the loser surprises.
                    disabled={!profile || removingAvatar || avatarBusy}
                  >
                    {removingAvatar ? 'Removing…' : 'Remove photo'}
                  </button>
                )}
                <span className="prf-photo__hint">
                  PNG · JPG · WebP · under 2 MB — falls back to your Gravatar or initials
                </span>
              </div>
            </div>
            {avatarError && <p className="msg msg--error" role="alert">{avatarError}</p>}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={handleAvatarChange}
            />

            <div className="prf-fields">
              <div className="prf-field prf-field--wide">
                <span className="prf-field__k">Full name</span>
                {editing ? (
                  <input
                    className="input"
                    type="text"
                    value={fullName}
                    maxLength={NAME_MAX_LENGTH}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <span className="prf-field__v">{profile ? (savedName || '—') : '—'}</span>
                )}
                <span className="prf-field__foot">
                  <span className="prf-field__note">shown across reports &amp; audit logs</span>
                  {editing && <span className="prf-count">{fullName.length} / {NAME_MAX_LENGTH}</span>}
                </span>
              </div>

              <div className="prf-field prf-field--wide">
                <span className="prf-field__k">Nickname</span>
                {editing ? (
                  <input
                    className="input"
                    type="text"
                    value={nickname}
                    maxLength={NICKNAME_MAX_LENGTH}
                    placeholder='what friends call you — e.g. "Bebot"'
                    autoComplete="off"
                    onChange={(e) => setNickname(e.target.value)}
                  />
                ) : (
                  <span className="prf-field__v">
                    {savedNickname ? (
                      <span className="prf-nick">"{savedNickname}"</span>
                    ) : (
                      <span className="prf-field__v-muted">Not set</span>
                    )}
                  </span>
                )}
                <span className="prf-field__foot">
                  <span className="prf-field__note">optional · casual · shown in quotes</span>
                  {editing && <span className="prf-count">{nickname.length} / {NICKNAME_MAX_LENGTH}</span>}
                </span>
              </div>

              <div className="prf-field">
                <span className="prf-field__k">
                  <Icon name="mail" size={11} />
                  Email address
                </span>
                <span className="prf-field__v">{profile?.email ?? '—'}</span>
                <span className="prf-field__note">managed by your administrator</span>
              </div>

              <div className="prf-field">
                <span className="prf-field__k">
                  <Icon name="book" size={11} />
                  Academic department
                </span>
                <span className="prf-field__v">
                  {savedDepartment ? savedDepartment : <span className="prf-field__v-muted">Not set</span>}
                </span>
                <span className="prf-field__note">read-only · set by your administrator</span>
              </div>

              <div className="prf-field">
                <span className="prf-field__k">
                  <Icon name="cap" size={11} />
                  Academic program
                </span>
                <span className="prf-field__v">
                  {program ? `${program.code} — ${program.name}` : <span className="prf-field__v-muted">Not assigned</span>}
                </span>
                <span className="prf-field__note">read-only · set by your administrator</span>
              </div>

              <div className="prf-field">
                <span className="prf-field__k">
                  <Icon name="doc" size={11} />
                  Position / designation
                </span>
                <span className="prf-field__v">
                  {savedDesignation ? savedDesignation : <span className="prf-field__v-muted">Not set</span>}
                </span>
                <span className="prf-field__note">read-only · set by your administrator</span>
              </div>

              <div className="prf-field">
                <span className="prf-field__k">
                  <Icon name="checkCircle" size={11} />
                  Account status
                </span>
                <span className="prf-field__v">
                  <span className={`status-pill status-pill--${isArchived ? 'archived' : 'active'}`}>
                    <span className="status-pill__dot" aria-hidden="true" />
                    {isArchived ? 'Archived' : 'Active'}
                  </span>
                </span>
                <span className="prf-field__note">
                  {isArchived ? 'signing in is disabled; contact an administrator' : 'signing in and access are enabled'}
                </span>
              </div>
            </div>

            {(message || error || (editing && dirty)) && (
              <div className="prf-notes">
                {message && <p className="msg msg--success" role="status">{message}</p>}
                {error && <p className="msg msg--error" role="alert">{error}</p>}
                {editing && dirty && !message && (
                  <p className="prf-dirty" role="status">
                    <Icon name="warning" size={14} />
                    Unsaved changes — reports keep showing <b>{savedName || 'the current name'}</b> until you save.
                  </p>
                )}
              </div>
            )}

            {editing && (
              <div className="prf-actions">
                <button className="btn btn--ghost" type="button" onClick={cancelEditing} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSave || saving}
                >
                  {!profile ? 'Loading…' : saving ? 'Saving changes…' : 'Save changes'}
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="prf-col">
          {/* Security: a summary only. Password and sessions live on the
              Security & privacy page. */}
          <section className="prf-panel card-enter" aria-label="Security">
            <div className="prf-panel__head">
              <h3>
                <Icon name="lock" size={15} />
                Security
              </h3>
              <span className="prf-panel__hint">password &amp; sessions</span>
            </div>
            <p className="prf-security__text">
              Change your password, sign out other devices and export your data on Security &amp; privacy.
            </p>
            {onNavigate && (
              <button
                type="button"
                className="btn btn--primary prf-security__btn"
                onClick={() => onNavigate('security')}
              >
                Open Security &amp; privacy →
              </button>
            )}
            <p className="prf-foot">
              <Icon name="shield" size={15} />
              Each change made there is recorded in your activity trail.
            </p>
          </section>

          <section className="prf-panel card-enter" aria-label="Recent activity">
            <div className="prf-panel__head">
              <h3>
                <Icon name="clock" size={15} />
                Recent activity
              </h3>
              <span className="prf-panel__hint">your audit trail</span>
            </div>

            {logsError && (
              <p className="msg msg--error" role="alert">
                Couldn't load your activity trail — check your connection and reopen this page.
              </p>
            )}
            {!logsError && logs.length === 0 && (
              <div className="profile-empty">
                <Icon name="clock" size={20} />
                <p>No activity recorded yet</p>
                <span>Actions you take across the system will appear here as they happen.</span>
              </div>
            )}
            {logs.length > 0 && (
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
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default Profile

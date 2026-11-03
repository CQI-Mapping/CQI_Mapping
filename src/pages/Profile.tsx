// Profile page: the account's identity record.
//
// 2026 modern-SaaS rework: a light identity header (avatar, name, email,
// quiet meta line) replaces the old dark hero banner. Below it, two
// purposeful cards — an editable "Public profile" (picture, full name and
// nickname through an explicit Edit → Save/Cancel cycle) and a read-only
// "Account details" list — with a personal activity trail closing the page.
//
// Built to the Profile & Security spec: only the picture, full name and
// nickname are editable; email, department, program, designation, role and
// account status display read-only. Password and session control live on
// the Security & Privacy page.
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

  // The user's own recent audit entries drive two views: the header's
  // "active" dot and the timeline card. Twelve entries keep the trail tidy;
  // a fetch failure is shown as its own state rather than being disguised
  // as an empty trail.
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
    <div className="programs-page profile">
      {/* Identity header — light and airy. The role's tint still shows as
          the dot on the avatar (data-role). */}
      <header className="pr-head panel card-enter" data-role={role}>
        <div className="pr-head__id">
          <div className="pr-avatar">
            {avatarSrc ? (
              <img className="pr-avatar__img" src={avatarSrc} alt="" />
            ) : (
              <span className="pr-avatar__fallback" aria-hidden="true">{initialsOf(displayName)}</span>
            )}
          </div>
          <div className="pr-head__who">
            <div className="pr-head__row">
              <h2 className="pr-head__name">
                {profile ? displayName || 'Your account' : 'Loading your account…'}
              </h2>
              {profile?.nickname && <span className="pr-head__nick">"{profile.nickname}"</span>}
              {profile && (
                <span className={`role-badge role-badge--${profile.role}`}>{ROLE_LABELS[role]}</span>
              )}
            </div>
            <p className="pr-head__email">
              <Icon name="mail" size={12} />
              {profile?.email ?? '—'}
            </p>
            <div className="pr-head__meta">
              <span className="pr-meta" title="Member since">
                <Icon name="calendar" size={12} />
                {profile?.created_at
                  ? `Member since ${new Date(profile.created_at).toLocaleDateString()}`
                  : 'Member since —'}
              </span>
              <span className="pr-meta" title="Last activity">
                <span
                  className={`pr-meta__dot${activeRecently ? '' : ' pr-meta__dot--idle'}`}
                  aria-hidden="true"
                />
                {latestEntry ? formatDayTime(latestEntry.created_at) : 'No activity yet'}
              </span>
            </div>
          </div>
        </div>

        {!editing && (
          <button
            type="button"
            className="btn btn--primary btn--sm pr-head__edit"
            onClick={startEditing}
            disabled={!profile}
            title="Changes your picture, full name and nickname only"
          >
            <Icon name="edit" size={13} />
            Edit profile
          </button>
        )}
      </header>

      {/* Two purposeful cards: the editable public profile, and the
          read-only account facts. Everything the server refuses to let the
          user touch renders as plain text — never a disabled input — so
          nothing looks editable that isn't. */}
      <div className="pr-grid">
        <section className="panel pr-card card-enter" aria-label="Profile information">
          <div className="pr-card__head">
            <h3><Icon name="user" size={14} /> Public profile</h3>
            <span className="pr-card__sub" role={editing ? 'status' : undefined}>
              {editing
                ? 'Editing name & picture only'
                : 'What others see across reports & audit logs'}
            </span>
          </div>

          {/* Picture row — explicit controls, no hover-only affordance. */}
          <div className="pr-photo">
            <div className="pr-photo__img">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" />
              ) : (
                <span aria-hidden="true">{initialsOf(displayName)}</span>
              )}
            </div>
            <div className="pr-photo__tools">
              <div className="pr-photo__btns">
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
              </div>
              <span className="pr-photo__hint">
                PNG · JPG · WebP · under 2 MB — falls back to your Gravatar or initials
              </span>
            </div>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={handleAvatarChange}
          />
          {avatarError && <p className="msg msg--error" role="alert">{avatarError}</p>}

          <div className="pr-form">
            <div className="pr-form__row">
              <label className="pr-label" htmlFor="pr-name-input">Full name</label>
              {editing ? (
                <input
                  id="pr-name-input"
                  className="input"
                  type="text"
                  value={fullName}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus
                />
              ) : (
                <p className="pr-value">
                  {profile ? savedName || <span className="pr-muted">—</span> : <span className="pr-muted">—</span>}
                </p>
              )}
            </div>

            <div className="pr-form__row">
              <label className="pr-label" htmlFor="pr-nick-input">Nickname</label>
              {editing ? (
                <input
                  id="pr-nick-input"
                  className="input"
                  type="text"
                  value={nickname}
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder='what friends call you — e.g. "Bebot"'
                  autoComplete="off"
                  onChange={(e) => setNickname(e.target.value)}
                />
              ) : (
                <p className="pr-value">
                  {savedNickname ? (
                    <span className="pr-value__nick">"{savedNickname}"</span>
                  ) : (
                    <span className="pr-muted">Not set</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {(message || error || (editing && dirty)) && (
            <div className="pr-notes">
              {message && <p className="msg msg--success" role="status">{message}</p>}
              {error && <p className="msg msg--error" role="alert">{error}</p>}
              {editing && dirty && !message && (
                <p className="pr-note" role="status">
                  <Icon name="warning" size={14} />
                  Unsaved changes — reports keep showing <b>{savedName || 'the current name'}</b> until you save.
                </p>
              )}
            </div>
          )}

          {editing && (
            <div className="pr-actions">
              <button
                className="btn btn--ghost"
                type="button"
                onClick={cancelEditing}
                disabled={saving}
              >
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

        <section className="panel pr-card card-enter" aria-label="Account details">
          <div className="pr-card__head">
            <h3><Icon name="shield" size={14} /> Account details</h3>
            <span className="pr-card__sub">Read-only</span>
          </div>

          <dl className="pr-rows">
            <div className="pr-row">
              <dt className="pr-row__k">Email address</dt>
              <dd className="pr-row__v">
                {profile?.email ?? '—'}
                {emailVerified && (
                  <span className="pr-verified" title="Email ownership was confirmed at sign-up">
                    <Icon name="check" size={9} strokeWidth={3.4} />
                    Verified
                  </span>
                )}
              </dd>
            </div>

            <div className="pr-row">
              <dt className="pr-row__k">Academic department</dt>
              <dd className="pr-row__v">
                {savedDepartment || <span className="pr-muted">Not set</span>}
              </dd>
            </div>

            <div className="pr-row">
              <dt className="pr-row__k">Academic program</dt>
              <dd className="pr-row__v">
                {program ? `${program.code} — ${program.name}` : <span className="pr-muted">Not assigned</span>}
              </dd>
            </div>

            <div className="pr-row">
              <dt className="pr-row__k">Position / designation</dt>
              <dd className="pr-row__v">
                {savedDesignation || <span className="pr-muted">Not set</span>}
              </dd>
            </div>

            <div className="pr-row">
              <dt className="pr-row__k">Assigned system role</dt>
              <dd className="pr-row__v pr-row__v--stack">
                {profile ? (
                  <>
                    <span className={`role-badge role-badge--${profile.role}`}>{ROLE_LABELS[role]}</span>
                    <small className="pr-row__cap">
                      {CAPABILITIES[role].title} · {CAPABILITIES[role].sub}
                    </small>
                  </>
                ) : (
                  <span className="pr-muted">—</span>
                )}
              </dd>
            </div>

            <div className="pr-row">
              <dt className="pr-row__k">Account status</dt>
              <dd className="pr-row__v pr-row__v--stack">
                <span className={`status-pill status-pill--${isArchived ? 'archived' : 'active'}`}>
                  <span className="status-pill__dot" aria-hidden="true" />
                  {isArchived ? 'Archived' : 'Active'}
                </span>
                <small className="pr-row__cap">
                  {isArchived ? 'signing in is disabled; contact an administrator' : 'signing in and access are enabled'}
                </small>
              </dd>
            </div>
          </dl>

          <p className="pr-rows-foot">
            <Icon name="shield" size={13} />
            Email, department, program, designation and role are set by your administrator —
            the profile editor only changes your picture and names.
          </p>
        </section>
      </div>

      {/* Personal audit trail. */}
      <section className="panel pr-card card-enter" aria-label="Recent activity">
        <div className="pr-card__head">
          <h3><Icon name="clock" size={14} /> Recent activity</h3>
          {onNavigate && (
            <button type="button" className="pf-link" onClick={() => onNavigate('security')}>
              Security &amp; privacy →
            </button>
          )}
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
          <ul className="pr-timeline">
            {logs.map((entry) => {
              const category = categoryOf(entry.action)
              return (
                <li key={entry.id}>
                  <div className="pr-tl-action">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    <span className={`pr-tl-pill pr-tl-pill--${categoryTone(category)}`}>
                      {categoryLabel(category)}
                    </span>
                  </div>
                  <div className="pr-tl-time">{formatDayTime(entry.created_at)}</div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default Profile

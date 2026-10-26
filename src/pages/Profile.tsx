// Profile page: lets a user view their own email/role and edit their full name.
// Saving writes an activity log entry (action only, no details) and reports
// the updated profile back to App.tsx.

import { useEffect, useState } from 'react'
import { useDraft } from '../hooks/useDraft'
import { updateProfile, addActivityLog, fetchActivityLogs } from '../services/database'
import { supabase } from '../utils/supabaseClient'
import type { Profile as ProfileType } from '../services/database'

interface ProfileProps {
  profile: ProfileType | null
  onSaved: (profile: ProfileType) => void
}

/** Consistent error text for either form. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Supabase's minimum password length — keep in sync with the project's auth config. */
const MIN_PASSWORD_LENGTH = 6

function Profile({ profile, onSaved }: ProfileProps) {
  // Draft survives page navigation; cleared on successful save and on Discard.
  const [draft, setDraft] = useDraft('cqi.draft.Profile', { fullName: profile?.full_name || '' })
  const { fullName } = draft
  const setFullName = (v: string) => setDraft((d) => ({ ...d, fullName: v }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const currentName = profile?.full_name ?? ''
  // Trim on both sides so whitespace-only edits do not count as a change.
  const dirty = fullName.trim() !== currentName
  const canSave = Boolean(profile) && dirty && fullName.trim().length > 0

  // Passwords stay in state only — useDraft persists to sessionStorage, which the
  // hook's own docs say never to use for secrets.
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  // The user's most recent activity-log entry, shown for context. A fresh
  // account has no entries and a fetch failure is not worth a page error —
  // the row just reads '—'.
  const [lastActivity, setLastActivity] = useState<string | null>(null)
  const [activityRefresh, setActivityRefresh] = useState(0)

  useEffect(() => {
    if (!profile?.email) return
    let cancelled = false
    fetchActivityLogs({ userEmail: profile.email, limit: 1 })
      .then((entries) => {
        if (!cancelled) setLastActivity(entries[0]?.created_at ?? null)
      })
      .catch(() => {
        // The log lookup is nice-to-have; ignore failures silently.
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email, activityRefresh])

  // Save the edited name, log it, and push the updated profile up to App.tsx.
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
      const updated = await updateProfile(profile.id, { full_name: fullName.trim() })
      await addActivityLog('profile.updated', {
        entity: 'profile',
        entity_id: updated.id,
        label: updated.full_name || updated.email,
      })
      onSaved(updated)
      setDraft({ fullName: updated.full_name || '' })
      setMessage('Profile saved.')
      setActivityRefresh((n) => n + 1)
    } catch (err) {
      setError('Failed to save profile: ' + describe(err))
    } finally {
      setSaving(false)
    }
  }

  // Set the name back to the saved value, wiping any half-typed edits.
  const handleDiscard = () => {
    setError('')
    setMessage('')
    setDraft({ fullName: currentName })
  }

  // Update the Supabase auth password for the signed-in user. Requires the
  // user to already hold a fresh session — Supabase rejects stale sessions.
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setPasswordError('')
    setPasswordMessage('')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
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
    } catch (err) {
      setPasswordError('Failed to change password: ' + describe(err))
    } finally {
      setChangingPassword(false)
    }
  }

  // Initials for the hero avatar — up to two leading letters of the name.
  const initials = (profile?.full_name || profile?.email || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <div className="programs-page profile">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">{initials || '◐'}</div>
          <div className="program-hero__titles">
            <h2>Profile</h2>
            <p>Your account — manage display name and review role.</p>
          </div>
        </div>
      </div>

      <form
        className="panel profile-card program-panel"
        onSubmit={handleSubmit}
        style={{ borderTop: '3px solid #16a34a' }}
      >
        {/* Read-only details pulled from the profile row */}
        <div className="profile-card__row">
          <span className="profile-card__label">Email</span>
          <span>{profile?.email}</span>
        </div>
        <div className="profile-card__row">
          <span className="profile-card__label">Role</span>
          <span className={`role-badge role-badge--${profile?.role}`}>{profile?.role}</span>
        </div>
        <div className="profile-card__row">
          <span className="profile-card__label">Member since</span>
          <span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</span>
        </div>
        <div className="profile-card__row">
          <span className="profile-card__label">Last activity</span>
          <span>{lastActivity ? new Date(lastActivity).toLocaleString() : '—'}</span>
        </div>

        {!profile && <p className="msg msg--info" role="status">Your profile is still loading — parts of the page are disabled until it arrives.</p>}


        {/* The only editable field: full name */}
        <label className="field">
          <span>Full name</span>
          <input
            className="input"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={!profile}
          />
        </label>

        {/* Steer the user when the button is disabled without a clear reason */}
        {dirty && !fullName.trim() && profile && (
          <p className="msg msg--info">Full name is required to save.</p>
        )}
        {dirty && fullName.trim() && profile && (
          <p className="msg msg--info" role="status">You have unsaved changes.</p>
        )}

        {error && <p className="msg msg--error" role="alert">{error}</p>}
        {message && <p className="msg msg--success" role="status">{message}</p>}

        <div className="profile-card__actions">
          {dirty && (
            <button className="btn btn--ghost" type="button" onClick={handleDiscard} disabled={saving}>
              Discard changes
            </button>
          )}
          <button className="btn btn--primary" type="submit" disabled={!canSave || saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Password: stored only in state, never in the session draft. */}
      <form
        className="panel profile-card program-panel"
        style={{ borderTop: '3px solid #16a34a' }}
        onSubmit={handlePasswordChange}
      >
        <h3>Password</h3>
        <p className="program-panel__sub">
          Choose a new password of at least {MIN_PASSWORD_LENGTH} characters.
        </p>

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

        {passwordError && <p className="msg msg--error" role="alert">{passwordError}</p>}
        {passwordMessage && <p className="msg msg--success" role="status">{passwordMessage}</p>}

        <button
          className="btn btn--primary"
          type="submit"
          disabled={!profile || changingPassword || !password || !confirmPassword}
        >
          {changingPassword ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </div>
  )
}

export default Profile

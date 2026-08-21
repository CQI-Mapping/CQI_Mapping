// Profile page: lets a user view their own email/role and edit their full name.
// Saving writes an activity log entry (action only, no details) and reports
// the updated profile back to App.tsx.

import { useState } from 'react'
import { updateProfile, addActivityLog } from '../services/database'
import type { Profile as ProfileType } from '../services/database'

interface ProfileProps {
  profile: ProfileType | null
  onSaved: (profile: ProfileType) => void
}

function Profile({ profile, onSaved }: ProfileProps) {
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Save the edited name, log it, and push the updated profile up to App.tsx.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const updated = await updateProfile(profile!.id, { full_name: fullName.trim() })
      await addActivityLog(profile!.email, 'profile.updated')
      onSaved(updated)
      setMessage('Profile saved.')
    } catch (err) {
      setError('Failed to save profile: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile">
      <div className="page-heading">
        <h2>Profile</h2>
        <p>View and edit your own information.</p>
      </div>

      <form className="panel profile-card" onSubmit={handleSubmit}>
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

        {/* The only editable field: full name */}
        <label className="field">
          <span>Full name</span>
          <input
            className="input"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>

        {error && <p className="msg msg--error">{error}</p>}
        {message && <p className="msg msg--success">{message}</p>}

        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}

export default Profile

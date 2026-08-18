// Profile page: lets a user view their own email/role and edit their full name.
// Saving writes an audit entry and reports the updated profile back to App.jsx.

import { useState } from 'react'
import { updateProfile, addActivityLog } from '../services/database'

function Profile({ profile, onSaved }) {
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Save the edited name, log it, and push the updated profile up to App.jsx.
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const updated = await updateProfile(profile.id, { full_name: fullName.trim() })
      await addActivityLog(profile.email, 'profile.updated', { full_name: fullName.trim() })
      onSaved(updated)
      setMessage('Profile saved.')
    } catch (e) {
      setError('Failed to save profile: ' + e.message)
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
          <span>{new Date(profile?.created_at).toLocaleDateString()}</span>
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

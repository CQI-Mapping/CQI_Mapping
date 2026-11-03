// Security & Privacy page — the account's security control panel.
//
// Spec'd sections, all fed by real data (nothing here invents security
// facts): change password (relocating the card the Profile page used to
// carry, with its same verify-then-update flow), the current session with
// its honest device/browser facts from the user-agent, sign-out of OTHER
// sessions behind a confirmation dialog (Supabase's `scope: 'others'` — the
// only session revocation the auth API supports), a factual privacy summary
// with the policy text and a download of this account's own data, and a
// security-only slice of the personal audit trail.

import { useEffect, useState } from 'react'
import Icon from '../components/icons'
import ConfirmDialog from '../components/ConfirmDialog'
import { supabase } from '../utils/supabaseClient'
import { addActivityLog, fetchActivityLogs } from '../services/database'
import { friendlyPasswordError } from '../utils/passwordErrors'
import { MIN_PASSWORD_LENGTH, passwordStrength, passwordVariety } from '../utils/passwordPolicy'
import { parseUserAgent } from '../utils/device'
import { formatDayTime } from '../utils/time'
import { saveBlob } from '../utils/download'
import { ACTION_LABELS } from './admin/ActivityLabels'
import type { Profile as ProfileType, ActivityLogEntry, UserRole } from '../services/database'

interface SecurityPrivacyProps {
  profile: ProfileType | null
  onNavigate?: (page: string) => void
}

/** Consistent error text. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Security-relevant = sign-ins and password changes. Nothing else. */
function isSecurityAction(action: string): boolean {
  return action.startsWith('auth.') || action === 'profile.password_changed'
}

function SecurityPrivacy({ profile, onNavigate }: SecurityPrivacyProps) {
  const role: UserRole = profile?.role ?? 'user'

  // ----- Password & Authentication -----

  // Passwords stay in component state only (never in sessionStorage).
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  const currentPasswordEntered = currentPassword.length > 0
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH
  const passwordVarietyCount = passwordVariety(password)
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const passwordStrengthValue = passwordStrength(password)
  const canSubmitPassword =
    Boolean(profile) &&
    !changingPassword &&
    currentPasswordEntered &&
    passwordLongEnough &&
    passwordsMatch

  // Update password in Supabase auth for the signed-in user and write to the
  // audit trail. Like a real system, the current password must be re-entered
  // and verified before the swap is allowed — the form never changes a
  // password blind.
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setPasswordError('')
    setPasswordMessage('')
    if (!currentPasswordEntered) {
      setPasswordError('Re-enter your current password so we know it is really you.')
      return
    }
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
      // The current password is proven by signing in with it — a wrong secret
      // fails the check and nothing is touched. On success Supabase simply
      // refreshes the live session, so the user stays signed in.
      const { data: { user } } = await supabase!.auth.getUser()
      const { error: verifyError } = await supabase!.auth.signInWithPassword({
        email: user?.email ?? profile.email,
        password: currentPassword,
      })
      if (verifyError) {
        setPasswordError('Your current password is incorrect — the password was not changed.')
        return
      }
      const { error: updateError } = await supabase!.auth.updateUser({ password })
      if (updateError) throw updateError
      await addActivityLog('profile.password_changed', {
        entity: 'profile',
        entity_id: profile.id,
        label: profile.full_name || profile.email,
      })
      setCurrentPassword('')
      setPassword('')
      setConfirmPassword('')
      setPasswordMessage('Password updated successfully.')
      setSecurityRefresh((n) => n + 1)
    } catch (err) {
      // The network layer logs only a bare "400"; keep the server's own
      // wording in the console so the exact rejection rule is visible
      // when debugging (it is also translated for the card above).
      const friendly = friendlyPasswordError(err)
      console.error('Password update rejected:', describe(err))
      setPasswordError(friendly ?? 'Failed to change password: ' + describe(err))
    } finally {
      setChangingPassword(false)
    }
  }

  // ----- Active sessions & devices -----

  const device = parseUserAgent()
  // The user row carries the real last sign-in instant (auth.last_sign_in_at).
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase!.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setLastSignInAt(data.user?.last_sign_in_at ?? null)
      })
      .catch(() => {
        // The chip simply reads "—" when the probe fails.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [signOutDone, setSignOutDone] = useState('')

  // Revokes every other session's refresh token (browser tabs, other
  // devices) while this tab keeps its session. This is the one revocation
  // endpoint Supabase exposes to a normal user — there is deliberately no
  // per-device list, because the auth API cannot enumerate or target an
  // individual session.
  const handleSignOutOthers = async () => {
    if (!profile) return
    setSignOutBusy(true)
    setSignOutError('')
    try {
      await supabase!.auth.signOut({ scope: 'others' })
      await addActivityLog('auth.signed_out_others', {
        entity: 'profile',
        entity_id: profile.id,
        label: profile.full_name || profile.email,
      })
      setConfirmSignOutOpen(false)
      setSignOutDone('Other sessions were signed out — they will be asked to sign in again. This device stays signed in.')
      setSecurityRefresh((n) => n + 1)
    } catch (err) {
      setSignOutError('Could not sign out the other sessions: ' + describe(err))
    } finally {
      setSignOutBusy(false)
    }
  }

  // ----- Privacy & account data -----

  const [policyOpen, setPolicyOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')

  // A real export: this account's own profile row plus its own audit trail —
  // the same data the RLS policies already let this user read. Nothing is
  // fetched on behalf of the user beyond their own reach.
  const handleExportData = async () => {
    if (!profile) return
    setExportBusy(true)
    setExportError('')
    try {
      let trail: Array<{ action: string; created_at: string }> = []
      try {
        const entries = await fetchActivityLogs({ userEmail: profile.email, limit: 500 })
        trail = entries.map((e: ActivityLogEntry) => ({ action: e.action, created_at: e.created_at }))
      } catch {
        // The trail slice stays empty and the export still carries the account.
      }
      const payload = {
        exported_at: new Date().toISOString(),
        account: {
          email: profile.email,
          full_name: profile.full_name,
          nickname: profile.nickname,
          role: profile.role,
          program_id: profile.program_id,
          status: profile.status ?? 'active',
          department: profile.department ?? null,
          designation: profile.designation ?? null,
          created_at: profile.created_at,
        },
        activity_trail: trail,
      }
      const stamp = new Date().toISOString().slice(0, 10)
      saveBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `cqi-account-data-${stamp}.json`,
      )
      await addActivityLog('profile.data_exported', {
        entity: 'profile',
        entity_id: profile.id,
        label: profile.full_name || profile.email,
      })
      setSecurityRefresh((n) => n + 1)
    } catch (err) {
      setExportError('Could not prepare your data: ' + describe(err))
    } finally {
      setExportBusy(false)
    }
  }

  // ----- Security activity -----

  const [securityLogs, setSecurityLogs] = useState<ActivityLogEntry[]>([])
  const [securityLoading, setSecurityLoading] = useState(true)
  const [securityError, setSecurityError] = useState(false)
  const [securityRefresh, setSecurityRefresh] = useState(0)

  useEffect(() => {
    if (!profile?.email) return
    let cancelled = false
    setSecurityLoading(true)
    setSecurityError(false)
    fetchActivityLogs({ userEmail: profile.email, limit: 60 })
      .then((entries) => {
        if (!cancelled) setSecurityLogs(entries.filter((entry) => isSecurityAction(entry.action)))
      })
      .catch(() => {
        if (!cancelled) setSecurityError(true)
      })
      .finally(() => {
        if (!cancelled) setSecurityLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email, securityRefresh])

  return (
    <div className="programs-page profile">
      <header className="program-hero">
        <div className="program-hero__left">
          <span className="program-hero__icon" aria-hidden="true">
            <Icon name="shield" size={18} />
          </span>
          <div>
            <h2 className="sec-hero__title">Security &amp; Privacy</h2>
            <p className="sec-hero__sub">
              Password, sessions, personal data, and the security events on your account
            </p>
          </div>
        </div>
      </header>

      <div className="profile-grid">
        {/* LEFT: password + sessions */}
        <div className="profile-col">
          <section className="panel profile-card card-enter" aria-label="Change password">
            <div className="profile-card__head">
              <h3><Icon name="lock" size={15} />Password &amp; authentication</h3>
              <span className="profile-card__hint">current password is verified first</span>
            </div>

            <form onSubmit={handlePasswordChange} noValidate>
              <label className="field">
                <span>Current password</span>
                <div className="profile-input-wrap">
                  <input
                    className="input"
                    type={showCurrentPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter the Current Password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                      if (passwordMessage) setPasswordMessage('')
                    }}
                    disabled={!profile || changingPassword}
                  />
                  <button
                    type="button"
                    className="profile-password-toggle"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                    title={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </label>

              <label className="field">
                <span>New password</span>
                <div className="profile-input-wrap">
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                      if (passwordMessage) setPasswordMessage('')
                    }}
                    disabled={!profile || changingPassword}
                  />
                  <button
                    type="button"
                    className="profile-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </label>

              <label className="field">
                <span>Confirm new password</span>
                <div className="profile-input-wrap">
                  <input
                    className="input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                      if (passwordMessage) setPasswordMessage('')
                    }}
                    disabled={!profile || changingPassword}
                  />
                  <button
                    type="button"
                    className="profile-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                    title={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
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
                <span
                  className={`profile-req${passwordVarietyCount === 4 ? ' profile-req--ok' : ''}`}
                  title="Advisory — the system requires 8 characters; this mix makes it stronger"
                >
                  <span className="profile-req__tick"><Icon name="check" size={9} strokeWidth={3.6} /></span>
                  Uppercase, lowercase, number &amp; symbol <small>(recommended)</small>
                </span>
              </div>

              {password && (
                <div className="profile-strength">
                  <div className="profile-strength__bar" aria-hidden="true">
                    <div className="profile-strength__fill" style={{ width: `${passwordStrengthValue * 100}%` }} />
                  </div>
                  <div className="profile-strength__labels">
                    <span>Weak</span>
                    <span>Strong</span>
                  </div>
                </div>
              )}

              {passwordError && <p className="msg msg--error" role="alert">{passwordError}</p>}
              {passwordMessage && <p className="msg msg--success" role="status">{passwordMessage}</p>}

              <button
                className="btn btn--primary profile-security-btn"
                type="submit"
                disabled={!canSubmitPassword}
              >
                {changingPassword ? 'Updating password…' : 'Update Password'}
              </button>
            </form>

            <p className="profile-security-foot">
              <Icon name="shield" size={15} />
              Your current password is verified before any change, your session stays signed in, and the update is logged to your activity trail.
            </p>
          </section>

          <section className="panel profile-card card-enter" aria-label="Active sessions">
            <div className="profile-card__head">
              <h3><Icon name="clock" size={15} />Active sessions &amp; devices</h3>
              <span className="profile-card__hint">this device is signed in</span>
            </div>

            <div className="sess-row">
              <span className="sess-row__icon" aria-hidden="true"><Icon name="doc" size={15} /></span>
              <div className="sess-row__who">
                <b>{device.device} · {device.browser}</b>
                <span>{device.os}{lastSignInAt ? ' — signed in ' + formatDayTime(lastSignInAt) : ''}</span>
              </div>
              <span className="pill-current">Current session</span>
            </div>

            {signOutDone && <p className="msg msg--success" role="status">{signOutDone}</p>}
            {signOutError && <p className="msg msg--error" role="alert">{signOutError}</p>}

            <p className="sess-note">
              Sessions on other devices or tabs stay active until they expire or are signed out below.
              Supabase cannot list them individually, so this is all-or-others: signing out everywhere
              else never touches the session you are using right now.
            </p>

            <button
              type="button"
              className="btn btn--ghost sess-signout-btn"
              onClick={() => setConfirmSignOutOpen(true)}
              disabled={!profile}
            >
              <Icon name="x" size={13} />
              Sign out other sessions
            </button>
          </section>
        </div>

        {/* RIGHT: privacy + security activity */}
        <div className="profile-col">
          <section className="panel profile-card card-enter" aria-label="Privacy and account data">
            <div className="profile-card__head">
              <h3><Icon name="user" size={15} />Privacy &amp; account data</h3>
              <span className="profile-card__hint">what is kept, and your copy</span>
            </div>

            <ul className="pp-list">
              <li>The account keeps <b>identity fields</b> — name, email, program, role, status — plus an optional profile picture.</li>
              <li>Actions you take are written to an <b>audit trail</b> used for CQI monitoring and reporting.</li>
              <li>Reports and logs show your <b>full name and role</b>; the nickname shows in quotes.</li>
              <li>You control your <b>name, nickname, picture and password</b> here. Email, program and status are set by an administrator on request.</li>
            </ul>

            <div className="pp-actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPolicyOpen(true)}>
                <Icon name="doc" size={13} />
                Privacy policy
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleExportData}
                disabled={!profile || exportBusy}
                title="Downloads your profile fields and your own activity entries as JSON"
              >
                <Icon name="download" size={13} />
                {exportBusy ? 'Preparing…' : 'Download my data'}
              </button>
            </div>
            {exportError && <p className="msg msg--error" role="alert">{exportError}</p>}
          </section>

          <section className="panel profile-card card-enter profile-card--fill" aria-label="Security activity">
            <div className="profile-card__head">
              <h3><Icon name="shield" size={15} />Security activity</h3>
              <span className="profile-card__hint">sign-ins &amp; password changes</span>
            </div>

            {securityLoading && (
              <p className="pp-loading" role="status">Checking your security trail…</p>
            )}
            {!securityLoading && securityError && (
              <p className="msg msg--error" role="alert">Couldn't load security events — reopen this page to try again.</p>
            )}
            {!securityLoading && !securityError && securityLogs.length === 0 && (
              <div className="profile-empty">
                <Icon name="shield" size={20} />
                <p>No security events yet</p>
                <span>Sign-ins and password changes on this account will appear here.</span>
              </div>
            )}
            {securityLogs.length > 0 && (
              <ul className="profile-timeline">
                {securityLogs.map((entry) => (
                  <li key={entry.id}>
                    <div className="pt-action">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </div>
                    <div className="pt-time">{formatDayTime(entry.created_at)}</div>
                  </li>
                ))}
              </ul>
            )}

            {role !== 'user' && onNavigate && securityLogs.length > 0 && (
              <div className="pp-foot">
                <button type="button" className="pf-link" onClick={() => onNavigate('activity-logs')}>
                  View the full activity log →
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Privacy policy — factual text about what this system stores. */}
      {policyOpen && (
        <div className="modal-overlay" onClick={() => setPolicyOpen(false)}>
          <div className="modal pp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Privacy policy">
            <div className="modal__header">
              <h3>Privacy policy — CQI Monitoring</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>NBSC · Institute of Computer Studies</p>
            </div>
            <div className="modal__body">
              <dl className="pp-policy">
                <dt>What we store</dt>
                <dd>
                  Your account identity (email, full name, optional nickname), your academic assignment
                  (program, department, designation, role, status), an optional profile picture, and an
                  audit trail of the actions you perform in the system.
                </dd>
                <dt>Why we store it</dt>
                <dd>
                  The CQI Monitoring System tracks curricula, outcomes, and reports. Your name and role
                  appear on records and reports you create or review, and the audit trail shows who changed
                  what — that attribution is the point of the monitoring process.
                </dd>
                <dt>Who can see it</dt>
                <dd>
                  Administrators can view and manage account records. Coordinators (managers) can list the
                  accounts of their program. Your public profile picture, once uploaded, is intended to be
                  visible beside your name in the system's reports.
                </dd>
                <dt>Your controls</dt>
                <dd>
                  You can edit your full name, nickname, and profile picture on the Profile page; change
                  your password here; sign out other sessions. Your email address, program assignment,
                  role, and account status change only through an administrator.
                </dd>
                <dt>Requests</dt>
                <dd>
                  Corrections, data beyond the "Download my data" export, or account deletion: contact the
                  system administrator. Archived accounts are kept but can no longer sign in.
                </dd>
              </dl>
            </div>
            <div className="modal__footer">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setPolicyOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign out other sessions — confirmation dialog for a sensitive action. */}
      <ConfirmDialog
        isOpen={confirmSignOutOpen}
        title="Sign out other sessions?"
        body={
          <>
            <p className="confirm-modal__body">
              Every signed-in tab and device <b>except this one</b> will be signed out and asked for the
              password again. Nothing you have saved is changed.
            </p>
            <p className="confirm-modal__body confirm-modal__body--soft">
              This is currently signed in: {device.device} · {device.browser} — it stays active.
            </p>
          </>
        }
        confirmLabel="Sign them out"
        busyLabel="Signing out…"
        cancelLabel="Cancel"
        danger
        busy={signOutBusy}
        onConfirm={handleSignOutOthers}
        onCancel={() => {
          if (!signOutBusy) setConfirmSignOutOpen(false)
        }}
      />
    </div>
  )
}

export default SecurityPrivacy

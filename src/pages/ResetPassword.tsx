// Set-a-new-password screen — the one place an account-holder still changes
// their own password. It appears only when a tab arrives through a
// password-recovery email link (App's PASSWORD_RECOVERY branch swaps the whole
// app shell for this screen), replacing the password card once carried by
// Profile. Reuses the sign-in page's classes so it reads as its sibling, not
// a new visual language.
//
// Two states past the form (screens 4 & 5 of design/profile-reset-redesign.html):
//   • success  — "Password updated" card; the recovery session (which was only
//                ever good for choosing a new password) is signed out, and a
//                short countdown returns the person to the sign-in page.
//   • An expired link never reaches this page: App detects the bounce and
//     renders ResetLinkExpired instead.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { addActivityLog } from '../services/database'
import { friendlyPasswordError } from '../utils/passwordErrors'
import { MIN_PASSWORD_LENGTH } from '../utils/passwordPolicy'

/** Consistent error text, same helper Profile uses. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface ResetPasswordProps {
  /** Called once the password is set AND the reset session is over — App hands
   *  the normal login screen back, so the sign-in that follows comes fresh. */
  onDone: () => void
}

export default function ResetPassword({ onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Success state: once the new password is stored the form is replaced by the
  // "Password updated" card (screen 4 of the mockup) and a countdown begins.
  const [done, setDone] = useState(false)
  const [countdown, setCountdown] = useState(5)
  // Guard so the countdown firing and a button click can't both sign out.
  const closingRef = useRef(false)

  // Escape hatch: a reset link opened by accident should never trap the tab.
  const handleExit = async () => {
    await supabase!.auth.signOut()
  }

  // End the reset session and hand control back. The recovery session was
  // only ever valid for choosing a new password — signing out means the next
  // sign-in genuinely comes from the fresh password, and no uploaded photo,
  // form state or tab ever rides the recovery session into the app.
  const finishToSignIn = async () => {
    if (closingRef.current) return
    closingRef.current = true
    try {
      await supabase!.auth.signOut()
    } catch {
      // The session may already be gone — the goal is to end it either way.
    }
    onDone()
  }

  // Fire once the success screen shows: tick the countdown, and when it lands
  // on zero, finish. Closing at any point (button) unmounts this effect.
  useEffect(() => {
    if (!done) return
    if (countdown <= 0) {
      void finishToSignIn()
      return
    }
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, countdown])

  // Write the new password into the signed-in user (the recovery link
  // exchanged a session), replay the audit row the old profile card used to
  // write so the trail keeps mapping to the same label, then show the
  // success card. The audit write must never mask a completed password
  // change — it is logged, never thrown into the user's face.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await supabase!.auth.updateUser({ password })
      if (updateError) throw updateError
      const { data: { user } } = await supabase!.auth.getUser()
      try {
        await addActivityLog('profile.password_changed', {
          entity: 'profile',
          entity_id: user?.id ?? '',
          label: user?.email ?? 'account',
        })
      } catch (auditError) {
        console.warn('Password-change audit row skipped:', describe(auditError))
      }
      setDone(true)
    } catch (err) {
      const friendly = friendlyPasswordError(err)
      console.error('Password update rejected:', describe(err))
      setError(friendly ?? 'Could not set the password: ' + describe(err))
    } finally {
      setBusy(false)
    }
  }

  // Success (mockup screen 4): full auth-styled card with the animated check.
  // The session ends here — the countdown or the button both land on the
  // sign-in page where the new password does its first job.
  if (done) {
    return (
      <div className="login-page">
        {/* Same aurora backdrop as the sign-in screen */}
        <div className="login-blobs" aria-hidden="true">
          <span className="login-blob login-blob--1" />
          <span className="login-blob login-blob--2" />
          <span className="login-blob login-blob--3" />
        </div>

        <div className="login-panel">
          <div className="login-card">
            <div className="login-brand">
              <div className="login-brand-mark"><img src="/LOGO.png" alt="Institute of Computer Studies" className="login-brand-logo" /></div>
              <h1>LANTAW</h1>
              <p className="login-subtitle">NBSC · Institute of Computer Studies</p>
            </div>

            <svg className="login-check" viewBox="0 0 96 96" width="84" height="84" aria-hidden="true">
              <circle cx="48" cy="48" r="41" />
              <path d="M31 50l12 12 22-24" />
            </svg>

            <h2 className="login-success-title">Password updated</h2>
            <p className="login-success-sub">
              Sign in with your new password — this reset session is finished, and the change
              is on your activity trail.
            </p>

            <button type="button" className="login-btn" onClick={finishToSignIn}>
              Go to the sign-in page →
            </button>
            <p className="login-count-note" role="timer">
              Returning automatically in <b>{countdown} second{countdown === 1 ? '' : 's'}</b>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      {/* Same aurora backdrop as the sign-in screen */}
      <div className="login-blobs" aria-hidden="true">
        <span className="login-blob login-blob--1" />
        <span className="login-blob login-blob--2" />
        <span className="login-blob login-blob--3" />
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-mark"><img src="/LOGO.png" alt="Institute of Computer Studies" className="login-brand-logo" /></div>
            <h1>LANTAW</h1>
            <p className="login-subtitle">NBSC · Institute of Computer Studies</p>
          </div>

          <p className="login-reset-description">
            You opened a password-reset link. Pick a new password — then use it on the sign-in page.
          </p>

          {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError('') }}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-password">Repeat new password</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirm-password"
                  placeholder="Type the same password again"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError('') }}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Escape hatch: a link opened by accident should never trap the tab. */}
            <button
              type="button"
              className="login-reset-link"
              onClick={handleExit}
            >
              ← Sign out and back to the sign-in page
            </button>

            <button type="submit" className="login-btn" disabled={busy} aria-busy={busy}>
              {busy ? (
                <span className="login-btn__busy">
                  <svg className="login-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Updating…
                </span>
              ) : (
                <>Set New Password →</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

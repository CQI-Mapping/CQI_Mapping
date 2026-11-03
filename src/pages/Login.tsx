// Login page: the only entry point to the system.
// Validates fields client-side, shows a generic error (never leaks Supabase details),
// and records every sign-in attempt to the audit log via the record_login_event RPC.
// School-scoped Google sign-in sits alongside the password form: same card,
// same audit trail. App.tsx handles what the OAuth return drops on this page's
// doorstep — the archived check and the audit row — because a Google sign-in
// lands a session straight into the app shell without passing through here.

import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { recordLoginEvent, fetchOwnProfileStatus } from '../services/database'

interface LoginProps {
  /** Message inherited from App.tsx — currently the archived-account refusal. */
  notice?: string | null
}

function Login({ notice }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false) // true while the sign-in request is in flight
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')

  // Password-reset request state. The reply is deliberately the same whether
  // or not the address exists, so the form can't be used to enumerate accounts.
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  // Google sign-in has its own busy state: the OAuth round-trip can take a
  // couple of seconds, and this flow cannot set busy on the password button
  // (the page usually navigates away before the request resolves — the popup
  // / redirect does the work).
  const [googleBusy, setGoogleBusy] = useState(false)

  // The official Google "G" logo, inline — no icon font or dependency needed.
  const GoogleLogo = () => (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.8 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.8c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.1 7.1-10.2 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15.1-5.6l-7.7-6c-2.1 1.4-4.8 2.3-7.4 2.3-6.4 0-11.7-3.7-13.6-9l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  )

  // Starts the school-scoped OAuth redirect. Supabase's callback endpoint
  // performs everything google_callback.php used to hand-roll (state check,
  // code exchange, ID-token verify) on their behalf; the session lands back
  // at this origin, where App.tsx's listener takes over.
  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleBusy(true)
    const { error: oauthError } = await supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    })
    if (oauthError) {
      const msg = (oauthError.message || '').toLowerCase()
      setError(
        msg.includes('provider') || msg.includes('not enabled')
          ? 'Google sign-in is not set up yet. Ask your administrator to enable it in the auth settings.'
          : 'Could not start Google sign-in right now — try again in a moment.'
      )
      setGoogleBusy(false)
    }
    // On success stay "busy" until the browser redirects — flickering the
    // button back to normal for a beat would look like nothing happened.
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side validation: fail fast without calling the API.
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      return
    }

    setBusy(true)

    const { data, error } = await supabase!.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })

    if (error) {
      // Service/config failures must NOT masquerade as wrong passwords —
      // otherwise a broken .env sends users chasing their credentials forever.
      // (Credential rejections stay generic by design: never reveal whether
      // the email exists, whether it's a bad password, rate limit, etc.)
      const msg = (error.message || '').toLowerCase()
      const status = (error as { status?: number }).status
      const isServiceFailure =
        status === 401 ||
        status === 500 ||
        msg.includes('api key') ||
        msg.includes('failed to fetch') ||
        msg.includes('network') ||
        msg.includes('load failed')
      recordLoginEvent(trimmedEmail, false, isServiceFailure ? 'service_unreachable' : 'invalid_credentials')
      setError(
        isServiceFailure
          ? 'Cannot reach the auth service. Check your connection and .env keys, then restart the dev server.'
          : 'Invalid email or password.',
      )
      setBusy(false)
      return
    }

    // Archived account: the credential still works (the auth user is
    // untouched — that is what makes the archive reversible), but the
    // profile row says the account is parked, so the session is dropped
    // before it ever reaches the app shell. The row is readable by its own
    // owner under RLS, so one small query settles it for every role.
    const userId = data.user?.id
    if (userId) {
      try {
        const status = await fetchOwnProfileStatus(userId)
        if (status === 'archived') {
          await supabase!.auth.signOut()
          recordLoginEvent(trimmedEmail, false, 'account_archived')
          setError('This account has been archived. Ask your administrator to restore it.')
          setBusy(false)
          return
        }
      } catch {
        // A failed status probe must not lock anyone out of a healthy
        // account: fall through and let the app continue — its own profile
        // load will surface any real problem.
      }
    }

    // Success: App.tsx picks up the new session and swaps in the dashboard.
    // Fire-and-forget audit write — it must never block the login.
    recordLoginEvent(trimmedEmail, true)
  }

  // Send a password-reset email. The link lands back on this app (same origin),
  // where supabase-js exchanges the token, signs the user in, and the app swaps
  // in its Set-a-new-password screen for them to pick a new one.
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetSent(false)

    const trimmed = resetEmail.trim()
    if (!trimmed) {
      setResetError('Email is required.')
      return
    }

    setResetBusy(true)
    try {
      const { error } = await supabase!.auth.resetPasswordForEmail(trimmed, {
        redirectTo: window.location.origin + '/',
      })
      if (error) throw error
      // Hedged wording: the app never reveals whether the address is registered.
      setResetSent(true)
    } catch {
      setResetError('Could not send the reset email right now. Try again in a moment.')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="login-page">
      {/* Animated aurora blobs */}
      <div className="login-blobs" aria-hidden="true">
        <span className="login-blob login-blob--1" />
        <span className="login-blob login-blob--2" />
        <span className="login-blob login-blob--3" />
      </div>

      {/* Sign-in form panel */}
      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-mark"><img src="/LOGO.png" alt="Institute of Computer Studies" className="login-brand-logo" /></div>
            <h1>CQI Monitoring</h1>
            <p className="login-subtitle">NBSC · Institute of Computer Studies</p>
          </div>

          {mode === 'signin' ? (
            <>
              {notice && <div className="login-alert login-alert--error" role="alert">{notice}</div>}
              {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-10 6L2 7" />
                    </svg>
                    <input
                      type="email"
                      id="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
                      autoComplete="email"
                      autoFocus
                      aria-invalid={error ? true : undefined}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError('') }}
                      autoComplete="current-password"
                      aria-invalid={error ? true : undefined}
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
                  <button
                    type="button"
                    className="login-reset-link"
                    onClick={() => { setMode('forgot'); setResetEmail(email); setError('') }}
                  >
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className="login-btn" disabled={busy} aria-busy={busy}>
                  {busy ? (
                    <span className="login-btn__busy">
                      <svg className="login-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Signing in…
                    </span>
                  ) : (
                    <>Sign In →</>
                  )}
                </button>
              </form>

              <div className="login-divider" aria-hidden="true">or</div>

              <button
                type="button"
                className="login-google-btn"
                onClick={handleGoogleSignIn}
                disabled={googleBusy}
                aria-busy={googleBusy}
                title="Sign in with your NBSC Google account"
              >
                {googleBusy ? (
                  <span className="login-btn__busy">
                    <svg className="login-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Opening Google…
                  </span>
                ) : (
                  <>
                    <GoogleLogo />
                    Continue with Google
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <p className="login-reset-description">
                Enter your account email and we'll send a link to set a new password.
              </p>

              {resetError && <div className="login-alert login-alert--error" role="alert">{resetError}</div>}
              {resetSent && (
                <div className="login-alert login-alert--info" role="status">
                  If that address has an account, a reset link is on its way. Please check
                  your inbox (and spam folder), then open the link to pick a new password.
                </div>
              )}

              {resetSent ? (
                <button
                  type="button"
                  className="login-reset-link login-reset-link--block"
                  onClick={() => setMode('signin')}
                >
                  ← Back to sign in
                </button>
              ) : (
                <form onSubmit={handleReset} noValidate>
                  <div className="form-group">
                    <label htmlFor="reset-email">Email</label>
                    <div className="input-wrap">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M22 7l-10 6L2 7" />
                      </svg>
                      <input
                        type="email"
                        id="reset-email"
                        placeholder="you@example.com"
                        value={resetEmail}
                        onChange={(e) => { setResetEmail(e.target.value); if (resetError) setResetError('') }}
                        autoComplete="email"
                        autoFocus
                        aria-invalid={resetError ? true : undefined}
                      />
                    </div>
                  </div>

                  <button type="submit" className="login-btn" disabled={resetBusy} aria-busy={resetBusy}>
                    {resetBusy ? (
                      <span className="login-btn__busy">
                        <svg className="login-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Sending…
                      </span>
                    ) : (
                      <>Send reset link</>
                    )}
                  </button>

                  <button
                    type="button"
                    className="login-reset-link login-reset-link--block"
                    onClick={() => { setMode('signin'); setResetError(''); setResetSent(false) }}
                  >
                    ← Back to sign in
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p className="login-footer">© 2026 NBSC · Institute of Computer Studies</p>
      </div>
    </div>
  )
}

export default Login
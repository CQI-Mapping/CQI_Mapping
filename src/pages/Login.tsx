// Login page: the only entry point to the system.
// Validates fields client-side, shows a generic error (never leaks Supabase details),
// and records every sign-in attempt to the audit log via the record_login_event RPC.

import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { recordLoginEvent } from '../services/database'

function Login() {
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

    const { error } = await supabase!.auth.signInWithPassword({
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
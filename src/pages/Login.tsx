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
      // Generic message by design — don't reveal whether the email exists,
      // whether it's a bad password, rate limit, etc.
      recordLoginEvent(trimmedEmail, false, 'invalid_credentials')
      setError('Invalid email or password.')
      setBusy(false)
      return
    }

    // Success: App.tsx picks up the new session and swaps in the dashboard.
    // Fire-and-forget audit write — it must never block the login.
    recordLoginEvent(trimmedEmail, true)
  }

  return (
    <div className="login-page">
      {/* Sign-in form panel */}
      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            {/* ICS-inspired microchip logo */}
            <div className="login-brand-mark" role="img" aria-label="CQI logo">
              <svg className="login-chip" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                {/* outer chip */}
                <rect x="15" y="15" width="34" height="34" rx="4" stroke="currentColor" strokeWidth="2" />
                {/* inner core */}
                <rect x="23" y="23" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
                {/* top pins */}
                <path d="M24 9v6M32 9v6M40 9v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                {/* bottom pins */}
                <path d="M24 49v6M32 49v6M40 49v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                {/* left pins */}
                <path d="M9 24h6M9 32h6M9 40h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                {/* right pins */}
                <path d="M49 24h6M49 32h6M49 40h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                {/* corner pads */}
                <circle cx="24" cy="24" r="1.4" fill="currentColor" />
                <circle cx="40" cy="24" r="1.4" fill="currentColor" />
                <circle cx="24" cy="40" r="1.4" fill="currentColor" />
                <circle cx="40" cy="40" r="1.4" fill="currentColor" />
                {/* CQI text on the core */}
                <text x="32" y="36.5" textAnchor="middle" fill="currentColor" fontWeight="800" fontSize="13" fontFamily="inherit" letterSpacing="0.5">
                  CQI
                </text>
              </svg>
            </div>

            <h1>
              Northern Bukidnon State College
              <span>Institute for Computer Studies</span>
            </h1>
            <p className="login-brand-dept">BS Information Technology</p>
          </div>

          <h2>Continuous Quality Improvement</h2>
          <p className="login-subtitle">Curriculum and Program Outcomes Management System</p>

          {error && <div className="login-alert login-alert--error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
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
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
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
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
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

            <button type="submit" className="login-btn" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
              {!busy && ' →'}
            </button>
          </form>

          {/* Dev convenience: the seeded test accounts for the demo */}
          <p className="login-hint">
            Test Accounts:
            <br />
            <strong>Admin</strong> — admin@cqi.test / Admin@123456
            <br />
            <strong>Manager</strong> — manager@cqi.test / Manager@123456
            <br />
            <strong>User</strong> — user@cqi.test / User@123456
          </p>
        </div>

        <p className="login-footer">© 2026 NBSC • Institute of Computer Studies</p>
      </div>
    </div>
  )
}

export default Login
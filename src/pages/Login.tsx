// Login page: the only entry point to the system.
// Validates fields client-side, shows a generic error (never leaks Supabase details),
// and records every sign-in attempt to the audit log via the record_login_event RPC.

import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { recordLoginEvent } from '../services/database'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
            <div className="login-brand-mark">CQI</div>
            <div>
              <h1>CQI Monitoring System</h1>
              <p>Curriculum Mapping · Outcomes Alignment</p>
            </div>
          </div>

          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in to access your dashboard.</p>

          {error && <div className="login-alert login-alert--error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="login-btn" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
              {!busy && ' →'}
            </button>
          </form>

          {/* Dev convenience: the seeded test accounts for the demo */}
          <p className="login-hint">
            Test accounts:
            <br />
            <strong>Admin</strong> — admin@cqi.test / Admin@123456
            <br />
            <strong>Manager</strong> — manager@cqi.test / Manager@123456
            <br />
            <strong>User</strong> — user@cqi.test / User@123456
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login

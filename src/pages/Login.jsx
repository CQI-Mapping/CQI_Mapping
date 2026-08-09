// Login page: the only entry point to the system.
// Validates fields client-side, shows a generic error (never leaks Supabase details),
// and records every sign-in attempt to the audit log via the record_login_event RPC.

import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { recordLoginEvent } from '../services/database'

// Inline SVG curriculum map — a decorative background that evokes the
// D3.js course learning outcome / program outcome mapping central to the
// thesis. Pure SVG + CSS, no dependencies, scales with the panel via viewBox.
function LoginMap() {
  const X_CLO = 85 // x of the course learning outcome column
  const X_PO = 400 // x of the program outcome column

  // Left column: course learning outcome nodes (CLO). Right column: program outcome nodes (PO).
  const courses = [
    { id: 'CLO1', y: 100 },
    { id: 'CLO2', y: 240 },
    { id: 'CLO3', y: 380 },
    { id: 'CLO4', y: 510 },
  ]
  const outcomes = [
    { id: 'PO1', y: 70 },
    { id: 'PO2', y: 190 },
    { id: 'PO3', y: 310 },
    { id: 'PO4', y: 430 },
    { id: 'PO5', y: 540 },
  ]

  // CLO -> PO connections, like checked cells in a mapping matrix.
  const edges = [
    { clo: 0, po: 0 }, { clo: 0, po: 1 },
    { clo: 1, po: 1 }, { clo: 1, po: 2 },
    { clo: 2, po: 2 }, { clo: 2, po: 3 },
    { clo: 3, po: 3 }, { clo: 3, po: 4 },
  ]

  // Positions for the faint graph-paper grid lines.
  const gridLines = (step, max) =>
    Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)

  return (
    <svg
      className="login-map"
      viewBox="0 0 480 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g className="login-map__grid">
        {gridLines(40, 480).map((x) => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="600" />
        ))}
        {gridLines(40, 600).map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="480" y2={y} />
        ))}
      </g>

      {/* Mapping edges (curved lines with animated flow) */}
      {edges.map(({ clo, po }, i) => {
        const mx = (X_CLO + X_PO) / 2
        const my = (courses[clo].y + outcomes[po].y) / 2
        return (
          <path
            key={`${clo}-${po}`}
            className="login-map__edge"
            style={{ animationDelay: `${(i % 4) * 0.4}s` }}
            d={`M ${X_CLO} ${courses[clo].y} Q ${mx} ${my} ${X_PO} ${outcomes[po].y}`}
          />
        )
      })}

      {/* Course learning outcome nodes + labels */}
      {courses.map((c, i) => (
        <g key={c.id}>
          <circle
            className="login-map__node"
            style={{ animationDelay: `${i * 0.45}s` }}
            cx={X_CLO}
            cy={c.y}
            r="8"
          />
          <text className="login-map__node-label" x={X_CLO - 16} y={c.y + 4} textAnchor="end">
            {c.id}
          </text>
        </g>
      ))}

      {/* Program outcome nodes + labels */}
      {outcomes.map((o, i) => (
        <g key={o.id}>
          <circle
            className="login-map__node"
            style={{ animationDelay: `${i * 0.45}s` }}
            cx={X_PO}
            cy={o.y}
            r="8"
          />
          <text className="login-map__node-label" x={X_PO + 16} y={o.y + 4} textAnchor="start">
            {o.id}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false) // true while the sign-in request is in flight

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Client-side validation: fail fast without calling the API.
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      return
    }

    setBusy(true)

    const { error } = await supabase.auth.signInWithPassword({
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

    // Success: App.jsx picks up the new session and swaps in the dashboard.
    // Fire-and-forget audit write — it must never block the login.
    recordLoginEvent(trimmedEmail, true)
  }

  return (
    <div className="login-page">
      {/* Left branding panel (hidden on small screens) */}
      <div className="login-left">
        <LoginMap />
        <div className="login-left-inner">
          <div className="login-left-mark">CQI</div>
          <h2 className="login-left-title">
            Design and Development of <em>Data-Driven CQI Monitoring System</em>
            for Curriculum Mapping and Outcomes Alignment using D3.js
          </h2>
          <p>
            A data-driven CQI monitoring system for curriculum mapping and
            outcomes alignment — role-based access for system administrators,
            program heads, and faculty, enforced at the UI and database level.
          </p>

          <div className="login-features">
            <div className="login-feature">
              <span className="login-feature-icon">&#128220;</span>
              <div className="login-feature-text">
                <strong>Curriculum mapping</strong>
                Map courses to program outcomes and track alignment across the curriculum.
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">&#127891;</span>
              <div className="login-feature-text">
                <strong>Outcomes alignment</strong>
                Monitor CQI indicators and course-to-outcome (CLO/PO) attainment.
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">&#128202;</span>
              <div className="login-feature-text">
                <strong>D3.js dashboards</strong>
                Interactive visualizations of mapping and outcomes data.
              </div>
            </div>
          </div>
        </div>

        {/* Legend for the map behind */}
        <div className="login-map-legend">CLO = Course Learning Outcome · PO = Program Outcome</div>
      </div>

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

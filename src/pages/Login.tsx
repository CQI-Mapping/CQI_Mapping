// Login page: the only entry point to the system.
// Validates fields client-side, shows a generic error (never leaks Supabase details),
// and records every sign-in attempt to the audit log via the record_login_event RPC.
// UI: "IT FEST 2025" poster theme — cream paper + green watercolor brush splash.
// Styles live in src/styles/Login.css.

import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { recordLoginEvent } from '../services/database'
import '../styles/Login.css'

/* --- decorative poster art (pure inline SVG, no asset files needed) --- */

// University seal approximation (navy ring, gold torch, open book).
function SealMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lp-seal-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#27529f" />
          <stop offset="1" stopColor="#173069" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#lp-seal-bg)" />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke="#e7b83c" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="24.5" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1" />
      {/* torch */}
      <path
        d="M32 12c3.2 3.4 4.6 6 3.4 9.4 1.8-.4 2.6-1.8 2.8-3.2 1.6 3.4 1 6.6-2.2 8.2-3.6 1.8-8-.2-7.4-4.6.3-2.4 1.6-3.6 3.4-9.8z"
        fill="#f0c04a"
      />
      <rect x="30.4" y="26.6" width="3.2" height="14" rx="1.4" fill="#f0c04a" />
      {/* open book */}
      <path
        d="M14 42c6.5-3.6 12.3-3.9 17-.4 4.7-3.5 10.5-3.2 17 .4v9c-6.5-3.6-12.3-3.9-17-.4-4.7-3.5-10.5-3.2-17 .4z"
        fill="#f5f2e6"
      />
      <path d="M31 42v8.4" stroke="#b9a86e" strokeWidth="1.4" />
      {/* stars */}
      <circle cx="20" cy="20" r="1.4" fill="#f0c04a" />
      <circle cx="44" cy="20" r="1.4" fill="#f0c04a" />
      <circle cx="32" cy="15.4" r="1.4" fill="#f0c04a" />
    </svg>
  )
}

// Wavy hairline texture for the hero's bottom edge.
function HeroWaves() {
  return (
    <svg className="login-hero__waves" viewBox="0 0 900 210" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="#cbc5ae" strokeWidth="1.1" opacity="0.85">
        {Array.from({ length: 8 }, (_, i) => {
          const b = i * 24
          return (
            <path
              key={i}
              d={`M0 ${b + 30} C 150 ${b} 300 ${b + 58} 450 ${b + 30} S 750 ${b} 900 ${b + 30}`}
            />
          )
        })}
      </g>
    </svg>
  )
}

// The big green watercolor splash with grunge edges, lime flecks and washes.
function BrushSplash() {
  return (
    <svg className="splash-art" viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* roughens the blob edges so it reads as a painted brush stroke */}
        <filter id="lp-grunge" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" />
        </filter>
        {/* softer watercolor bleed for washes */}
        <filter id="lp-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.045" numOctaves="3" seed="11" result="noise2" />
          <feDisplacementMap in="SourceGraphic" in2="noise2" scale="26" />
        </filter>
        {/* tiny splatter jiggle for the lime flecks */}
        <filter id="lp-splat" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09 0.09" numOctaves="2" seed="3" result="noise3" />
          <feDisplacementMap in="SourceGraphic" in2="noise3" scale="9" />
        </filter>
      </defs>

      {/* pale watercolor washes (left + bottom-right, on the cream) */}
      <g filter="url(#lp-soft)">
        <path
          d="M210 760 C 150 700 190 600 300 590 C 420 578 520 640 500 720 C 480 800 300 830 210 760 Z"
          fill="#9ed0c4"
          opacity="0.5"
        />
        <path
          d="M90 850 C 60 780 140 720 250 736 C 360 752 420 800 380 850 C 340 900 140 900 90 850 Z"
          fill="#cfe3d0"
          opacity="0.55"
        />
        <circle cx="1120" cy="900" r="160" fill="#d8e7d2" opacity="0.5" />
      </g>

      {/* hairline waves along the bottom (the blob paints over them) */}
      <g fill="none" stroke="#c8c3ad" strokeWidth="1" opacity="0.8">
        {Array.from({ length: 9 }, (_, i) => {
          const b = i * 24
          return (
            <path
              key={i}
              d={`M0 ${b + 800} C 200 ${b + 770} 400 ${b + 828} 600 ${b + 800} S 1000 ${b + 770} 1190 ${b + 800}`}
            />
          )
        })}
      </g>

      {/* main brush blob + tonal overlays */}
      <g filter="url(#lp-grunge)">
        <g transform="rotate(-6 640 460)">
          <path
            d="M690 60 C 850 42 1015 118 1048 248 C 1158 296 1172 456 1078 528 C 1158 648 1072 786 932 808 C 900 936 726 968 612 890 C 486 950 336 872 324 742 C 202 704 182 562 268 478 C 186 372 262 244 394 228 C 428 120 556 78 690 60 Z"
            fill="#356f44"
          />
          <path
            d="M690 60 C 850 42 1015 118 1048 248 C 1158 296 1172 456 1078 528 C 1158 648 1072 786 932 808 C 900 936 726 968 612 890 C 486 950 336 872 324 742 C 202 704 182 562 268 478 C 186 372 262 244 394 228 C 428 120 556 78 690 60 Z"
            fill="#24512c"
            opacity="0.25"
            transform="translate(-26 40) scale(0.94)"
          />
          <path
            d="M690 60 C 850 42 1015 118 1048 248 C 1158 296 1172 456 1078 528 C 1158 648 1072 786 932 808 C 900 936 726 968 612 890 C 486 950 336 872 324 742 C 202 704 182 562 268 478 C 186 372 262 244 394 228 C 428 120 556 78 690 60 Z"
            fill="#58995d"
            opacity="0.38"
            transform="translate(30 -26) scale(0.96)"
          />
        </g>
      </g>

      {/* lime flecks / splatter */}
      <g filter="url(#lp-splat)" fill="#b4df4d">
        <circle cx="612" cy="642" r="15" />
        <circle cx="658" cy="606" r="9" opacity="0.85" />
        <circle cx="700" cy="651" r="7" opacity="0.8" />
        <circle cx="566" cy="612" r="20" opacity="0.85" />
        <circle cx="748" cy="622" r="9" opacity="0.9" />
        <circle cx="626" cy="694" r="8" opacity="0.75" />
        <circle cx="544" cy="662" r="11" opacity="0.7" />
        <circle cx="836" cy="540" r="8" opacity="0.85" />
        <circle cx="500" cy="560" r="6" opacity="0.7" />
        <circle cx="756" cy="690" r="10" opacity="0.6" />
        <circle cx="690" cy="570" r="5" />
      </g>
      {/* small dark accents on the cream */}
      <circle cx="392" cy="500" r="5" fill="#2c5b33" opacity="0.9" />
      <g filter="url(#lp-splat)" fill="#2c5b33">
        <ellipse cx="990" cy="915" rx="60" ry="26" opacity="0.85" />
        <ellipse cx="1082" cy="942" rx="34" ry="14" opacity="0.7" />
      </g>
    </svg>
  )
}

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

  return (
    <div className="login-page">
      {/* LEFT: cream paper panel with the sign-in form */}
      <section className="login-hero">
        <HeroWaves />
        <span className="ldot ldot--1" aria-hidden="true" />
        <span className="ldot ldot--2" aria-hidden="true" />
        <span className="ldot ldot--3" aria-hidden="true" />

        <div className="login-panel">
          <div className="login-card">
            <div className="login-brand">
              <SealMark className="login-brand-mark" />
              <h1>CQI Monitoring</h1>
              <p className="login-subtitle">NBSC · Institute of Computer Studies</p>
            </div>

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

            {/* Demo convenience: seeded test accounts in a collapsible */}
            <details className="login-demo">
              <summary>View test accounts</summary>
              <p className="login-hint">
                <strong>Admin</strong> — admin@cqi.test / Admin@123456
                <br />
                <strong>Manager</strong> — manager@cqi.test / Manager@123456
                <br />
                <strong>User</strong> — user@cqi.test / User@123456
              </p>
            </details>
          </div>

          <p className="login-footer">© 2026 NBSC · Institute of Computer Studies</p>
        </div>
      </section>

      {/* RIGHT: the green brush splash with poster branding */}
      <section className="login-splash">
        <BrushSplash />

        <div className="splash-logos">
          <SealMark className="seal" />
        </div>

        <div className="splash-hero">
          <h2 className="splash-title">
            <span>CQI</span>
            <span>MONITORING</span>
          </h2>
        </div>
      </section>
    </div>
  )
}

export default Login

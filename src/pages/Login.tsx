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

// Full-bleed green panel — the paint covers the whole right side edge to
// edge so the login feels like a real website hero. Painterly tonal washes
// (light top, olive band, deep bottom), drips sliding from the top edge,
// a lime-fleck band under the title and barely-there hairline waves.
function BrushSplash() {
  return (
    <svg className="splash-art" viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* ragged painterly edges on the tonal washes */}
        <filter id="lp-grunge" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.035" numOctaves="4" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" />
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
        {/* torn, ragged edges for the top drips */}
        <filter id="lp-tear" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="3" seed="5" result="noise4" />
          <feDisplacementMap in="SourceGraphic" in2="noise4" scale="34" />
        </filter>
      </defs>

      {/* ground: fills the entire panel, every edge bleeds off-screen */}
      <rect x="-160" y="-160" width="1520" height="1320" fill="#3f7d4b" filter="url(#lp-grunge)" />

      {/* tonal layers: light top-left, olive sky band, deep bottom */}
      <g filter="url(#lp-soft)">
        <path
          d="M-40 520 C 90 560 240 540 330 470 C 430 390 430 240 340 140 C 260 48 90 20 -40 80 Z"
          fill="#4c8a57"
          opacity="0.5"
        />
        <path
          d="M430 300 C 560 340 640 460 600 580 C 565 690 420 720 330 650 C 240 580 240 420 310 340 C 350 300 380 280 430 300 Z"
          fill="#57995d"
          opacity="0.3"
        />
        <path
          d="M120 -80 C 40 40 90 180 230 220 C 380 262 540 210 580 100 C 615 0 540 -110 420 -130 Z"
          fill="#7fae6d"
          opacity="0.35"
        />
        <path
          d="M-80 640 C 20 700 60 810 200 855 C 370 908 540 865 580 760 C 617 668 490 590 350 585 C 210 580 -80 590 -80 640 Z"
          fill="#2e633c"
          opacity="0.4"
        />
      </g>

      {/* faint mint mist near the bottom of the field */}
      <g filter="url(#lp-soft)" fill="#9fd4c4" opacity="0.16">
        <ellipse cx="820" cy="800" rx="300" ry="150" />
        <ellipse cx="1100" cy="920" rx="240" ry="120" opacity="0.8" />
        <ellipse cx="450" cy="920" rx="240" ry="110" opacity="0.7" />
      </g>

      {/* drips sliding down from the top edge */}
      <g filter="url(#lp-tear)" fill="#2e633c" opacity="0.5">
        <path d="M170 -30 C 165 60 180 115 205 62 C 218 30 196 2 185 -18 Z" />
        <path d="M300 -30 C 296 80 315 132 340 76 C 352 46 322 8 310 -16 Z" />
        <path d="M440 -26 C 437 62 455 112 478 60 C 489 32 462 2 452 -16 Z" opacity="0.8" />
        <path d="M560 -26 C 558 55 574 98 596 50 C 606 24 578 -4 566 -20 Z" opacity="0.7" />
      </g>

      {/* barely-there hairline waves near the bottom */}
      <g fill="none" stroke="#2e633c" strokeWidth="1" opacity="0.16">
        {Array.from({ length: 6 }, (_, i) => {
          const b = i * 20
          return (
            <path
              key={i}
              d={`M0 ${b + 858} C 260 ${b + 840} 520 ${b + 876} 780 ${b + 858} S 1040 ${b + 840} 1200 ${b + 858}`}
            />
          )
        })}
      </g>

      {/* lime flecks in a band under the title */}
      <g filter="url(#lp-splat)" fill="#b5df4d">
        <circle cx="580" cy="430" r="6" opacity="0.8" />
        <circle cx="660" cy="430" r="8" opacity="0.7" />
        <circle cx="740" cy="460" r="6" opacity="0.8" />
        <circle cx="600" cy="470" r="12" opacity="0.85" />
        <rect x="640" y="500" width="26" height="26" rx="8" transform="rotate(18 653 513)" opacity="0.9" />
        <circle cx="700" cy="520" r="9" />
        <circle cx="770" cy="540" r="13" opacity="0.9" />
        <rect x="700" y="560" width="34" height="20" rx="10" transform="rotate(-14 717 570)" opacity="0.75" />
        <circle cx="640" cy="580" r="7" opacity="0.8" />
        <circle cx="820" cy="500" r="7" opacity="0.7" />
        <circle cx="520" cy="520" r="8" opacity="0.7" />
        <ellipse cx="850" cy="560" rx="20" ry="12" opacity="0.65" />
        <circle cx="650" cy="610" r="9" opacity="0.75" />
        <circle cx="720" cy="645" r="6" opacity="0.7" />
        <circle cx="680" cy="690" r="8" opacity="0.7" />
        <circle cx="615" cy="665" r="6" opacity="0.6" />
      </g>

      {/* tiny light accents low on the field */}
      <g filter="url(#lp-splat)" fill="#9fd4a8" opacity="0.5">
        <circle cx="470" cy="820" r="6" />
        <circle cx="540" cy="860" r="4" />
        <circle cx="905" cy="862" r="6" />
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

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

// The green brush stroke laid out like the reference poster: a paint mass
// anchored to the top-right corner (bleeding off the top and right edges),
// torn drips along its bottom edge, an olive wash bleeding off the shoulder,
// mint/teal watercolor cascades below, and a lime-fleck band under the title.
function BrushSplash() {
  const STROKE =
    'M620 -60 C 520 30 470 70 440 150 C 380 210 320 260 300 340 C 250 415 262 480 332 505 C 302 565 342 625 424 622 C 470 688 562 698 622 648 C 661 714 722 736 782 686 C 802 762 862 776 902 716 C 930 794 1002 786 1022 716 C 1082 806 1162 776 1182 696 C 1232 656 1242 516 1201 466 C 1222 379 1200 250 1151 180 C 1181 80 1121 -20 1021 -42 Z'

  return (
    <svg className="splash-art" viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* roughens the stroke edges so it reads as a painted brush stroke */}
        <filter id="lp-grunge" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.035" numOctaves="4" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="70" />
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
        {/* torn, ragged edges for the hanging drips */}
        <filter id="lp-tear" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="3" seed="5" result="noise4" />
          <feDisplacementMap in="SourceGraphic" in2="noise4" scale="42" />
        </filter>
      </defs>

      {/* olive watercolor bleeding above the stroke's shoulder */}
      <g filter="url(#lp-soft)">
        <path
          d="M340 -60 C 250 30 270 150 360 205 C 450 252 560 245 625 185 C 700 120 705 15 640 -55 Z"
          fill="#7fae6d"
          opacity="0.42"
        />
        <path
          d="M240 280 C 180 360 190 450 270 495 C 350 540 460 520 505 445 C 545 375 505 300 440 272 C 370 244 285 232 240 280 Z"
          fill="#8db47b"
          opacity="0.3"
        />
      </g>

      {/* pale mint/teal watercolor cascades below the stroke */}
      <g filter="url(#lp-soft)">
        <path
          d="M420 600 C 330 680 370 800 540 830 C 720 862 830 790 780 690 C 735 596 520 520 420 600 Z"
          fill="#cfe7d8"
          opacity="0.6"
        />
        <path
          d="M640 700 C 560 780 600 900 760 920 C 930 942 1020 860 970 760 C 925 670 730 620 640 700 Z"
          fill="#9fd4c4"
          opacity="0.5"
        />
        <path
          d="M860 640 C 790 700 820 800 950 830 C 1080 858 1170 800 1140 710 C 1110 628 940 580 860 640 Z"
          fill="#bde0cf"
          opacity="0.5"
        />
        <path
          d="M700 860 C 660 910 690 970 800 986 C 900 1000 960 950 940 890 C 922 842 760 810 700 860 Z"
          fill="#7fbfae"
          opacity="0.35"
        />
      </g>

      {/* hairline waves along the bottom (the stroke paints over them) */}
      <g fill="none" stroke="#c8c3ad" strokeWidth="1" opacity="0.65">
        {Array.from({ length: 9 }, (_, i) => {
          const b = i * 24
          return (
            <path
              key={i}
              d={`M0 ${b + 790} C 200 ${b + 760} 400 ${b + 818} 600 ${b + 790} S 1000 ${b + 760} 1190 ${b + 790}`}
            />
          )
        })}
      </g>

      {/* torn drips hanging off the stroke's bottom edge */}
      <g filter="url(#lp-tear)" fill="#356f44">
        <path d="M470 560 C 460 640 480 700 505 640 C 520 600 500 570 490 555 Z" />
        <path d="M560 600 C 552 700 572 760 600 690 C 615 650 585 615 570 592 Z" opacity="0.95" />
        <path d="M660 630 C 652 730 676 780 702 710 C 715 670 690 650 672 626 Z" opacity="0.9" />
        <path d="M760 660 C 754 760 780 800 806 730 C 818 695 790 675 772 656 Z" />
        <path d="M880 640 C 880 740 906 770 930 700 C 940 668 915 655 898 636 Z" opacity="0.85" />
        <path d="M985 590 C 990 680 1015 700 1035 640 C 1044 610 1020 600 1002 588 Z" opacity="0.9" />
      </g>

      {/* main paint stroke (bleeds off the top and right edges) */}
      <g filter="url(#lp-grunge)">
        <path d={STROKE} fill="#3f7d4b" />
        <path d={STROKE} fill="#2e633c" opacity="0.3" transform="translate(-30 44) scale(0.93)" />
        <path d={STROKE} fill="#57995d" opacity="0.35" transform="translate(34 -30) scale(0.95)" />
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
      </g>

      {/* small dark paint hits on the cream */}
      <circle cx="392" cy="500" r="5" fill="#2c5b33" opacity="0.9" />
      <g filter="url(#lp-splat)" fill="#2e5f38">
        <ellipse cx="1040" cy="935" rx="66" ry="24" opacity="0.9" />
        <ellipse cx="1128" cy="958" rx="34" ry="13" opacity="0.8" />
        <circle cx="970" cy="952" r="9" opacity="0.7" />
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

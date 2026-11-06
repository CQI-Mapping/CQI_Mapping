// Expired / already-used password-recovery link — screen 5 of
// design/profile-reset-redesign.html, translated to the sign-in page's
// classes. App swaps the whole shell for this screen when the bounced URLs
// error params say the emailed link is dead. The honest core of the message:
// nothing was changed — the account's current password still works, and the
// only way to get a fresh link is an administrator (the sign-in page has no
// self-service reset by design, so this screen points straight at them).

interface ResetLinkExpiredProps {
  /** Escape hatch: straight back to the sign-in form. */
  onBackToLogin: () => void
}

export default function ResetLinkExpired({ onBackToLogin }: ResetLinkExpiredProps) {
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
            <h1>CQI Monitoring</h1>
            <p className="login-subtitle">NBSC · Institute of Computer Studies</p>
          </div>

          <div className="login-alert login-alert--warn" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>
              <b>This link has expired or was already used.</b><br />
              Reset links are single-use and valid for about an hour. Nothing was
              changed — your current password still works. Open a fresh link to try again.
            </span>
          </div>

          <p className="login-reset-description">
            The fix is an administrator action: they can send a fresh password-reset
            email (Supabase dashboard → Authentication → Users → the account's row),
            or resend the invite if the account never finished its setup.
          </p>

          <button
            type="button"
            className="login-reset-link login-reset-link--block"
            onClick={onBackToLogin}
          >
            ← Back to the sign-in page
          </button>
        </div>

        <p className="login-footer">© 2026 NBSC · Institute of Computer Studies</p>
      </div>
    </div>
  )
}

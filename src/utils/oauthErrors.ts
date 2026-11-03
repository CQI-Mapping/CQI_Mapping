// Auth-return interpretation — the one place that turns the raw `error` /
// `error_description` values a failed auth round-trip leaves behind in the URL
// into a verdict the UI can act on: a dead recovery link needs its own screen,
// every other bounce just needs one friendly line. Generic by design —
// provider internals are never quoted back to the user (same rule the
// password forms follow in passwordErrors.ts).

export interface AuthReturnVerdict {
  /** True when the failure is a password-recovery email link that expired. */
  expiredResetLink: boolean
  /** The single human line shown for the failure. */
  message: string
}

/**
 * Interpret the error params of a returned auth URL (OAuth bounce or a
 * password-recovery link that failed to verify). Both sources are matched
 * together because the params may arrive as query string or URL fragment.
 */
export function interpretAuthReturnError(
  rawError: string | null,
  rawDescription: string | null,
): AuthReturnVerdict {
  const combined = `${rawError ?? ''} ${rawDescription ?? ''}`.toLowerCase()

  // The verify endpoint bounces a dead recovery link back as
  // error=access_denied + "Email link is invalid or has expired" — so the
  // expiry rule is checked BEFORE the access_denied cancellation rule, which
  // would otherwise swallow it.
  if (combined.includes('invalid or has expired') || combined.includes('email link')) {
    return {
      expiredResetLink: true,
      message: 'This reset link has expired or was already used.',
    }
  }

  // Sign-ups-disabled is more specific than a plain OAuth cancellation: the
  // bounce for an unregistered Google account ALSO arrives as
  // error=access_denied, so this rule must run before the cancellation one.
  if (combined.includes('signup') || combined.includes('sign up') || combined.includes('disabled')) {
    return {
      expiredResetLink: false,
      message:
        'Google sign-in works only for registered accounts. Ask your administrator to add you.',
    }
  }

  if (combined.includes('access_denied') || combined.includes('cancelled')) {
    return {
      expiredResetLink: false,
      message: 'Google sign-in was cancelled or did not complete.',
    }
  }

  return {
    expiredResetLink: false,
    message: 'Google sign-in could not be completed. Try again in a moment.',
  }
}

/**
 * Wipe any leftover auth params (query and fragment) from the address bar so a
 * refresh or shared link never replays the failure.
 */
export function scrubAuthReturnUrl(): void {
  window.history.replaceState({}, document.title, window.location.origin + '/')
}

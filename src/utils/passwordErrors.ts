// Supabase rejects some password updates server-side with raw policy
// wording ("New password should be different from the old password.",
// HaveIBeenPwned hit, beyond-the-client minimum length). These helpers
// translate the known wordings into the same plain language the forms
// use elsewhere, and return null for anything unrecognised so callers
// can fall back to the server's original text instead of hiding it.

/**
 * Plain-language text for a known password-policy rejection, else null.
 */
export function friendlyPasswordError(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err)

  // Reusing the current password — newer Supabase versions refuse it.
  if (/different from the (old|current) password/i.test(raw)) {
    return 'Pick a password that is different from the one you use now.'
  }
  // A server-side minimum above what was typed (dashboard auth config).
  const length = raw.match(/at least (\d+) characters/i)
  if (length) {
    return `Password must be at least ${length[1]} characters.`
  }
  // "Leaked password protection" checks the HaveIBeenPwned corpus.
  if (/leaked|breached|haveibeenpwned|weak since/i.test(raw)) {
    return 'That password appears in known data breaches — choose a stronger, unique one.'
  }
  // "Secure password change"/re-authentication policy: the session must be
  // a genuinely fresh sign-in before the server accepts a password swap.
  if (/reauthenticat/i.test(raw)) {
    return 'Sign out and back in once (or use the reset link), then try again — the server wants a fresh sign-in before changing your password.'
  }
  return null
}

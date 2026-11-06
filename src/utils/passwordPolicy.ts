// Shared password policy — the single source of truth for every password
// form (Security & Privacy page, reset screen). The Supabase project also
// enforces a minimum length in its own auth config; keeping the number here
// means the client's checklist can never drift from one form to another.

/** Minimum accepted password length — mirrors the auth config. */
export const MIN_PASSWORD_LENGTH = 8

/** How many character families (lower / upper / digit / symbol) a password touches. */
export function passwordVariety(password: string): number {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length
}

/**
 * 0 → empty, small value → below the floor, otherwise a blend of length and
 * character variety that fills the strength bar. Same curve the profile
 * password card has always used, now shared by every password form.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0
  if (password.length < MIN_PASSWORD_LENGTH) return 0.15
  return 0.45 + 0.55 * (0.7 * Math.min(password.length / 16, 1) + 0.3 * (passwordVariety(password) / 4))
}

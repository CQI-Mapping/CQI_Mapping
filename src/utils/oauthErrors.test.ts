// Tests for the auth-return verdict. The real strings come from Supabase's
// verify endpoint and Google's OAuth bounce; the expiry phrasing in
// particular is quoted verbatim so the matcher keeps working.

import { describe, expect, it } from 'vitest'
import { interpretAuthReturnError } from './oauthErrors'

describe('interpretAuthReturnError', () => {
  it('recognises an expired recovery link from Supabase’s verify bounce', () => {
    const verdict = interpretAuthReturnError(
      'access_denied',
      'Email link is invalid or has expired',
    )
    expect(verdict.expiredResetLink).toBe(true)
    expect(verdict.message).toContain('expired or was already used')
  })

  it('prefers the expiry reading when both markers collide in one param', () => {
    // The bounced description carries "access_denied" too — the reset-screen
    // verdict must not be swallowed by the cancellation rule.
    const verdict = interpretAuthReturnError(
      null,
      'hash: error=access_denied&error_description=the email link is invalid or has expired',
    )
    expect(verdict.expiredResetLink).toBe(true)
  })

  it('reads an OAuth cancellation as a cancelled sign-in, not a dead link', () => {
    const verdict = interpretAuthReturnError('access_denied', 'The user has cancelled the request')
    expect(verdict.expiredResetLink).toBe(false)
    expect(verdict.message).toContain('cancelled')
  })

  it('reads a sign-ups-disabled bounce as the registered-accounts rule', () => {
    const verdict = interpretAuthReturnError('access_denied', 'Sign up is disabled for this project')
    expect(verdict.expiredResetLink).toBe(false)
    expect(verdict.message).toContain('registered accounts')
  })

  it('reads the closed-registration trigger refusal as the registered-accounts rule', () => {
    // A Google identity nobody registered is refused at user-creation time
    // (migration 017's trigger); GoTrue surfaces that as this same
    // "Database error saving new user" bounce.
    const verdict = interpretAuthReturnError('unexpected_failure', 'Database error saving new user')
    expect(verdict.expiredResetLink).toBe(false)
    expect(verdict.message).toContain('registered accounts')
  })

  it('falls back to the generic line for anything unrecognised', () => {
    const verdict = interpretAuthReturnError('server_error', 'Internal Server Error')
    expect(verdict.expiredResetLink).toBe(false)
    expect(verdict.message).toContain('Try again')
  })

  it('treats empty params as the generic line', () => {
    const verdict = interpretAuthReturnError(null, null)
    expect(verdict.expiredResetLink).toBe(false)
  })
})

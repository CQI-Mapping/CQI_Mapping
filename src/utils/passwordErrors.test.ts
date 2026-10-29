// Friendly translation of Supabase's server-side password rejections.

import { describe, expect, it } from 'vitest'
import { friendlyPasswordError } from './passwordErrors'

describe('friendlyPasswordError', () => {
  it('translates the same-password rejection', () => {
    expect(friendlyPasswordError(new Error('New password should be different from the old password.'))).toBe(
      'Pick a password that is different from the one you use now.',
    )
  })

  it('echoes the server minimum when the length wording appears', () => {
    expect(friendlyPasswordError(new Error('Password should be at least 12 characters.'))).toBe(
      'Password must be at least 12 characters.',
    )
  })

  it('translates the leaked-password rejection', () => {
    expect(
      friendlyPasswordError(new Error('Password is weak since it is found in the HaveIBeenPwned database.')),
    ).toBe('That password appears in known data breaches — choose a stronger, unique one.')
  })

  it('returns null for unknown errors so the raw text survives', () => {
    expect(friendlyPasswordError(new Error('Some unexpected failure'))).toBeNull()
  })

  it('reads strings as well as Error objects', () => {
    expect(friendlyPasswordError('New password should be different from the old password.')).toBe(
      'Pick a password that is different from the one you use now.',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordStrength, passwordVariety } from './passwordPolicy'

describe('passwordPolicy', () => {
  it('keeps the policy constant in one place', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('counts each character family once', () => {
    expect(passwordVariety('')).toBe(0)
    expect(passwordVariety('abcdefgh')).toBe(1) // lower only
    expect(passwordVariety('Abcdefgh')).toBe(2) // mixed case
    expect(passwordVariety('Abcdefg1')).toBe(3) // + digit
    expect(passwordVariety('Abcdefg1!')).toBe(4) // + symbol
  })

  it('empty password has no strength', () => {
    expect(passwordStrength('')).toBe(0)
  })

  it('short passwords sit at the weak floor regardless of variety', () => {
    expect(passwordStrength('aB3!')).toBeCloseTo(0.15)
  })

  it('passes the floor with a longer, more varied password', () => {
    expect(passwordStrength('abcdefgh')).toBeGreaterThanOrEqual(0.45)
    expect(passwordStrength('Abcdefghij12!KLMnop')).toBeGreaterThan(
      passwordStrength('abcdefghij'),
    )
  })
})

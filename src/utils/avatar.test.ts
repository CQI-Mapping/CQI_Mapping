// Tests for the email-derived avatar helpers. The SHA-256 vector comes from
// Gravatar's own documentation, so the integration is provable offline.

import { describe, expect, it } from 'vitest'
import { gravatarHash, gravatarUrl, initialsOf } from './avatar'

describe('initialsOf', () => {
  it('takes the leading letters of the first two words', () => {
    expect(initialsOf('Maria S. dela Cruz')).toBe('MS')
  })

  it('collapses runs of whitespace', () => {
    expect(initialsOf('  Juan   Dela')).toBe('JD')
  })

  it('reads "··" when there is nothing to derive from', () => {
    expect(initialsOf('')).toBe('··')
    expect(initialsOf('   ')).toBe('··')
  })

  it('keeps one letter for single-word names', () => {
    expect(initialsOf('juan')).toBe('J')
  })
})

describe('gravatarHash', () => {
  it('matches Gravatar\'s documented vector for a normalized email', async () => {
    // docs.gravatar.com: SHA-256 of the trimmed, lowercased email.
    expect(await gravatarHash('MyEmailAddress@example.com ')).toBe(
      '84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee',
    )
  })

  it('normalizes casing and surrounding whitespace away first', async () => {
    expect(await gravatarHash('MYEMAILADDRESS@EXAMPLE.COM')).toBe(
      await gravatarHash('myemailaddress@example.com'),
    )
  })

  it('is null without an email', async () => {
    expect(await gravatarHash(null)).toBeNull()
    expect(await gravatarHash('   ')).toBeNull()
  })
})

describe('gravatarUrl', () => {
  it('asks the avatar endpoint for real account photos only (d=404)', async () => {
    const url = await gravatarUrl('MyEmailAddress@example.com', 256)
    expect(url).toBe(
      'https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?s=256&d=404',
    )
  })

  it('is deterministic — the same email always yields the same picture', async () => {
    expect(await gravatarUrl('a.user@nbsc.edu.ph')).toBe(await gravatarUrl('a.user@nbsc.edu.ph', 256))
  })

  it('is null without an email', async () => {
    expect(await gravatarUrl(null)).toBeNull()
  })
})

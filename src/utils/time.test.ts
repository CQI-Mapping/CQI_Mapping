import { describe, expect, it } from 'vitest'
import { formatDayTime, timeAgo } from './time'

describe('formatDayTime', () => {
  it('labels today and yesterday', () => {
    const now = new Date()
    const today = formatDayTime(now.toISOString())
    expect(today).toMatch(/^Today · /)

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    // The day boundary math rounds; one second before noon-yesterday would
    // still read "Yesterday" only if it landed in the previous calendar day,
    // so construct at a fixed offset safely inside it.
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
    expect(formatDayTime(y.toISOString())).toMatch(/^Yesterday · /)
    // The unused expression keeps the first sample wired to the test.
    void yesterday
  })

  it('falls back to a calendar date further back', () => {
    const d = new Date(2026, 0, 15, 9, 14)
    expect(formatDayTime(d.toISOString())).toMatch(/^Jan 15 · /)
  })

  it('passes through strings it cannot parse', () => {
    expect(formatDayTime('not-a-date')).toBe('not-a-date')
  })
})

describe('timeAgo', () => {
  // A fixed "now" keeps the ladder deterministic regardless of when the
  // suite runs.
  const now = new Date(2026, 10, 4, 12, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('climbs the just-now → minutes → hours → days ladder', () => {
    expect(timeAgo(ago(30_000), now)).toBe('just now')
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5m ago')
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h ago')
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2d ago')
  })

  it('never reports a negative ago for clock skew', () => {
    const future = new Date(now.getTime() + 5 * 60_000).toISOString()
    expect(timeAgo(future, now)).toBe('just now')
  })

  it('falls back to a short calendar date after a week', () => {
    expect(timeAgo(ago(15 * 86_400_000), now)).toMatch(/^[A-Z][a-z]{2} \d+$/)
  })

  it('passes through strings it cannot parse', () => {
    expect(timeAgo('not-a-date')).toBe('not-a-date')
  })
})

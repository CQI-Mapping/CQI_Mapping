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
  const now = new Date(2026, 10, 5, 15, 0).getTime()
  const at = (y: number, m: number, d: number, h: number, min = 0) =>
    new Date(y, m, d, h, min).toISOString()

  it('reads short gaps in minutes and hours', () => {
    expect(timeAgo(new Date(now - 30_000).toISOString(), now)).toBe('Just now')
    expect(timeAgo(new Date(now - 12 * 60_000).toISOString(), now)).toBe('12 min ago')
    expect(timeAgo(at(2026, 10, 5, 12), now)).toBe('3 hr ago')
  })

  it('treats a timestamp slightly ahead of the clock as just now', () => {
    expect(timeAgo(new Date(now + 5 * 60_000).toISOString(), now)).toBe('Just now')
  })

  it('names the previous calendar day and counts days up to a week', () => {
    expect(timeAgo(at(2026, 10, 4, 20), now)).toBe('Yesterday')
    expect(timeAgo(at(2026, 10, 1, 15), now)).toBe('4 days ago')
  })

  it('falls back to a calendar date past a week, with the year once it differs', () => {
    expect(timeAgo(at(2026, 9, 16, 9), now)).toMatch(/^Oct 16$/)
    expect(timeAgo(at(2025, 11, 30, 9), now)).toMatch(/^Dec 30, 2025$/)
  })

  it('passes through strings it cannot parse', () => {
    expect(timeAgo('not-a-date', now)).toBe('not-a-date')
  })
})

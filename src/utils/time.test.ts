import { describe, expect, it } from 'vitest'
import { formatDayTime } from './time'

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

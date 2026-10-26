// Tests for the banner clock helpers. Hours are built with the local
// Date constructor, so getHours() reads them back exactly wherever run.

import { describe, expect, it } from 'vitest'
import { localISODate, timeGreeting } from './clock'

/** A local date at hour `h` on a fixed day. */
const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m)

describe('timeGreeting', () => {
  it("greets the morning before noon — shortly after midnight included", () => {
    expect(timeGreeting(at(0, 0))).toBe('Good morning')
    expect(timeGreeting(at(5, 59))).toBe('Good morning')
    expect(timeGreeting(at(11, 59))).toBe('Good morning')
  })

  it("greets the afternoon from noon until 5:59 PM", () => {
    expect(timeGreeting(at(12, 0))).toBe('Good afternoon')
    expect(timeGreeting(at(17, 59))).toBe('Good afternoon')
  })

  it("greets the evening from 6 PM until midnight", () => {
    expect(timeGreeting(at(18, 0))).toBe('Good evening')
    expect(timeGreeting(at(23, 59))).toBe('Good evening')
  })

  it('turns over exactly at noon and 6 PM', () => {
    expect(timeGreeting(at(11, 59))).not.toBe(timeGreeting(at(12, 0)))
    expect(timeGreeting(at(17, 59))).not.toBe(timeGreeting(at(18, 0)))
  })
})

describe('localISODate', () => {
  it('pads month and day to two digits', () => {
    expect(localISODate(new Date(2026, 9, 27))).toBe('2026-10-27')
    expect(localISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('always agrees with the local getFullYear/getMonth/getDate read', () => {
    expect(localISODate(new Date(2026, 9, 27, 23, 0))).toBe('2026-10-27')
    expect(localISODate(new Date(2026, 9, 28, 0, 30))).toBe('2026-10-28')
  })
})

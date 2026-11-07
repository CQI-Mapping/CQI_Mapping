import { describe, expect, it } from 'vitest'
import { labelSchoolYearStart, schoolYearOptions, schoolYearStartFor } from './schoolYear'

describe('schoolYearStartFor', () => {
  it('puts August through December in the school year that just opened', () => {
    expect(schoolYearStartFor(new Date(2026, 7, 1))).toBe(2026) // Aug 1 2026
    expect(schoolYearStartFor(new Date(2026, 10, 7))).toBe(2026) // Nov 7 2026
    expect(schoolYearStartFor(new Date(2026, 11, 31))).toBe(2026) // Dec 31 2026
  })

  it('puts January through July in the school year that is still running', () => {
    expect(schoolYearStartFor(new Date(2026, 0, 15))).toBe(2025) // Jan 15 2026
    expect(schoolYearStartFor(new Date(2026, 6, 31))).toBe(2025) // Jul 31 2026
  })
})

describe('labelSchoolYearStart', () => {
  it('reads a four-digit pair the way the records spell it', () => {
    expect(labelSchoolYearStart('BSIT 2026-2027')).toBe(2026)
    expect(labelSchoolYearStart('SY2019-2020')).toBe(2019)
    expect(labelSchoolYearStart('BSIT 2020/2021')).toBe(2020)
    expect(labelSchoolYearStart('BSIT 2026-2027 v2')).toBe(2026)
  })

  it('reads a two-digit trailing year', () => {
    expect(labelSchoolYearStart('BSIT 2019-20')).toBe(2019)
  })

  it('rejects nothing-like-a-year labels instead of guessing', () => {
    expect(labelSchoolYearStart('BSIT general education')).toBe(null)
    expect(labelSchoolYearStart('ROOM 104')).toBe(null)
  })

  it('rejects pairs that are not one year apart', () => {
    expect(labelSchoolYearStart('2019-2025')).toBe(null)
    expect(labelSchoolYearStart('BSIT 2026-31')).toBe(null) // no clean +1 pair
  })

  it('keeps absurd centuries out of the pick', () => {
    expect(labelSchoolYearStart('NATO 1949-1950')).toBe(null)
    expect(labelSchoolYearStart('2100-2101')).toBe(null)
  })
})

describe('schoolYearOptions', () => {
  it('offers fifteen years back through ten ahead of the current school year', () => {
    const options = schoolYearOptions()
    expect(options).toHaveLength(26)
    expect(options[0]).toBe(schoolYearStartFor() - 15)
    expect(options[options.length - 1]).toBe(schoolYearStartFor() + 10)
  })
})

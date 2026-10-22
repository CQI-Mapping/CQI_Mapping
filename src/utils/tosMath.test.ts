// The math a Table of Specification depends on: hour-weighted intent vs. the
// Bloom columns that were actually filled in, and the checks that catch them
// disagreeing. Fixtures mirror the real OOP prelim TOS.

import { describe, expect, it } from 'vitest'
import {
  BLOOM_LEVELS,
  bloomTotals,
  fmt,
  fmt1,
  num,
  placedTotal,
  renumber,
  shares,
  totalHours,
  topicPlaced,
  validateSheet,
  weightedFor,
  weightedItems,
  type TosIssue,
  type TosSheet,
  type TosTopic,
  blankTopic,
} from './tosMath'

const topic = (
  position: number,
  hours: number,
  bloom: TosTopic['bloom'],
): TosTopic => ({
  id: `t${position}`,
  position,
  title: `Topic ${position}`,
  slo: '',
  hours,
  bloom,
})

const codes = (issues: TosIssue[]) => issues.map((i) => i.code)

const oneEach = { remember: 1, understand: 1, apply: 1, analyze: 1, evaluate: 1 }

describe('num / fmt', () => {
  it('coerces input strings and junk to a safe number', () => {
    expect(num('2.5')).toBe(2.5)
    expect(num('')).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('abc')).toBe(0)
    expect(num(NaN)).toBe(0)
  })

  it('trims float noise without padding', () => {
    expect(fmt(20)).toBe('20')
    expect(fmt(1.25)).toBe('1.25')
    expect(fmt(1 / 3)).toBe('0.33')
    expect(fmt(0.1 + 0.2)).toBe('0.3')
  })

  it('renders the weighted column at one decimal, as the workbook does', () => {
    // The faculty sheet is formatted to 1dp, so 1.25 items reads "1.3" there.
    expect(fmt1(1.25)).toBe('1.3')
    expect(fmt1(2.5)).toBe('2.5')
    expect(fmt1(5)).toBe('5.0')
    expect(fmt1(1 / 3)).toBe('0.3')
  })
})

describe('weightedItems — INTENT from hours', () => {
  it('scales items by hour share', () => {
    expect(weightedItems(20, 8, 2)).toBe(5)
    expect(weightedItems(20, 8, 0.5)).toBe(1.25)
  })

  it('returns 0 when the sheet has no hours yet, never Infinity', () => {
    expect(weightedItems(20, 0, 2)).toBe(0)
  })
})

describe('bloomTotals / placedTotal — REALITY per column', () => {
  const topics = [
    topic(1, 1, { remember: 1, apply: 2 }),
    topic(2, 2, { remember: 3, understand: 1 }),
  ]

  it('sums each Bloom column independently', () => {
    const totals = bloomTotals(topics)
    expect(totals.remember).toBe(4)
    expect(totals.understand).toBe(1)
    expect(totals.apply).toBe(2)
    expect(totals.analyze).toBe(0)
    expect(totals.evaluate).toBe(0)
    expect(totals.create).toBe(0)
  })

  it('totals every column together', () => {
    expect(placedTotal(topics)).toBe(7)
    expect(topicPlaced(topics[0])).toBe(3)
  })

  it('reports shares against the declared total', () => {
    // total must be the 7 items actually placed, or the shares cannot sum to 1.
    const s = shares(topics, 7)
    expect(s.remember).toBeCloseTo(4 / 7)
    expect(s.apply).toBeCloseTo(2 / 7)
    const sum = BLOOM_LEVELS.reduce((acc, l) => acc + s[l], 0)
    expect(sum).toBeCloseTo(1)
  })

  it('sums the shares to less than 100% when items are unassigned', () => {
    // The Total Percentage cell is =SUM(D12:I12), not a literal 100%. A sheet
    // that declares 20 items with none placed has to read 0%, not 100%.
    const empty = [topic(1, 1, {}), topic(2, 1, {})]
    const sum = BLOOM_LEVELS.reduce((acc, l) => acc + shares(empty, 20)[l], 0)
    expect(sum).toBe(0)
  })

  it('sums the shares to 100% only when the columns reach the total', () => {
    const full = [topic(1, 1, oneEach), topic(2, 1, oneEach)]
    const sum = BLOOM_LEVELS.reduce((acc, l) => acc + shares(full, 10)[l], 0)
    expect(sum).toBeCloseTo(1)
  })

  it('gives zero shares rather than NaN when total is 0', () => {
    expect(shares(topics, 0).remember).toBe(0)
  })

  it('sums hours', () => {
    expect(totalHours(topics)).toBe(3)
  })
})

describe('validateSheet', () => {
  const balanced: TosSheet = {
    id: 's',
    kind: 'items',
    label: 'Multiple Choice',
    total: 10, // two topics x oneEach = 5 each
    note: '',
    topics: [topic(1, 4, oneEach), topic(2, 4, oneEach)],
  }

  it('stays quiet on a sheet that adds up and respects its hours', () => {
    expect(validateSheet(balanced, 8)).toEqual([])
  })

  it('flags topics whose hour total disagrees with the exam header', () => {
    const issues = validateSheet(balanced, 10)
    expect(codes(issues)).toContain('HOURS_MISMATCH')
    expect(issues.find((i) => i.code === 'HOURS_MISMATCH')!.level).toBe('warn')
  })

  it('flags drift between hour-weighted intent and placed items', () => {
    // 10 items over 8 hrs = 1.25/hr, so each 4-hr topic should place 5.
    // Topic 2 places 4 instead — a full item short, too big to be rounding.
    const drifted: TosSheet = {
      ...balanced,
      topics: [
        topic(1, 4, oneEach),
        topic(2, 4, { remember: 1, understand: 1, apply: 1, analyze: 1 }),
      ],
    }
    const issues = validateSheet(drifted, 8)
    const drift = issues.find((i) => i.code === 'WEIGHT_DRIFT')!
    expect(drift.level).toBe('warn')
    expect(drift.message).toMatch(/1 topic\(s\)/)
    expect(drift.message).toMatch(/#2 Topic 2 \(5 by hours, 4 placed\)/)
  })

  it('ignores drift smaller than the half-item tolerance', () => {
    // 20 items over 8 hrs = 2.5/hr. A 0.5-hr topic wants 1.25 and has 1.
    const rounding: TosSheet = {
      ...balanced,
      total: 20,
      topics: [
        topic(1, 0.5, { remember: 1 }),
        topic(2, 7.5, { remember: 19 }),
      ],
    }
    expect(codes(validateSheet(rounding, 8))).not.toContain('WEIGHT_DRIFT')
  })

  it('flags an empty sheet and stops there', () => {
    const issues = validateSheet({ ...balanced, topics: [] }, 8)
    expect(codes(issues)).toEqual(['NO_TOPICS'])
  })

  it('asks for a total before it can check the columns', () => {
    const issues = validateSheet({ ...balanced, total: 0 }, 8)
    expect(codes(issues)).toContain('NO_TOTAL')
  })

  it('notes a Bloom level swallowing the exam', () => {
    const lopsided: TosSheet = {
      ...balanced,
      topics: [topic(1, 8, { remember: 10 }), topic(2, 8, { understand: 2 })],
    }
    const skew = validateSheet(lopsided, 16).find((i) => i.code === 'TARGET_SKEW')!
    expect(skew.level).toBe('info')
    expect(skew.message).toMatch(/Remember/)
  })

  it('skips the declared-hours check when the header leaves it blank', () => {
    expect(codes(validateSheet(balanced, null))).not.toContain('HOURS_MISMATCH')
    expect(codes(validateSheet(balanced, undefined))).not.toContain('HOURS_MISMATCH')
  })
})

describe('weightedFor', () => {
  it('binds the intent formula to one sheet and topic', () => {
    const sheet: TosSheet = {
      id: 's',
      kind: 'items',
      label: 'Multiple Choice',
      total: 20,
      note: '',
      topics: [topic(1, 0.5, {}), topic(2, 7.5, {})],
    }
    expect(weightedFor(sheet, sheet.topics[0])).toBe(1.25)
    expect(weightedFor(sheet, sheet.topics[1])).toBe(18.75)
  })
})

describe('renumber', () => {
  it('closes gaps left by a delete', () => {
    const fixed = renumber([topic(1, 1, {}), topic(3, 1, {}), topic(7, 1, {})])
    expect(fixed.map((t) => t.position)).toEqual([1, 2, 3])
  })
})

describe('blankTopic', () => {
  it('mints a v4 UUID, because tos_topics.id is a UUID column', () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const made = Array.from({ length: 20 }, () => blankTopic(1))
    for (const t of made) expect(t.id).toMatch(UUID)
    // Unique ids keep React keys distinct across a burst of adds.
    expect(new Set(made.map((t) => t.id)).size).toBe(made.length)
  })

  it('starts blank at the given position', () => {
    const t = blankTopic(4)
    expect(t).toMatchObject({ position: 4, title: '', slo: '', hours: 0, bloom: {} })
  })
})

describe('the real OOP prelim TOS', () => {
  // Fixtures straight out of the source workbook, kept here because they are
  // the case the feature exists to handle: both sheets sum correctly, yet
  // several topics place a different number of items than their hours imply.
  const mc: TosSheet = {
    id: 'mc',
    kind: 'items',
    label: 'Multiple Choice',
    total: 20,
    note: '',
    topics: [
      topic(1, 0.5, { remember: 1 }),
      topic(2, 0.5, { remember: 1 }),
      topic(3, 1, { remember: 1, understand: 1, analyze: 1 }),
      topic(4, 2, oneEach),
      topic(5, 2, oneEach),
      topic(6, 2, oneEach),
    ],
  }
  const pp: TosSheet = {
    id: 'pp',
    kind: 'points',
    label: 'Performance-Based',
    total: 30,
    note: '',
    topics: [
      topic(1, 0.5, { apply: 2 }),
      topic(2, 0.5, { apply: 2 }),
      topic(3, 1.5, { apply: 6 }),
      topic(4, 2, { analyze: 8 }),
      topic(5, 2, { analyze: 2, create: 6 }),
      topic(6, 1.5, { create: 4 }),
    ],
  }

  it('both sheets total 8 hours, matching the exam header', () => {
    expect(totalHours(mc.topics)).toBe(8)
    expect(totalHours(pp.topics)).toBe(8)
    expect(codes(validateSheet(mc, 8))).not.toContain('HOURS_MISMATCH')
    expect(codes(validateSheet(pp, 8))).not.toContain('HOURS_MISMATCH')
  })

  it('both sheets place exactly the declared total, so no SUM_MISMATCH', () => {
    expect(placedTotal(mc.topics)).toBe(20)
    expect(placedTotal(pp.topics)).toBe(30)
    expect(codes(validateSheet(mc, 8))).not.toContain('SUM_MISMATCH')
    expect(codes(validateSheet(pp, 8))).not.toContain('SUM_MISMATCH')
  })

  it('reproduces the MC Bloom distribution: 6/4/3/4/3/0', () => {
    const totals = bloomTotals(mc.topics)
    expect(BLOOM_LEVELS.map((l) => totals[l])).toEqual([6, 4, 3, 4, 3, 0])
  })

  it('reproduces the performance Bloom distribution: 10/10/10 across Apply/Analyze/Create', () => {
    const totals = bloomTotals(pp.topics)
    expect(totals.apply).toBe(10)
    expect(totals.analyze).toBe(10)
    expect(totals.create).toBe(10)
    expect(totals.remember).toBe(0)
    expect(totals.understand).toBe(0)
    expect(totals.evaluate).toBe(0)
  })

  it('catches the MC data-types topic: 2.5 by hours, 3 placed', () => {
    const drift = validateSheet(mc, 8).find((i) => i.code === 'WEIGHT_DRIFT')!
    expect(drift.message).toMatch(/#3 Topic 3 \(2\.5 by hours, 3 placed\)/)
  })

  it('catches the performance topics whose points ignore their hours', () => {
    const drift = validateSheet(pp, 8).find((i) => i.code === 'WEIGHT_DRIFT')!
    // 30 over 8 hrs = 3.75/hr. Topic 6 gets 4 points where topic 3 gets 6
    // for the identical 1.5 hrs.
    expect(drift.message).toMatch(/#3 Topic 3 \(5\.63 by hours, 6 placed\)/)
    expect(drift.message).toMatch(/#6 Topic 6 \(5\.63 by hours, 4 placed\)/)
  })

  it('does not flag the 1.25-vs-1 rounding on the short review topics', () => {
    const drift = validateSheet(mc, 8).find((i) => i.code === 'WEIGHT_DRIFT')!
    expect(drift.message).not.toMatch(/#1 /)
    expect(drift.message).not.toMatch(/#2 /)
  })
})
// The Excel export has to reproduce the faculty workbook it was modelled on --
// cell for cell and formula for formula -- or the file it produces is a
// different document wearing the same name.
//
// The expectations below are transcribed from
// GUMONAN-TOS-PRELIM-IT21-Object-Oriented-Programming.xlsx, which has six
// topics per sheet, so its totals land on rows 19, 20 and 21. Anything that
// hardcodes those rows is only right for a six-topic sheet; layoutFor() is what
// keeps them floating, and it gets its own tests.

import { describe, expect, it } from 'vitest'
import {
  buildSheetSpec,
  colLetter,
  layoutFor,
  tosFileName,
  type SpecCell,
} from './tosXlsx'
import type { TosExam, TosSheet, TosTopic } from './tosMath'

const topic = (
  position: number,
  hours: number,
  bloom: TosTopic['bloom'],
): TosTopic => ({
  id: `t${position}`,
  position,
  title: `Topic ${position}`,
  slo: `Outcome ${position}`,
  hours,
  bloom,
})

const oneEach = {
  remember: 1,
  understand: 1,
  apply: 1,
  analyze: 1,
  evaluate: 1,
  create: 1,
}

// Straight out of the workbook's "Multiple Choice" tab.
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

// And its "ProductPerformance-Based" tab, which is worth 30 points, not 20.
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

const exam: TosExam = {
  code: 'BSCS - Computer Science',
  title: 'IT21 - Object Oriented Programming',
  term: '1st Semester, 2026-2027',
  coverage: 'Java Fundamentals, Data Types, Operators',
  preparedBy: 'KENN MIGAN VINCENT C. GUMONAN',
  totalHours: 8,
}

/** Read one cell back by A1 address, so a failure names the cell it was about. */
const at = (cells: SpecCell[], a1: string): SpecCell | undefined => {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)
  if (!m) throw new Error(`bad address ${a1}`)
  const col = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  const row = Number(m[2]) - 1
  return cells.find((c) => c.r === row && c.c === col)
}

const val = (cells: SpecCell[], a1: string) => at(cells, a1)?.v
const formula = (cells: SpecCell[], a1: string) => at(cells, a1)?.f

describe('colLetter', () => {
  it('walks the Excel alphabet, including the wrap to AA', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(colLetter)).toEqual([
      'A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA',
    ])
  })
})

describe('layoutFor', () => {
  it('puts the six-topic workbook totals on rows 19, 20 and 21', () => {
    expect(layoutFor(6)).toMatchObject({
      firstTopic: 13,
      lastTopic: 18,
      totals: 19,
      hours: 20,
      pct: 21,
    })
  })

  it('floats the totals block with the topic count, not a fixed row', () => {
    expect(layoutFor(3).totals).toBe(16)
    expect(layoutFor(11).totals).toBe(24)
  })

  it('gives an empty sheet one row so the formulas have something to span', () => {
    const l = layoutFor(0)
    expect(l.firstTopic).toBe(l.lastTopic)
  })
})

describe('the exported formulas match the workbook', () => {
  it('weights each topic by hours: =($C$19/$B$20)*B13', () => {
    const { cells } = buildSheetSpec(exam, mc)
    expect(formula(cells, 'C13')).toBe('($C$19/$B$20)*B13')
    expect(formula(cells, 'C18')).toBe('($C$19/$B$20)*B18')
  })

  it('gives the performance sheet the same weighting formula', () => {
    const { cells } = buildSheetSpec(exam, pp)
    expect(formula(cells, 'C13')).toBe('($C$19/$B$20)*B13')
  })

  it('writes the row 12 shares as =D19/$C$19', () => {
    const { cells } = buildSheetSpec(exam, mc)
    expect(formula(cells, 'D12')).toBe('D19/$C$19')
    expect(formula(cells, 'I12')).toBe('I19/$C$19')
  })

  it('sums each Bloom column: =SUM(D13:D18)', () => {
    const { cells } = buildSheetSpec(exam, mc)
    expect(formula(cells, 'D19')).toBe('SUM(D13:D18)')
    expect(formula(cells, 'I19')).toBe('SUM(I13:I18)')
  })

  it('sums hours and percentages: =SUM(B13:B18) and =SUM(D12:I12)', () => {
    const { cells } = buildSheetSpec(exam, mc)
    expect(formula(cells, 'B20')).toBe('SUM(B13:B18)')
    expect(formula(cells, 'B21')).toBe('SUM(D12:I12)')
  })

  it('re-anchors every formula when the sheet has a different topic count', () => {
    const { cells } = buildSheetSpec(exam, { ...mc, topics: mc.topics.slice(0, 3) })
    expect(formula(cells, 'C13')).toBe('($C$16/$B$17)*B13')
    expect(formula(cells, 'D12')).toBe('D16/$C$16')
    expect(formula(cells, 'D16')).toBe('SUM(D13:D15)')
    // Row 12 is part of the heading block and does not float with the topics.
    expect(formula(cells, 'B18')).toBe('SUM(D12:I12)')
  })
})

describe('the two papers differ only where the workbook says they do', () => {
  it('names the counted unit Items on one sheet and Points on the other', () => {
    expect(val(buildSheetSpec(exam, mc).cells, 'C11')).toBe('Number of Items')
    expect(val(buildSheetSpec(exam, pp).cells, 'C11')).toBe('Number of Points')
  })

  it('carries each sheet\'s own declared total into C19', () => {
    expect(val(buildSheetSpec(exam, mc).cells, 'C19')).toBe(20)
    expect(val(buildSheetSpec(exam, pp).cells, 'C19')).toBe(30)
  })

  it('suffixes the multiple choice title and leaves the performance one plain', () => {
    expect(val(buildSheetSpec(exam, mc).cells, 'A8')).toBe(
      'Table of Specification: Multiple Choice Type',
    )
    expect(val(buildSheetSpec(exam, pp).cells, 'A8')).toBe('Table of Specification')
  })

  it('gives the performance sheet the extra grand total the MC one lacks', () => {
    expect(formula(buildSheetSpec(exam, pp).cells, 'J19')).toBe('SUM(D19:I19)')
    expect(formula(buildSheetSpec(exam, mc).cells, 'J19')).toBeUndefined()
  })

  it('names each worksheet after its sheet, since that is the tab title', () => {
    expect(buildSheetSpec(exam, mc).name).toBe('Multiple Choice')
    expect(buildSheetSpec(exam, pp).name).toBe('Performance-Based')
  })
})

describe('the exported header', () => {
  it('fills the letterhead and identity rows from the exam', () => {
    const { cells } = buildSheetSpec(exam, mc)
    expect(val(cells, 'A6')).toBe('Course Title: IT21 - Object Oriented Programming')
    expect(val(cells, 'A7')).toBe('1st Semester, 2026-2027')
    expect(val(cells, 'A10')).toBe(
      'Topic: Java Fundamentals, Data Types, Operators',
    )
    expect(val(cells, 'A27')).toBe('KENN MIGAN VINCENT C. GUMONAN')
  })

  it('writes topic rows with the SLO on its own line, as the workbook does', () => {
    expect(val(buildSheetSpec(exam, mc).cells, 'A13')).toBe(
      '1. Topic 1\nSLO: Outcome 1',
    )
  })

  it('places the Bloom headings across D to I', () => {
    const { cells } = buildSheetSpec(exam, mc)
    expect(['D11', 'E11', 'F11', 'G11', 'H11', 'I11'].map((a) => val(cells, a))).toEqual([
      'Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create',
    ])
  })

  it('merges the letterhead and the two-row headings', () => {
    const { merges } = buildSheetSpec(exam, mc)
    expect(merges).toContain('A1:I1')
    expect(merges).toContain('A8:I8')
    expect(merges).toContain('A11:A12')
    expect(merges).toContain('C11:C12')
  })

  it('leaves an unset Bloom cell empty rather than writing a zero', () => {
    // The workbook's performance tab leaves D13:E18 blank, not zeroed.
    const { cells } = buildSheetSpec(exam, pp)
    expect(val(cells, 'F13')).toBe(2)
    expect(at(cells, 'D13')).toBeUndefined()
  })

  it('uses the sheet note when there is one, and the default otherwise', () => {
    expect(val(buildSheetSpec(exam, { ...mc, note: 'Weight 40/60.' }).cells, 'A22')).toBe(
      'Weight 40/60.',
    )
    expect(String(val(buildSheetSpec(exam, mc).cells, 'A22'))).toMatch(
      /^Note: Only those highlighted/,
    )
  })
})

describe('tosFileName', () => {
  it('stamps the date and sanitises the code', () => {
    expect(tosFileName('IT21 - Object Oriented Programming', new Date(2026, 9, 14))).toBe(
      'tos-IT21-Object-Oriented-Programming-2026-10-14.xlsx',
    )
  })

  it('falls back rather than producing a bare dash', () => {
    expect(tosFileName('   ', new Date(2026, 9, 14))).toBe('tos-blueprint-2026-10-14.xlsx')
  })
})
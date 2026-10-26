// Excel export for the Table of Specification.
//
// This reproduces the faculty workbook it was modelled on: the same row
// positions, the same merges, and -- the part that matters -- the gray cells go
// out as real formulas, not as computed numbers. A blueprint whose totals are
// formulas can still be checked and corrected in Excel, which a file of frozen
// values cannot.
//
// One worksheet per file, carrying whichever paper is on screen. The workbook
// keeps both, but the page prints one, and a file holding both would print two.
//
// The formula set is the workbook's, unchanged:
//
//   weighting      ($C$19/$B$20)*B13        hours imply an item/point count
//   row 12         D19/$C$19                each Bloom level as a share of the total
//   totals         SUM(D13:D18)             per-column sums
//   hours          SUM(B13:B18)
//   percentage     SUM(D12:I12)
//
// Rows are 1-based to match the sheet, and the totals block floats below
// however many topics there are -- the workbook's rows 19/20/21 are simply the
// case where it happens to have six.
//
// No React and no DOM here: buildSheetSpec() is pure and returns a plain
// description of cells, which is what the tests read. The xlsx import is
// deferred to downloadTosExcel() so the ~1MB library lands in its own chunk
// instead of the main bundle.

import {
  BLOOM_LEVELS,
  BLOOM_LABELS,
  totalHours,
  weightedFor,
  type BloomLevel,
  type TosExam,
  type TosSheet,
} from './tosMath'
import { SCHOOL } from './report'
import { saveBlob } from './download'

/** Where the topic rows start. Rows 1-11 are the letterhead and headings. */
const FIRST_TOPIC_ROW = 13

/** 1-based column where the Bloom block starts: D. Column C is "Number of". */
const BLOOM_COL = 4
const LAST_BLOOM_COL = BLOOM_COL + BLOOM_LEVELS.length - 1

/**
 * The shares row sits inside the heading block, so it is fixed even as the
 * totals block below the topics floats. That is why the percentage row sums
 * row 12 rather than its own neighbourhood -- =SUM(D12:I12).
 */
const SHARES_ROW = 12

/**
 * Wording copied verbatim from the faculty workbook, so the exported file is
 * cell-for-cell the document they already know.
 *
 * These deliberately differ from the app's own strings -- SCHOOL.institute is
 * upper case, the on-screen note spells "highlighted" correctly, and the UI
 * tab is called "Performance-Based". The export follows the workbook; the app
 * follows itself. Nothing here reaches the interface.
 *
 * Two of these are typos in the source ("highligted", and "Product" glued to
 * "Performance"), and one is a copy-paste slip: the points sheet's totals row
 * reads "Total Number of Items". They are reproduced because matching the file
 * was the ask. Each is one line here if you would rather correct it.
 */
const WORKBOOK = {
  institute: 'Institute for Computer Studies',
  note:
    'Note: Only those highligted with green are editable cells. ' +
    'Gray colored cells contains the formula.',
  /** Worksheet tab names, which are not the app's switcher labels. */
  tabName: { items: 'Multiple Choice', points: 'ProductPerformance-Based' } as const,
  /** Row 19 on BOTH sheets reads "Items" in the source, points sheet included. */
  totalsLabel: 'Total Number of Items',
} as const

/**
 * Bloom headings as the workbook spells them. "Remember" carries a trailing
 * space there, padding it to the width of "Understand".
 */
const WORKBOOK_BLOOM: Record<BloomLevel, string> = {
  ...BLOOM_LABELS,
  remember: 'Remember ',
}

/** 0-based column index to its Excel letter. 0 -> A, 25 -> Z, 26 -> AA. */
export const colLetter = (c: number): string => {
  let s = ''
  let n = c
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/** One cell of the worksheet. A cell is either a literal `v` or a formula `f`. */
export interface SpecCell {
  r: number
  c: number
  v?: string | number
  /** Written without the leading '=' — SheetJS stores formulas that way. */
  f?: string
}

export interface SheetSpec {
  name: string
  cells: SpecCell[]
  /** Merge ranges, same 'A1:I1' spelling the sheet uses. */
  merges: string[]
}

/** Row positions for a sheet with `topicCount` topics, all 1-based. */
export const layoutFor = (topicCount: number) => {
  const firstTopic = FIRST_TOPIC_ROW
  const lastTopic = firstTopic + Math.max(topicCount, 1) - 1
  const totals = lastTopic + 1
  return {
    firstTopic,
    lastTopic,
    totals,
    hours: totals + 1,
    pct: totals + 2,
    note: totals + 3,
    preparedBy: totals + 5,
  }
}

/**
 * Build one worksheet. Pure -- everything it needs comes in as arguments.
 *
 * The topic block is written from `sheet`, not copied from the workbook: this
 * is the app's blueprint, not the sample one. Topics keep their own hour
 * allotment, which is why the two papers can weight the same topic differently.
 */
export function buildSheetSpec(exam: TosExam, sheet: TosSheet): SheetSpec {
  const rows = layoutFor(sheet.topics.length)
  const unit = sheet.kind === 'points' ? 'Points' : 'Items'
  const cells: SpecCell[] = []

  // put/putF take 1-based rows and columns, the way the sheet addresses them.
  const put = (r: number, c: number, v?: string | number) => {
    if (v !== undefined && v !== '') cells.push({ r: r - 1, c: c - 1, v })
  }
  const putF = (r: number, c: number, f: string) =>
    cells.push({ r: r - 1, c: c - 1, f })
  // colLetter is 0-based, so a 1-based column number shifts down by one.
  const letterAt = (c: number) => colLetter(c - 1)

  // ---- letterhead ----
  put(1, 1, SCHOOL.school)
  put(3, 1, WORKBOOK.institute)
  put(6, 1, exam.title ? `Course Title: ${exam.title}` : '')
  put(7, 1, exam.term)
  // The workbook distinguishes the two papers by suffixing the multiple choice
  // title; the performance sheet keeps the plain form.
  // The workbook titles its sheets "Table of Specification for Prelim", adding
// ": Multiple Choice Type" on the multiple choice one and nothing on the
// performance one. The exam type is no longer editable but the column still
// holds it, so the exported header can match.
const kindSuffix = sheet.kind === 'items' ? ': Multiple Choice Type' : ''
const examPart = exam.examType.trim() ? ` for ${exam.examType.trim()}` : ''
put(8, 1, `Table of Specification${examPart}${kindSuffix}`)
  put(9, 1, 'Blooms Revised Taxonomy')

  // ---- headings (rows 11 and 12 are merged for the first three columns) ----
  put(11, 1, 'Topic with SLO')
  put(11, 2, 'No. of hrs.')
  put(11, 3, `Number of ${unit}`)
  BLOOM_LEVELS.forEach((level, i) => put(11, BLOOM_COL + i, WORKBOOK_BLOOM[level]))

  // ---- topic rows ----
  sheet.topics.forEach((topic, i) => {
    const row = rows.firstTopic + i
    const body = `${topic.position}. ${topic.title}`.trim()
    // \r\n is what the workbook's first topic row uses. Its other rows pad with
    // runs of spaces instead, which cannot be reproduced without knowing each
    // title's width -- this is the evident intent of the same cell.
    put(row, 1, topic.slo ? `${body}\r\nSLO: ${topic.slo}` : body)
    put(row, 2, topic.hours)
    // Gray: what the hours imply, never typed. Kept as a formula so the file
    // behaves like the workbook when a total is edited.
    putF(row, 3, `($C$${rows.totals}/$B$${rows.hours})*B${row}`)
    BLOOM_LEVELS.forEach((level, j) => {
      const n = topic.bloom[level]
      if (typeof n === 'number' && n > 0) put(row, BLOOM_COL + j, n)
    })
  })

  // ---- totals block ----
  put(rows.totals, 1, WORKBOOK.totalsLabel)
  put(rows.totals, 3, sheet.total)
  BLOOM_LEVELS.forEach((_, j) => {
    const L = letterAt(BLOOM_COL + j)
    putF(rows.totals, BLOOM_COL + j, `SUM(${L}${rows.firstTopic}:${L}${rows.lastTopic})`)
  })

  // Both papers end at the Create column: the extra grand-total box the
  // faculty file pads past column I was read as a stray column and dropped.

  put(rows.hours, 1, 'Total Number of Hours')
  putF(rows.hours, 2, `SUM(B${rows.firstTopic}:B${rows.lastTopic})`)

  put(rows.pct, 1, 'Total Percentage')
  putF(
    rows.pct,
    2,
    `SUM(${letterAt(BLOOM_COL)}${SHARES_ROW}:${letterAt(LAST_BLOOM_COL)}${SHARES_ROW})`,
  )

  // ---- the shares row, which the percentage row above sums ----
  BLOOM_LEVELS.forEach((_, j) => {
    const L = letterAt(BLOOM_COL + j)
    putF(SHARES_ROW, BLOOM_COL + j, `${L}${rows.totals}/$C$${rows.totals}`)
  })

  put(rows.note, 1, sheet.note.trim() || WORKBOOK.note)
  put(rows.preparedBy, 1, 'Prepared by:')

  const merges = [
    'A1:I1',
    'A3:I3',
    'A8:I8',
    'A11:A12',
    'B11:B12',
    'C11:C12',
  ]
  // The worksheet is named for the workbook's tab, not the app's switcher
  // label -- they differ on the points sheet.
  return { name: WORKBOOK.tabName[sheet.kind], cells, merges }
}

/** "tos-IT21-2026-10-14.xlsx" — same shape as reportFileName(). */
export function tosFileName(code: string, date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  const safe = code.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-')
  return `tos-${safe || 'blueprint'}-${stamp}.xlsx`
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * The workbook's colour scheme, read off the source file: editable cells are
 * green, formula cells gray. The sheet's own footer states the rule -- "Only
 * those highlighted with green are editable cells. Gray colored cells contains
 * the formula" -- so the two are opposites of each other by design.
 */
const CELL = {
  /** An input: typed into. */
  input: 'FFA9D18E',
  /** A formula: recomputed, never typed. */
  formula: 'FFAFABAB',
  /** The heading band across rows 11 and 12. */
  heading: 'FF000000',
  /** Grid lines, the gray the source draws its borders in. */
  border: 'FF9AA4AD',
} as const

// Type-only import: erased at compile time, so ExcelJS is still only loaded
// when an export actually runs.
type Fill = import('exceljs').Fill
type Borders = import('exceljs').Borders

const THIN: NonNullable<Partial<Borders>['top']> = {
  style: 'thin',
  color: { argb: CELL.border },
}

/**
 * Build a single-worksheet workbook with the source file's formatting.
 *
 * One sheet, not one per paper: the page prints the blueprint that is on
 * screen, so the file carries that paper and nothing else. The other paper
 * stays in the database and can be exported by switching to it first.
 *
 * ExcelJS rather than SheetJS, and not for preference: the community build of
 * SheetJS reads styles but silently discards them on write, so every cell came
 * out unformatted. That is a style property the workbook cannot do without --
 * green inputs and gray formulas are the whole point of the document.
 *
 * Formulas are written without cached results and fullCalcOnLoad is set, so
 * Excel computes them on open rather than showing zeros.
 */
export async function buildTosWorkbook(exam: TosExam, sheet: TosSheet) {
  const { default: ExcelJS } = await import('exceljs')
  const spec = buildSheetSpec(exam, sheet)
  const rows = layoutFor(sheet.topics.length)

  const wb = new ExcelJS.Workbook()
  wb.calcProperties = { fullCalcOnLoad: true }
  const ws = wb.addWorksheet(spec.name)

  const at = (r: number, c: number) => ws.getCell(r, c)
  const fill = (argb: string): Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  })
  const border: Partial<Borders> = {
    top: THIN,
    left: THIN,
    bottom: THIN,
    right: THIN,
  }

  // ---- values and formulas straight off the spec ----
  for (const cell of spec.cells) {
    const target = at(cell.r + 1, cell.c + 1)
    target.value =
      cell.f !== undefined ? { formula: cell.f } : (cell.v as string | number)
  }

  // ---- widths, taken from the source file ----
  ws.getColumn(1).width = 32
  ws.getColumn(2).width = 10
  ws.getColumn(3).width = 16
  for (let c = BLOOM_COL; c <= LAST_BLOOM_COL; c++) ws.getColumn(c).width = 11

  for (const m of spec.merges) ws.mergeCells(m)

  // ---- letterhead ----
  at(1, 1).font = { bold: true, size: 14 }
  at(1, 1).alignment = { horizontal: 'center' }
  at(3, 1).font = { bold: true, size: 12 }
  at(3, 1).alignment = { horizontal: 'center' }
  at(6, 1).font = { bold: true }
  at(8, 1).font = { bold: true, size: 12 }
  at(8, 1).alignment = { horizontal: 'center' }
  at(9, 1).font = { bold: true }
  at(rows.note, 1).font = { italic: true, size: 10 }

  // ---- the heading band: black with white type, rows 11 and 12 ----
  for (let c = 1; c <= LAST_BLOOM_COL; c++) {
    for (const r of [11, SHARES_ROW]) {
      const cell = at(r, c)
      cell.fill = fill(CELL.heading)
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = border
    }
  }
  // The share percentages sit under the names and are not bold in the source.
  for (let c = BLOOM_COL; c <= LAST_BLOOM_COL; c++) {
    at(SHARES_ROW, c).font = { color: { argb: 'FFFFFFFF' }, size: 10 }
  }

  // ---- topic rows: green inputs, gray formula ----
  for (let i = 0; i < sheet.topics.length; i++) {
    const r = rows.firstTopic + i

    const topic = at(r, 1)
    topic.fill = fill(CELL.input)
    topic.border = border
    topic.alignment = { vertical: 'top', wrapText: true }
    topic.font = { size: 10 }

    const hours = at(r, 2)
    hours.fill = fill(CELL.input)
    hours.border = border
    hours.alignment = { horizontal: 'center', vertical: 'top' }

    // Gray: the weighting the hours imply. Never typed into.
    const weighted = at(r, 3)
    weighted.fill = fill(CELL.formula)
    weighted.border = border
    weighted.alignment = { horizontal: 'center', vertical: 'top' }
    weighted.font = { bold: true, size: 11 }
    // One decimal, the way the source formats the column.
    weighted.numFmt = '0.0'

    for (let c = BLOOM_COL; c <= LAST_BLOOM_COL; c++) {
      const cell = at(r, c)
      cell.fill = fill(CELL.input)
      cell.border = border
      cell.alignment = { horizontal: 'center', vertical: 'top' }
    }
  }

  // ---- totals block ----
  // The declared total is green because it is typed; every other number in this
  // block is computed, so it is gray.
  const totalsRow = [
    { c: 1, label: true },
    { c: 3, label: false },
    ...BLOOM_LEVELS.map((_, i) => ({ c: BLOOM_COL + i, label: false })),
  ]
  for (const { c, label } of totalsRow) {
    const cell = at(rows.totals, c)
    cell.fill = fill(label ? CELL.formula : c === 3 ? CELL.input : CELL.formula)
    cell.border = border
    cell.alignment = { horizontal: label ? 'left' : 'center' }
    cell.font = { bold: true, size: 11 }
  }
  // Styling past column I must stay conditional on real cells: a formatted but
  // empty J would extend the dimension and leave a stray grey box.

  for (const r of [rows.hours, rows.pct]) {
    const label = at(r, 1)
    label.fill = fill(CELL.formula)
    label.border = border
    label.font = { bold: true, size: 11 }
    label.alignment = { horizontal: 'left' }
    const value = at(r, 2)
    value.fill = fill(CELL.formula)
    value.border = border
    value.alignment = { horizontal: 'center' }
    value.font = { bold: true, size: 11 }
  }

  return wb
}

/**
 * Write the visible paper out and hand it to the browser.
 *
 * Formulas are emitted without cached values, so Excel computes them on open.
 * A viewer that does not evaluate formulas shows them as 0 — that is a property
 * of the format, not a bug in the file.
 */
export async function downloadTosExcel(
  exam: TosExam,
  sheet: TosSheet,
  date = new Date(),
): Promise<void> {
  const wb = await buildTosWorkbook(exam, sheet)
  const out = await (wb as unknown as { xlsx: { writeBuffer: () => Promise<ArrayBuffer> } })
    .xlsx.writeBuffer()
  saveBlob(new Blob([out], { type: XLSX_MIME }), tosFileName(exam.title, date))
}
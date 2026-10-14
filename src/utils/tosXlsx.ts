// Excel export for the Table of Specification.
//
// This reproduces the faculty workbook it was modelled on: one worksheet per
// paper (Multiple Choice, Performance-Based), same row positions, and -- the
// part that matters -- the gray cells go out as real formulas, not as computed
// numbers. A blueprint whose totals are formulas can still be checked and
// corrected in Excel, which a file of frozen values cannot.
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

/** The workbook's own note, carried by the printable grid. */
const DEFAULT_NOTE =
  'Note: Only those highlighted with green are editable cells. ' +
  'Gray colored cells contains the formula.'

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
    signature: totals + 8,
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
  put(3, 1, SCHOOL.institute)
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
  if (exam.coverage) put(10, 1, `Topic: ${exam.coverage}`)

  // ---- headings (rows 11 and 12 are merged for the first three columns) ----
  put(11, 1, 'Topic with SLO')
  put(11, 2, 'No. of hrs.')
  put(11, 3, `Number of ${unit}`)
  BLOOM_LEVELS.forEach((level, i) => put(11, BLOOM_COL + i, BLOOM_LABELS[level]))

  // ---- topic rows ----
  sheet.topics.forEach((topic, i) => {
    const row = rows.firstTopic + i
    const body = `${topic.position}. ${topic.title}`.trim()
    put(row, 1, topic.slo ? `${body}\nSLO: ${topic.slo}` : body)
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
  put(rows.totals, 1, `Total Number of ${unit}`)
  put(rows.totals, 3, sheet.total)
  BLOOM_LEVELS.forEach((_, j) => {
    const L = letterAt(BLOOM_COL + j)
    putF(rows.totals, BLOOM_COL + j, `SUM(${L}${rows.firstTopic}:${L}${rows.lastTopic})`)
  })

  // The performance sheet carries an extra grand-total cell the multiple choice
  // sheet does not. It is the quickest way to see the columns missing the total.
  if (sheet.kind === 'points') {
    putF(
      rows.totals,
      LAST_BLOOM_COL + 1,
      `SUM(${letterAt(BLOOM_COL)}${rows.totals}:${letterAt(LAST_BLOOM_COL)}${rows.totals})`,
    )
  }

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

  put(rows.note, 1, sheet.note.trim() || DEFAULT_NOTE)
  put(rows.preparedBy, 1, 'Prepared by:')
  put(rows.signature, 1, exam.preparedBy)

  const merges = [
    'A1:I1',
    'A3:I3',
    'A8:I8',
    'A11:A12',
    'B11:B12',
    'C11:C12',
  ]
  return { name: sheet.label, cells, merges }
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
 * Build the workbook: one worksheet per paper, formulas emitted uncached so
 * Excel computes them on open.
 *
 * Split from downloadTosExcel() so the file can be produced and inspected
 * without a DOM -- saveBlob is the only part that needs a browser.
 */
export async function buildTosWorkbook(exam: TosExam, sheets: TosSheet[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const spec = buildSheetSpec(exam, sheet)
    const ws: Record<string, unknown> = {}

    for (const cell of spec.cells) {
      const addr = XLSX.utils.encode_cell({ r: cell.r, c: cell.c })
      if (cell.f !== undefined) {
        // SheetJS drops a cell that has a formula but no value, so the cached
        // result is written as a placeholder and fullCalcOnLoad below makes
        // Excel recompute it the moment the file opens. Without the
        // placeholder the formula never reaches the file at all.
        ws[addr] = { t: 'n', f: cell.f, v: 0 }
      } else {
        ws[addr] = { t: typeof cell.v === 'number' ? 'n' : 's', v: cell.v }
      }
    }

    // Excel refuses to open a sheet with no dimension, so the range is set to
    // the cells actually written rather than left to the reader to infer.
    const lastR = spec.cells.reduce((m, c) => Math.max(m, c.r), 0)
    const lastC = spec.cells.reduce((m, c) => Math.max(m, c.c), 0)
    ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: lastR, c: lastC })}`
    ws['!merges'] = spec.merges.map((m) => XLSX.utils.decode_range(m))
    ws['!cols'] = [
      { wch: 58 },
      { wch: 9 },
      { wch: 15 },
      ...BLOOM_LEVELS.map(() => ({ wch: 11 })),
    ]

    XLSX.utils.book_append_sheet(wb, ws as never, spec.name)
  }

  // Force Excel to recalculate on open, so the placeholder cached values above
  // are replaced by real results rather than being displayed as zeros.
  // CalcPr is absent from SheetJS's own Workbook type but is read on write.
  const withCalc = wb as unknown as {
    Workbook?: Record<string, unknown>
  }
  withCalc.Workbook = { ...withCalc.Workbook, CalcPr: { fullCalcOnLoad: true } }

  return wb
}

/**
 * Write every paper out as its own worksheet and hand it to the browser.
 *
 * Formulas are emitted without cached values, so Excel computes them on open.
 * A viewer that does not evaluate formulas shows them as 0 — that is a property
 * of the format, not a bug in the file.
 */
export async function downloadTosExcel(
  exam: TosExam,
  sheets: TosSheet[],
  date = new Date(),
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = await buildTosWorkbook(exam, sheets)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  saveBlob(new Blob([out], { type: XLSX_MIME }), tosFileName(exam.title, date))
}
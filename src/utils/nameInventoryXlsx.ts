// Excel export for the Name Inventory.
//
// One summary sheet plus one worksheet per record type, so a user can filter
// "just the courses" in Excel without stripping the other four sections out of a
// single long list.
//
// ExcelJS rather than SheetJS, matching utils/tosXlsx.ts: the community build of
// SheetJS reads styles but discards them on write, so the header band would come
// out unformatted. The import is deferred to the export call so the ~1MB
// library lands in its own chunk instead of the main bundle.
//
// No React and no DOM here beyond the final save — buildInventoryWorkbook()
// returns a workbook, which is what the export and the tests can hold on to
// without touching the filesystem.

import { SCHOOL } from './report'
import { saveBlob } from './download'
import { COLUMNS } from './nameInventory'
import type { Inventory, InventorySection, SectionKey, SummaryLine } from './nameInventory'

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Worksheet tab names. Every section title would fit Excel's 31-character tab
 * limit, so this map is about readable tabs rather than a limit being hit --
 * "PEOs" and "Learning Outcomes" sit better in a tab strip than the full
 * institutional wording. tabSafe() is the guard for when a title is lengthened
 * later: Excel throws outright on an over-long or forbidden-character tab name,
 * which is a confusing failure for what is only a labelling problem.
 */
const SHEET_NAMES: Record<SectionKey, string> = {
  programs: 'Programs',
  courses: 'Courses',
  pos: 'Program Outcomes',
  peos: 'PEOs',
  clos: 'Learning Outcomes',
}

/** Excel rejects these outright in a tab name, on top of the length cap. */
const tabSafe = (name: string) => name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31)

/** "No." plus the shared COLUMNS list. */
const HEADINGS = ['No.', ...COLUMNS]
const LAST_COL = HEADINGS.length

/** Header row, and the first row under it. */
const HEADER_ROW = 4
const FIRST_DATA_ROW = HEADER_ROW + 1

/**
 * One width per column, shared by every sheet: a narrow index, a roomy code
 * column (some course codes carry a prerequisite chain), and the rest to the
 * name.
 */
const COLUMN_WIDTHS = [6, 22, 78]

const CELL = {
  heading: 'FF1E293B',
  border: 'FFCBD5E1',
  band: 'FFF8FAFC',
} as const

type Fill = import('exceljs').Fill
type Borders = import('exceljs').Borders

const THIN: NonNullable<Partial<Borders>['top']> = {
  style: 'thin',
  color: { argb: CELL.border },
}

const BORDER: Partial<Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }

const fill = (argb: string): Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
})

const styleHeader = (cell: import('exceljs').Cell) => {
  cell.fill = fill(CELL.heading)
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.border = BORDER
}

/** "name-inventory-2026-10-16.xlsx" — same stamp shape as reportFileName(). */
export function inventoryFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `name-inventory-${stamp}.xlsx`
}

const stamped = (generatedBy: string, stamp: string) =>
  generatedBy ? `Generated: ${stamp} · ${generatedBy}` : `Generated: ${stamp}`

/**
 * Build the multi-sheet workbook from an already-filtered inventory.
 *
 * The export deliberately takes the inventory rather than the raw lists: the
 * file then shows exactly the rows the page is showing, so "what I exported"
 * and "what I was looking at" cannot disagree.
 */
export async function buildInventoryWorkbook(inventory: Inventory, generatedBy = '') {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const stamp = new Date().toLocaleDateString()

  // ---- summary sheet ----
  const summary = wb.addWorksheet('Summary')
  summary.getCell('A1').value = SCHOOL.school
  summary.getCell('A1').font = { bold: true, size: 14 }
  summary.getCell('A2').value = 'NAME INVENTORY'
  summary.getCell('A2').font = { bold: true, size: 12 }
  summary.getCell('A3').value = stamped(generatedBy, stamp)
  summary.getCell('A3').font = { italic: true, size: 10 }

  const summaryHeadings = ['Record Type', 'Active', 'Archived', 'Total']
  summaryHeadings.forEach((label, i) => {
    const cell = summary.getCell(HEADER_ROW, i + 1)
    cell.value = label
    styleHeader(cell)
  })

  const summaryRow = (line: SummaryLine) => [line.title, line.active, line.archived, line.total]

  inventory.summary.forEach((line, r) => {
    summaryRow(line).forEach((v, i) => {
      const cell = summary.getCell(FIRST_DATA_ROW + r, i + 1)
      cell.value = v
      cell.border = BORDER
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center' }
      if (i > 0) cell.numFmt = '0'
      if (r % 2 === 1) cell.fill = fill(CELL.band)
    })
  })

  summary.getColumn(1).width = 36
  for (let c = 2; c <= summaryHeadings.length; c++) summary.getColumn(c).width = 12
  summary.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  // ---- one worksheet per section ----
  inventory.sections.forEach((section) => writeSectionSheet(wb, section, generatedBy, stamp))

  return wb
}

function writeSectionSheet(
  wb: import('exceljs').Workbook,
  section: InventorySection,
  generatedBy: string,
  stamp: string,
) {
  const ws = wb.addWorksheet(tabSafe(SHEET_NAMES[section.key]))
  const noun = section.rows.length === 1 ? 'record' : 'records'

  ws.getCell('A1').value = SCHOOL.school
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = `NAME INVENTORY — ${section.title}`
  ws.getCell('A2').font = { bold: true, size: 12 }
  ws.getCell('A3').value = `${section.rows.length} ${noun} · ${stamped(generatedBy, stamp)}`
  ws.getCell('A3').font = { italic: true, size: 10 }

  HEADINGS.forEach((label, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1)
    cell.value = label
    styleHeader(cell)
  })

  // The No. column counts from 1 and is written as a number so Excel sorts it
  // numerically rather than lexically (10 would otherwise sort before 2).
  section.rows.forEach((row, r) => {
    const values = [r + 1, row.code, row.name]
    for (let c = 0; c < LAST_COL; c++) {
      const cell = ws.getCell(FIRST_DATA_ROW + r, c + 1)
      const v = values[c]
      // A written empty string still counts as content and extends the sheet's
      // dimension, so blanks go in as null.
      cell.value = v === undefined || v === '' ? null : v
      cell.border = BORDER
      cell.alignment = {
        horizontal: c === 0 ? 'center' : 'left',
        vertical: 'top',
        wrapText: c === LAST_COL - 1,
      }
      if (r % 2 === 1) cell.fill = fill(CELL.band)
    }
  })

  COLUMN_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  // Excel's autofilter needs at least one data row; a section the current
  // filters emptied out would otherwise leave a stray dropdown on the header.
  if (section.rows.length > 0) {
    const lastRow = FIRST_DATA_ROW + section.rows.length - 1
    ws.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: lastRow, column: LAST_COL },
    }
  }
}

/** Build the workbook and hand it to the browser as a download. */
export async function downloadInventoryExcel(
  inventory: Inventory,
  generatedBy = '',
  date = new Date(),
): Promise<void> {
  const wb = await buildInventoryWorkbook(inventory, generatedBy)
  const out = await (wb as unknown as { xlsx: { writeBuffer: () => Promise<ArrayBuffer> } })
    .xlsx.writeBuffer()
  saveBlob(new Blob([out], { type: XLSX_MIME }), inventoryFileName(date))
}
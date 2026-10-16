// Excel export for the Name Inventory.
//
// One summary sheet plus one worksheet per entity, so a user can filter "just
// the courses" in Excel without stripping the other four sections out of a
// single long list.
//
// ExcelJS rather than SheetJS, matching utils/tosXlsx.ts: the community build of
// SheetJS reads styles but discards them on write, so the header band would come
// out unformatted. The import is deferred to the export call so the ~1MB
// library lands in its own chunk instead of the main bundle.
//
// No React and no DOM here beyond the final save — buildInventoryWorkbook()
// returns a workbook, which is what the export and any future test can hold on
// to without touching the filesystem.

import { SCHOOL } from './report'
import { saveBlob } from './download'
import { rowValues } from './nameInventory'
import type { Inventory, InventorySection, SectionKey, SummaryLine } from './nameInventory'

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Worksheet tab names, set here rather than reusing each section's display
 * title.
 *
 * Today every title would fit Excel's 31-character tab limit (the longest,
 * "Program Educational Objectives", is 30), so this map is about readable tabs
 * rather than a limit being hit -- "PEOs" and "Learning Outcomes" sit better in
 * a tab strip than the full institutional wording. tabSafe() below is the guard
 * for when a title is lengthened later: Excel throws outright on an over-long
 * or forbidden-character tab name, which is a confusing failure for what is only
 * a labelling problem.
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

const HEADER_ROW = 5
const FIRST_DATA_ROW = HEADER_ROW + 1

/**
 * Column widths per section, keyed to that section's own column layout. The
 * name column gets the room; identifiers stay narrow so a wide outcome does
 * not push the status column off the screen.
 */
const COLUMN_WIDTHS: Record<SectionKey, number[]> = {
  programs: [6, 16, 42, 52, 12],
  courses: [6, 16, 42, 30, 8, 12],
  pos: [6, 14, 52, 12, 34, 12],
  peos: [6, 16, 46, 52, 12],
  clos: [6, 14, 56, 20, 12],
}

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

/** "name-inventory-2026-10-16.xlsx" — same stamp shape as reportFileName(). */
export function inventoryFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `name-inventory-${stamp}.xlsx`
}

/** The row a summary line contributes, with the section title in column 1. */
const summaryCells = (line: SummaryLine) => [
  line.title,
  line.active,
  line.archived,
  line.total,
]

const styleHeader = (cell: import('exceljs').Cell) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CELL.heading } } satisfies Fill
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.border = BORDER
}

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
  summary.getCell('A3').value = generatedBy
    ? `Generated: ${stamp} · ${generatedBy}`
    : `Generated: ${stamp}`
  summary.getCell('A3').font = { italic: true, size: 10 }

  const summaryHeader = ['Record Type', 'Active', 'Archived', 'Total']
  summaryHeader.forEach((label, i) => {
    const cell = summary.getCell(HEADER_ROW, i + 1)
    cell.value = label
    styleHeader(cell)
  })

  inventory.summary.forEach((line, r) => {
    summaryCells(line).forEach((v, i) => {
      const cell = summary.getCell(FIRST_DATA_ROW + r, i + 1)
      cell.value = v
      cell.border = BORDER
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center' }
      if (i > 0) cell.numFmt = '0'
      if (r % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: CELL.band },
        } satisfies Fill
      }
    })
  })

  summary.getColumn(1).width = 36
  for (let c = 2; c <= 4; c++) summary.getColumn(c).width = 12
  summary.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  // ---- one worksheet per section ----
  inventory.sections.forEach((section) => {
    writeSectionSheet(wb, section, generatedBy, stamp)
  })

  return wb
}

function writeSectionSheet(
  wb: import('exceljs').Workbook,
  section: InventorySection,
  generatedBy: string,
  stamp: string,
) {
  const ws = wb.addWorksheet(tabSafe(SHEET_NAMES[section.key]))
  const widths = COLUMN_WIDTHS[section.key] ?? section.columns.map(() => 18)

  ws.getCell('A1').value = SCHOOL.school
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = 'NAME INVENTORY'
  ws.getCell('A2').font = { bold: true, size: 12 }
  ws.getCell('A2').alignment = { horizontal: 'left' }
  ws.getCell('A3').value = `${section.title} — ${section.rows.length} record${
    section.rows.length === 1 ? '' : 's'
  }`
  ws.getCell('A3').font = { italic: true, size: 10 }
  ws.getCell('A4').value = generatedBy
    ? `Generated: ${stamp} · ${generatedBy}`
    : `Generated: ${stamp}`
  ws.getCell('A4').font = { italic: true, size: 10 }

  section.columns.forEach((label, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1)
    cell.value = label
    styleHeader(cell)
  })

  // The No. column counts from 1 and is written as a number so Excel can sort
  // it numerically rather than lexically (10 would otherwise sort before 2).
  // The rest of the row comes from rowValues(), which returns exactly the
  // section's own columns — writing a fixed shape here would shift every cell
  // of the shorter sections one column to the left.
  const last = section.columns.length - 1
  section.rows.forEach((row, r) => {
    const values = [r + 1, ...rowValues(section.key, row)]
    for (let c = 0; c <= last; c++) {
      const cell = ws.getCell(FIRST_DATA_ROW + r, c + 1)
      const v = values[c]
      // Trailing empties become null rather than '': a written empty string
      // still counts as content and extends the sheet's dimension past the
      // real columns, leaving a stray bordered cell hanging off the end.
      cell.value = v === undefined || v === '' ? null : v
      cell.border = BORDER
      cell.alignment = {
        horizontal: c === 0 || c === last ? 'center' : 'left',
        vertical: 'top',
        // Only the name column wraps. Wrapping the note columns as well turns
        // long alignment descriptions into 20-line rows.
        wrapText: c === 2,
      }
      if (r % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: CELL.band },
        } satisfies Fill
      }
    }
  })

  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  // Excel's autofilter needs at least one data row; a section the current
  // filters emptied out would otherwise leave a stray dropdown on the header.
  if (section.rows.length > 0) {
    const lastRow = FIRST_DATA_ROW + section.rows.length - 1
    ws.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: lastRow, column: section.columns.length },
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
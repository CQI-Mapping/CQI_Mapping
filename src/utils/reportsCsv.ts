// Overall Report → CSV.
//
// The dashboard's "Export CSV" button hands out this file. It carries the same
// buildReport data as the Excel workbook exporter (reportsXlsx.ts), flattened
// into one grid: each record family gets a title line, its header row and its
// numbered rows, stacked so a spreadsheet app opens a single readable sheet.
//
// CSV is the brief's format, not a smaller Excel: exceljs writes real
// worksheets, but it is a ~1MB dependency fetched for one click, and a report
// whose every section is the same four columns is fully expressible as text.

import type { Report } from './reports'
import { columns, rowCells } from './reports'

/**
 * Quote a cell for RFC-4180 CSV. Commas, quotes and line breaks are the three
 * hazards; everything round-trips because Excel and friends read the doubled
 * quote the same way it was written.
 */
export function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One CSV line, cells joined with commas. */
export function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',')
}

export interface ReportsCsvMeta {
  /** Academic year the report is for, e.g. "2026 - 2027". */
  academicYear: string
  /** The report's semester context ("1", "2", "3"); omitted when none is set. */
  semester?: string
  /** The human timestamp shown on screen, carried into the file. */
  generated: string
}

/**
 * The report as CSV text. CRLF line endings: the file is opened in Excel on
 * Windows more often than it is parsed programmatically, and bare LF still
 * makes old Excel paste every line into one cell.
 */
export function buildReportsCsv(report: Report, meta: ReportsCsvMeta): string {
  const lines: string[] = []

  // Who and when, before any data: a file forwarded on its own has to say
  // what it is without the app that produced it.
  lines.push(csvLine(['CQI Monitoring System — Overall Report']))
  lines.push(csvLine(['Academic Year', meta.academicYear]))
  if (meta.semester != null) lines.push(csvLine(['Semester', meta.semester]))
  lines.push(csvLine(['Report Generated', meta.generated]))
  lines.push('')

  for (const section of report.sections) {
    lines.push(csvLine([section.title]))
    // "No." is the leading column every rendered section has; the export
    // should read like the page it left.
    lines.push(csvLine(['No.', ...columns(section.hasCourse)]))
    section.rows.forEach((row, i) => {
      lines.push(csvLine([i + 1, ...rowCells(row, section.hasCourse)]))
    })
    // A blank line between sections is the separator a printed table gets
    // from spacing; a reader scrolling one text grid needs it too.
    lines.push('')
  }

  return lines.join('\r\n') + '\r\n'
}

/** "overall-report-2026-10-18.csv" — same stamp style as the syllabus exports. */
export function overallReportFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `overall-report-${stamp}.csv`
}

// Overall Report -> PDF.
//
// The dashboard's "Export PDF" button hands out this file. It carries the same
// buildReport data as the page and the Excel workbook exporter, laid out as a
// document rather than a grid: a title block with the academic year, semester
// and generated stamp, the totals summary, then each record family as its own
// table with numbered rows.
//
// Why vector drawing rather than rasterising the page with html2canvas, the way
// the Curriculum Report's exporter does (syllabusPdf.ts): that path reproduces
// the on-screen layout exactly, which is what you want when the screen IS the
// document -- an official letterhead, a signed form. This page is the opposite.
// It is a long list of records behind a toolbar, so a rasteriser would capture
// the search box, the program picker and the "Preparing" state of the button
// that is doing the capturing, and the result would be an image of a UI rather
// than a report: no selectable text, no search inside the PDF, and a file big
// enough to email reluctantly.
//
// Drawing the table here also means the paper is the layout, not the browser's.
// Rows wrap in a column sized for the paper, the header row repeats on every
// page, and a row is never split across the break.
//
// jsPDF is loaded lazily, like every other exporter here, so neither it nor the
// layout code is in the initial bundle -- this file is imported by Reports.tsx,
// which every role loads.

import type { Report } from './reports'
import { columns, isArchived, rowCells, BLANK_NAME } from './reports'

// A4 portrait. The syllabus exporters use 8.5x13 because the official form is
// long bond; nothing about a record list needs that, and A4 is what a printer
// defaults to everywhere this is likely to be printed.
const PAGE = { w: 210, h: 297 }
const MARGIN = 14
const CONTENT_W = PAGE.w - MARGIN * 2
/** Bottom edge of the body. Leaves room for the footer, which is stamped last. */
const BODY_BOTTOM = PAGE.h - 18

// jsPDF works in the unit it was constructed with; mm throughout. Fonts are in
// points, and 1pt = 25.4/72 mm, so the leading has to be converted rather than
// reused raw -- the difference is the whole reason a table looks either cramped
// or gappy.
const MM_PER_PT = 0.352778
const FONT = 'helvetica'
const SIZE = { eyebrow: 8.5, title: 20, lead: 10, heading: 11, head: 8.5, body: 8.5, foot: 7.5 }
/** Row line height, comfortably more than the glyph box so ascenders and
 *  descenders in wrapped names do not touch the rule below them. */
const LEADING = 4.4
/** Vertical padding inside a row, above and below the text. */
const PAD = 1.9

const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const ARCHIVED: [number, number, number] = [148, 163, 184]
const RULE: [number, number, number] = [203, 213, 225]
const HEAD_FILL: [number, number, number] = [241, 245, 249]

/**
 * The slice of jsPDF this file uses.
 *
 * Narrower than the class on purpose: the layout is pure with respect to this
 * interface, so the tests drive it with a recorder instead of a real PDF, and a
 * jsPDF upgrade that removes one of these calls shows up as a type error rather
 * than as a blank download.
 */
export interface PdfDoc {
  addPage(): void
  getNumberOfPages(): number
  setPage(page: number): void
  setFont(name: string, style?: string): void
  setFontSize(size: number): void
  setTextColor(r: number, g: number, b: number): void
  setDrawColor(r: number, g: number, b: number): void
  setFillColor(r: number, g: number, b: number): void
  setLineWidth(width: number): void
  text(text: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }): void
  splitTextToSize(text: string, width: number): string[]
  getTextWidth(text: string): number
  rect(x: number, y: number, w: number, h: number, style?: 'F' | 'S'): void
  line(x1: number, y1: number, x2: number, y2: number): void
}

type Align = 'left' | 'right'

export interface ReportsPdfMeta {
  /** Academic year the report is for, e.g. "2026 - 2027". */
  academicYear: string
  /** The report's semester context ("1", "2"); omitted when none is set. */
  semester?: string
  /** The human timestamp shown on screen, carried into the file. */
  generated: string
  /** Institute name, shown under the title. */
  institute?: string
  /** The program the report is scoped to, as the page labels it. */
  program?: string
}

/**
 * Column widths in mm, indexed like columns(): leading index, then the shared
 * list, with the Course column inserted when a section has one.
 *
 * The Name column takes whatever is left rather than a fixed width, so the two
 * layouts -- with and without a Course column -- both fill the page exactly
 * instead of one of them ending short of the right margin.
 */
export function columnWidths(hasCourse: boolean): number[] {
  const no = 10
  const code = 26
  const status = 20
  const course = hasCourse ? 30 : 0
  const name = CONTENT_W - no - code - course - status
  return hasCourse ? [no, code, course, name, status] : [no, code, name, status]
}

/** Widths for the Totals table: section name, then the three counts. */
function summaryWidths(): number[] {
  return [CONTENT_W - 3 * 26, 26, 26, 26]
}

/** Counts right-align against their column's right edge; names stay left. */
const SUMMARY_ALIGNS: Align[] = ['left', 'right', 'right', 'right']
const RECORD_ALIGNS: Align[] = ['left', 'left', 'left', 'right']
const RECORD_ALIGNS_WITH_COURSE: Align[] = ['left', 'left', 'left', 'left', 'right']

/**
 * The row's own wording for the Status column.
 *
 * An archived row is already greyed, but grey alone leaves the reader to infer
 * why a row is muted. Spelling it out also lines up with the Summary above,
 * which counts the same two states under those exact words.
 */
function statusLabel(row: { status?: string }): string {
  return isArchived(row) ? 'Archived' : 'Active'
}

/** A cell split into the lines it needs at its column width. */
function cellLines(doc: PdfDoc, value: string, width: number): string[] {
  const text = value || BLANK_NAME
  // A column narrower than a single glyph would make splitTextToSize return
  // one character per line and produce a row a page tall. Nothing here is that
  // narrow, but the guard costs a line and turns a pathological column into a
  // readable one.
  const lines = doc.splitTextToSize(text, Math.max(width, 8))
  return lines.length > 0 ? lines : [BLANK_NAME]
}

function alignOpt(align: Align): { align: Align } | undefined {
  return align === 'right' ? { align: 'right' } : undefined
}

/**
 * Where a line of text starts, given its column.
 *
 * Right-aligned columns are pinned to the column's right edge minus the same
 * padding the left-aligned ones use, so a number column and a name column share
 * a margin rather than drifting apart by a few millimetres.
 */
function place(doc: PdfDoc, x: number, width: number, align: Align, line: string): number {
  if (align !== 'right') return x + 2
  return x + width - 2 - Math.min(doc.getTextWidth(line), width - 4)
}

/**
 * The writer, holding the one piece of mutable state the layout needs: how far
 * down the page we are. Keeping it in one object rather than threading a `y`
 * through every helper is what makes the page break a single decision in
 * `space()` instead of a rule repeated in five places.
 */
class Writer {
  private y = MARGIN

  /**
   * The table currently being drawn, so its column headings can be repeated
   * after a page break.
   *
   * Without this a 200-row outcome list continues onto page 4 under a running
   * header that says what the document is but not what the columns are -- every
   * number on that page ambiguous. Cleared by sectionHeading, so a break
   * between two tables never repeats the table that just ended.
   */
  private table: { cells: string[]; widths: number[]; aligns: Align[] } | undefined

  constructor(
    private doc: PdfDoc,
    private meta: ReportsPdfMeta,
  ) {}

  /** Break to a new page if `height` mm will not fit below the current y. */
  space(height: number): void {
    if (this.y + height > BODY_BOTTOM) this.pageBreak()
  }

  /** Always a break, for a section heading that must not be orphaned. */
  private pageBreak(): void {
    this.doc.addPage()
    this.runningHeader()
    this.y = MARGIN + 12
    // Straight to MARGIN+12, which is room for the header row on any paper
    // this module produces -- so the redraw below skips its own fit check,
    // which would otherwise recurse back into a second page break.
    if (this.table) this.drawHeaderRow()
  }

  /** Marks the title block as done; later pages get a slim identifying header. */
  private runningHeader(): void {
    const d = this.doc
    d.setFont(FONT, 'normal')
    d.setFontSize(SIZE.foot)
    d.setTextColor(...MUTED)
    const left = this.meta.institute ? `${this.meta.institute} - Overall Report` : 'CQI Monitoring System - Overall Report'
    d.text(left, MARGIN, MARGIN)
    d.text(`Academic Year ${this.meta.academicYear}`, MARGIN + CONTENT_W, MARGIN, { align: 'right' })
    d.setDrawColor(...RULE)
    d.setLineWidth(0.2)
    d.line(MARGIN, MARGIN + 2, MARGIN + CONTENT_W, MARGIN + 2)
  }

  /** Draw at the cursor and move past it. */
  private put(text: string, x: number, opts?: { align?: 'left' | 'center' | 'right'; color?: [number, number, number]; size?: number; style?: string }): void {
    const d = this.doc
    d.setFont(FONT, opts?.style ?? 'normal')
    d.setFontSize(opts?.size ?? SIZE.body)
    d.setTextColor(...(opts?.color ?? INK))
    d.text(text, x, this.y, opts?.align ? { align: opts.align } : undefined)
    this.y += (opts?.size ?? SIZE.body) * MM_PER_PT * 1.35
  }

  title(): void {
    const d = this.doc
    this.put('CQI MONITORING SYSTEM', MARGIN, { color: MUTED, size: SIZE.eyebrow, style: 'bold' })
    this.y += 2
    this.put('Overall Report', MARGIN, { size: SIZE.title, style: 'bold' })
    this.y += 1

    const scope = [this.meta.institute, this.meta.program].filter(Boolean).join('  ·  ')
    if (scope) this.put(scope, MARGIN, { color: MUTED, size: SIZE.lead })
    this.y += 4
  }

  /** Academic year, semester and stamp in one bordered strip. */
  metaBox(): void {
    const d = this.doc
    const items: [string, string][] = [
      ['Academic Year', this.meta.academicYear],
      ...(this.meta.semester != null && this.meta.semester !== ''
        ? ([['Semester', this.meta.semester]] as [string, string][])
        : []),
      ['Generated', this.meta.generated],
    ]

    const boxH = 14
    this.space(boxH)
    d.setFillColor(...HEAD_FILL)
    d.rect(MARGIN, this.y, CONTENT_W, boxH, 'F')

    const colW = CONTENT_W / items.length
    items.forEach(([label, value], i) => {
      const x = MARGIN + i * colW + 3
      d.setFont(FONT, 'bold')
      d.setFontSize(7)
      d.setTextColor(...MUTED)
      d.text(label.toUpperCase(), x, this.y + 5)
      d.setFont(FONT, 'normal')
      d.setFontSize(SIZE.body)
      d.setTextColor(...INK)
      // Long values (a timestamp with a locale's own formatting) must not run
      // into the next column, so they wrap inside their own instead of over it.
      const lines = cellLines(d, value, colW - 6)
      lines.slice(0, 2).forEach((line, li) => d.text(line, x, this.y + 9.5 + li * 3.4))
    })

    this.y += boxH + 6
  }

  sectionHeading(title: string, subtitle?: string): void {
    // A heading means a new table follows, so the previous one's headings stop
    // being the ones repeated after a break.
    this.table = undefined
    // Keep a heading with at least its header row: a page ending on a bare
    // section title reads as a missing table.
    this.space(20)
    const d = this.doc
    this.put(title, MARGIN, { size: SIZE.heading, style: 'bold' })
    if (subtitle) this.put(subtitle, MARGIN, { color: MUTED, size: SIZE.foot })
    d.setDrawColor(...RULE)
    d.setLineWidth(0.3)
    d.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y)
    this.y += 3
  }

  /** Header row + grid lines for one table. Call after sectionHeading(). */
  tableHeader(cells: string[], widths: number[], aligns: Align[]): void {
    // Cleared first, so a break triggered by this row's fit check repeats the
    // PREVIOUS table's headings -- which are the ones actually ending above --
    // rather than the new ones that are about to be drawn here.
    this.table = undefined
    this.space(LEADING + PAD * 2 + 1)
    this.table = { cells, widths, aligns }
    this.drawHeaderRow()
  }

  /**
   * Draw the column headings alone. Split out from tableHeader because the page
   * break needs it without the fit check that would recurse.
   */
  private drawHeaderRow(): void {
    const d = this.doc
    const { cells, widths, aligns } = this.table!
    d.setFillColor(...HEAD_FILL)
    d.rect(MARGIN, this.y, CONTENT_W, LEADING + PAD * 2, 'F')
    let x = MARGIN
    cells.forEach((cell, i) => {
      d.setFont(FONT, 'bold')
      d.setFontSize(SIZE.head)
      d.setTextColor(...INK)
      const lines = cellLines(d, cell, widths[i] - 4)
      const top = this.y + PAD + SIZE.head * MM_PER_PT
      lines.forEach((line, li) => {
        d.text(line, place(d, x, widths[i], aligns[i], line), top + li * LEADING, alignOpt(aligns[i]))
      })
      x += widths[i]
    })
    this.y += LEADING + PAD * 2
    d.setDrawColor(...RULE)
    d.setLineWidth(0.2)
    d.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y)
  }

  /**
   * One data row, wrapped to the column widths, with the numbering column
   * carrying the row's index in the SECTION rather than its index on this page
   * -- a number that restarted at every page break would contradict the page.
   */
  row(values: string[], widths: number[], aligns: Align[], archived: boolean): void {
    const d = this.doc
    d.setFont(FONT, 'normal')
    d.setFontSize(SIZE.body)
    const wrapped = values.map((v, i) => cellLines(d, v, widths[i] - 4))
    const lines = Math.max(...wrapped.map((l) => l.length))
    const h = lines * LEADING + PAD * 2

    this.space(h)
    d.setTextColor(...(archived ? ARCHIVED : INK))
    let x = MARGIN
    wrapped.forEach((cellLinesForCol, i) => {
      cellLinesForCol.forEach((line, li) => {
        d.text(
          line,
          place(d, x, widths[i], aligns[i], line),
          this.y + PAD + SIZE.body * MM_PER_PT + li * LEADING,
          alignOpt(aligns[i]),
        )
      })
      x += widths[i]
    })
    this.y += h
    d.setDrawColor(...RULE)
    d.setLineWidth(0.15)
    d.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y)
  }

  /** The "nothing matched" line, so an empty section is not a blank gap. */
  empty(message: string): void {
    this.space(LEADING + PAD * 2)
    this.put(message, MARGIN + 2, { color: MUTED, size: SIZE.body })
  }

  /** Gutter between sections. */
  gap(): void {
    this.y += 7
  }

  get cursor(): number {
    return this.y
  }
}

/**
 * Draw the whole report.
 *
 * Pure with respect to PdfDoc: no page setup, no output, no jsPDF import. That
 * is what lets the tests assert on the layout without producing a file, and it
 * keeps the one place that knows about jsPDF down to buildReportsPdf().
 */
export function renderReportsPdf(doc: PdfDoc, report: Report, meta: ReportsPdfMeta): void {
  const w = new Writer(doc, meta)
  w.title()
  w.metaBox()

  // ---- Totals ----
  // From report.summary, which counts the whole dataset rather than what the
  // search box currently shows -- a PDF forwarded after the fact has no search
  // box to change, so it must not carry a filtered total.
  w.sectionHeading('Summary', 'Every record on the books, active and archived')
  const sw = summaryWidths()
  w.tableHeader(['Section', 'Active', 'Archived', 'Total'], sw, SUMMARY_ALIGNS)
  for (const line of report.summary) {
    w.row([line.title, String(line.active), String(line.archived), String(line.total)], sw, SUMMARY_ALIGNS, false)
  }
  w.gap()

  // ---- one table per record family ----
  for (const section of report.sections) {
    const widths = columnWidths(section.hasCourse)
    w.sectionHeading(
      section.title,
      section.rows.length === 1 ? '1 record' : `${section.rows.length} records`,
    )
    // The header is drawn inside a page-break guard, so a section that starts at
    // the foot of a page carries its column headings onto the next page with it.
    const aligns = section.hasCourse ? RECORD_ALIGNS_WITH_COURSE : RECORD_ALIGNS
    w.tableHeader(['No.', ...columns(section.hasCourse), 'Status'], widths, aligns)

    if (section.rows.length === 0) {
      w.empty('No records to show.')
    } else {
      section.rows.forEach((row, i) => {
        w.row(
          [String(i + 1), ...rowCells(row, section.hasCourse), statusLabel(row)],
          widths,
          aligns,
          isArchived(row),
        )
      })
    }
    w.gap()
  }

  stampFooters(doc, meta)
}

/**
 * Footer on every page, stamped in a second pass because the total page count
 * is only known once the body is finished.
 */
function stampFooters(doc: PdfDoc, meta: ReportsPdfMeta): void {
  const total = doc.getNumberOfPages()
  const y = PAGE.h - 10
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(SIZE.foot)
    doc.setTextColor(...MUTED)
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, y - 4, MARGIN + CONTENT_W, y - 4)
    doc.text(`Generated ${meta.generated}`, MARGIN, y)
    doc.text(`Page ${page} of ${total}`, MARGIN + CONTENT_W, y, { align: 'right' })
  }
}

/**
 * The report as a PDF blob.
 *
 * jsPDF is imported here rather than at module scope so it lands in a separate
 * chunk, matching every other exporter in the app. `output('blob')` is cast
 * because the declaration widens to Blob | string | ... for the other formats
 * this could return.
 */
export async function buildReportsPdf(report: Report, meta: ReportsPdfMeta): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  renderReportsPdf(doc as unknown as PdfDoc, report, meta)
  return doc.output('blob') as Blob
}

/** "overall-report-2026-10-18.pdf" - same stamp style as the syllabus exports. */
export function overallReportPdfFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `overall-report-${stamp}.pdf`
}
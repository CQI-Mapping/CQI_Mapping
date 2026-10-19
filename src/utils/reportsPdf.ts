// Overall Report -> PDF, laid out as the printed sheet it is meant to be.
//
// The screen's dashboard becomes a document: a green masthead with the wordmark
// and tagline, a title band carrying the academic year / program / stamp, then
// numbered sections -- the eight KPI tiles, the curriculum mapping table, the
// PO coverage bars, the CLO-to-PO matrix, the alignment donut, the gaps, the
// CQI action list and the findings with a signature block. The interface is
// modeled on the college's report sheet rather than on the screen: numbered
// section bands, badges instead of chips, and a footer band on every page.
//
// Vector throughout. A rasteriser would freeze the layout in an image (no
// selectable text, page-sized files); everything here -- charts included -- is
// drawn: the bars are rectangles, the donut is filled wedges built from short
// line segments, the matrix is a grid of filled cells.
//
// The layout is driven by ReportsPdfModel, which Reports.tsx assembles from the
// same derived values its panels show. The document therefore cannot drift from
// the page it left: one computation on the page builds both.
//
// jsPDF is loaded lazily, like every other exporter, so this page on every
// role's dashboard never pays for a PDF library it may not use this session.

import type { ReportsPdfModel } from './reportsPdfModel'

// ---------------------------------------------------------------------------
// Paper and palette. The greens below are the sheet's, not the web theme's:
// the masthead band, the title band and the badges each carry a fill and an
// ink picked from the same printed set.
// ---------------------------------------------------------------------------

const PAGE = { w: 210, h: 297 }
const MARGIN = 12
const CONTENT_W = PAGE.w - MARGIN * 2
const FOOTER_BAND = 10
/** The body stops short of the footer band, which every page carries. */
const BODY_BOTTOM = PAGE.h - FOOTER_BAND - 6

const DARK: [number, number, number] = [13, 94, 66] // masthead + section bands
const PALE: [number, number, number] = [232, 245, 238] // title band fill
const TITLE_INK: [number, number, number] = [20, 83, 45]
const INK: [number, number, number] = [24, 39, 32]
const MUTED: [number, number, number] = [90, 104, 98]
const RULE: [number, number, number] = [214, 224, 218]
const CARD: [number, number, number] = [229, 236, 231]
const GOOD_INK: [number, number, number] = [20, 102, 61]
const GOOD_FILL: [number, number, number] = [214, 240, 227]
const WARN_INK: [number, number, number] = [183, 121, 31]
const WARN_FILL: [number, number, number] = [252, 240, 212]
const BAD_INK: [number, number, number] = [180, 35, 24]
const BAD_FILL: [number, number, number] = [253, 226, 226]
const NONE_INK: [number, number, number] = [91, 107, 124]
const NONE_FILL: [number, number, number] = [238, 242, 247]
const BAR: [number, number, number] = [46, 156, 99]
const BAR_SOFT: [number, number, number] = [63, 178, 122]
const CELL_ON: [number, number, number] = [30, 130, 88]
const CELL_OFF: [number, number, number] = [241, 245, 246]

const SERIF = 'times'
const SANS = 'helvetica'

const MM_PER_PT = 0.352778
const LEADING = 4.3
const PAD = 1.8
const SIZE = { wordmark: 17, tag: 7.5, title: 21, lead: 9.5, band: 10.5, head: 8, body: 8.5, kpiValue: 15, kpiLabel: 7.5, kpiSub: 6.3, foot: 7.5 }

// ---------------------------------------------------------------------------
// The slice of jsPDF the layout talks to. Narrower than the class on purpose:
// the tests drive a recorder through this interface instead of producing a
// file, so a layout regression is an assertion, not a squint at a PDF.
// ---------------------------------------------------------------------------

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
  circle(x: number, y: number, r: number, style?: 'F' | 'S'): void
  // jsPDF's exact signature: the deltas start at (x, y), scale as its own
  // argument (an array there -- a plain number throws), open/closed.
  lines(segments: number[][], x: number, y: number, scale: number | [number, number], style: 'F' | 'S', closed: boolean): void
}

type Align = 'left' | 'right'

export { type ReportsPdfModel } from './reportsPdfModel'

// ---------------------------------------------------------------------------
// Small drawing primitives.
// ---------------------------------------------------------------------------

function cellLines(doc: PdfDoc, value: string, width: number): string[] {
  const text = value || '—'
  // A column narrower than a glyph makes splitTextToSize return one character
  // per line; the guard turns that into a readable column instead.
  const lines = doc.splitTextToSize(text, Math.max(width, 8))
  return lines.length > 0 ? lines : ['—']
}

function alignOpt(align: Align): { align: Align } | undefined {
  return align === 'right' ? { align: 'right' } : undefined
}

function place(doc: PdfDoc, x: number, width: number, align: Align, line: string): number {
  if (align !== 'right') return x + 2
  return x + width - 2 - Math.min(doc.getTextWidth(line), width - 4)
}

  /** A filled rectangle with a hard border, the sheet's band and card look. */
function band(doc: PdfDoc, x: number, y: number, w: number, h: number, fill: [number, number, number], stroke?: [number, number, number]): void {
  doc.setFillColor(...fill)
  doc.rect(x, y, w, h, 'F')
  if (stroke) {
    doc.setDrawColor(...stroke)
    doc.setLineWidth(0.25)
    doc.rect(x, y, w, h, 'S')
  }
}

/**
 * A soft-filled badge behind short label text, sized to the word: the table's
 * statuses and the CQI statuses print as chips, like the page's.
 */
function statusChip(doc: PdfDoc, x: number, right: number, y: number, label: string): number {
  const map: Record<string, [number, number, number, number, number, number]> = {
    Mapped: [...GOOD_FILL, ...GOOD_INK],
    Completed: [...GOOD_FILL, ...GOOD_INK],
    'Partially Mapped': [...WARN_FILL, ...WARN_INK],
    'In Progress': [...WARN_FILL, ...WARN_INK],
    Unmapped: [...BAD_FILL, ...BAD_INK],
    Pending: [...BAD_FILL, ...BAD_INK],
    'No CLOs': [...NONE_FILL, ...NONE_INK],
  }
  const tone = map[label] ?? [...NONE_FILL, ...NONE_INK]
  const fill: [number, number, number] = [tone[0], tone[1], tone[2]]
  const ink: [number, number, number] = [tone[3], tone[4], tone[5]]
  const w = Math.max(doc.getTextWidth(label) * 1.06 + 6, 12)
  // right is the column's right edge; the chip is right-aligned inside it.
  const cx = right - w
  band(doc, cx, y, w, 5, fill)
  doc.setTextColor(...ink)
  doc.setFont(SANS, 'bold')
  doc.setFontSize(8)
  doc.text(label, cx + w / 2, y + 3.4, { align: 'center' })
  return w
}

// ---------------------------------------------------------------------------
// The writer.
// ---------------------------------------------------------------------------

class Writer {
  private y = MARGIN
  /** The table being drawn, so its headings repeat after a page break. */
  private table: { cells: string[]; widths: number[]; aligns: Align[]; statusCol?: boolean } | undefined

  constructor(
    private doc: PdfDoc,
    private model: ReportsPdfModel,
  ) {}

  space(height: number): void {
    if (this.y + height > BODY_BOTTOM) this.pageBreak()
  }

  private pageBreak(): void {
    this.doc.addPage()
    this.runningHeader()
    this.y = MARGIN + 4
    if (this.table) this.drawHeaderRow()
  }

  /**
   * The slim page-2+ masthead: what the document is and what it covers, so a
   * sheet dropped on a photocopy tray still identifies itself.
   */
  private runningHeader(): void {
    const d = this.doc
    band(d, MARGIN - 3, 0, PAGE.w - MARGIN * 2 + 6, 8, DARK)
    d.setTextColor(255, 255, 255)
    d.setFont(SERIF, 'bold')
    d.setFontSize(SIZE.tag)
    d.text('CQI MONITORING SYSTEM', MARGIN, 5.6)
    d.setFont(SANS, 'normal')
    d.setFontSize(SIZE.tag)
    d.text(`Overall Report  ·  ${this.model.meta.academicYear}`, MARGIN + CONTENT_W, 5.6, { align: 'right' })
  }

  put(text: string, x: number, opts?: { align?: 'left' | 'center' | 'right'; color?: [number, number, number]; size?: number; style?: string; font?: string }): void {
    const d = this.doc
    d.setFont(opts?.font ?? SANS, opts?.style ?? 'normal')
    d.setFontSize(opts?.size ?? SIZE.body)
    d.setTextColor(...(opts?.color ?? INK))
    d.text(text, x, this.y, opts?.align ? { align: opts.align } : undefined)
    this.y += (opts?.size ?? SIZE.body) * MM_PER_PT * 1.35
  }

  get cursor(): number {
    return this.y
  }

  at(y: number): void {
    this.y = y
  }

  // ---- masthead and title band ----

  masthead(): void {
    const d = this.doc
    const h = 17
    band(d, 0, 0, PAGE.w, h, DARK)
    // Page 1 starts under the band; pages 2+ start under the slim one.
    this.at(0)
    d.setTextColor(255, 255, 255)
    d.setFont(SERIF, 'bold')
    d.setFontSize(SIZE.wordmark)
    d.text('CQI MONITORING SYSTEM', MARGIN, 9)
    d.setFont(SANS, 'normal')
    d.setFontSize(SIZE.tag)
    d.text(`${this.model.meta.institute}  ·  ${this.model.meta.department}`, MARGIN, 13.2)
    d.setFont(SERIF, 'italic')
    d.setFontSize(SIZE.tag)
    this.model.meta.tagline.forEach((line, i) => {
      d.text(line, MARGIN + CONTENT_W, 5.5 + i * 3.4, { align: 'right' })
    })
    band(d, 0, h, PAGE.w, 1.1, TITLE_INK)
    this.y = h + 4
  }

  titleBand(): void {
    const d = this.doc
    const h = 34
    this.space(h)
    band(d, MARGIN, this.y, CONTENT_W, h, PALE, RULE)
    const titleY = this.y + 10
    d.setFont(SERIF, 'bold')
    d.setFontSize(SIZE.title)
    d.setTextColor(...TITLE_INK)
    d.text('OVERALL REPORT', MARGIN + 4, titleY)
    d.setFont(SANS, 'normal')
    d.setFontSize(SIZE.lead)
    d.setTextColor(...MUTED)
    d.text('Curriculum Mapping, Outcomes Alignment and Continuous Quality Improvement', MARGIN + 4.4, titleY + 6)

    // The right-hand field list, label-colon-value, exactly as the brief.
    const fields: [string, string][] = [
      ['Academic Year', this.model.meta.academicYear],
      ['Program', this.model.meta.program],
      ['Generated On', this.model.meta.generated],
      ['Report ID', this.model.meta.reportId],
      ['Data Source', this.model.meta.source],
    ]
    const rx = MARGIN + CONTENT_W - 66
    fields.forEach(([label, value], i) => {
      const fy = this.y + 6 + i * 6.2
      d.setFont(SANS, 'bold')
      d.setFontSize(7.6)
      d.setTextColor(...INK)
      d.text(label, rx, fy)
      d.text(':', rx + 23, fy)
      d.setFont(SANS, 'normal')
      d.setTextColor(...MUTED)
      // Two lines, because a program's full name does not fit one column of a
      // field list -- truncated, it stops being identifying.
      cellLines(d, value, 44).slice(0, 2).forEach((v, li) => d.text(v, rx + 26, fy + li * 3.4))
    })

    this.y += h + 6
  }

  sectionHeading(no: number, title: string): void {
    this.table = undefined
    const h = 7.4
    this.space(h + 10)
    band(this.doc, MARGIN, this.y, CONTENT_W, h, DARK)
    this.doc.setTextColor(255, 255, 255)
    this.doc.setFont(SANS, 'bold')
    this.doc.setFontSize(SIZE.band)
    this.doc.text(`${no}.  ${title}`, MARGIN + 4, this.y + h / 2 + SIZE.band * MM_PER_PT * 0.36)
    this.y += h + 3.5
  }

  gap(): void {
    this.y += 5
  }

  // ---- KPI cards ----

  kpis(): void {
    const cards = this.model.kpis
    const perRow = 4
    const gapX = 3.2
    const cardW = (CONTENT_W - gapX * (perRow - 1)) / perRow
    const cardH = 21
    for (let i = 0; i < cards.length; i += perRow) {
      this.space(cardH + 3)
      for (let k = 0; k < perRow && i + k < cards.length; k += 1) {
        const card = cards[i + k]
        const x = MARGIN + k * (cardW + gapX)
        band(this.doc, x, this.y, cardW, cardH, [255, 255, 255], CARD)
        const accent: [number, number, number] = card.tone === 'warn' ? WARN_INK : card.tone === 'good' ? GOOD_INK : DARK
        this.doc.setFillColor(...accent)
        this.doc.rect(x, this.y + cardH - 2.2, cardW, 2.2, 'F')

        this.doc.setFont(SANS, 'bold')
        this.doc.setFontSize(SIZE.kpiLabel)
        this.doc.setTextColor(...INK)
        this.doc.text(card.label, x + 3, this.y + 5.4)

        this.doc.setFont(SANS, 'bold')
        this.doc.setFontSize(SIZE.kpiValue)
        this.doc.setTextColor(...accent)
        this.doc.text(card.value, x + 3, this.y + 13)

        this.doc.setFont(SANS, 'normal')
        this.doc.setFontSize(SIZE.kpiSub)
        this.doc.setTextColor(...MUTED)
        const subs = cellLines(this.doc, card.sub, cardW - 5)
        subs.slice(0, 2).forEach((line, li) => this.doc.text(line, x + 3, this.y + 17.6 + li * 3))
      }
      this.y += cardH + 4
    }
  }

  // ---- tables ----

  tableHeader(cells: string[], widths: number[], aligns: Align[], statusCol?: boolean): void {
    this.table = undefined
    this.space(LEADING + PAD * 2 + 1)
    this.table = { cells, widths, aligns, statusCol }
    this.drawHeaderRow()
  }

  private drawHeaderRow(): void {
    const d = this.doc
    const cells = this.table?.cells ?? []
    const widths = this.table?.widths ?? []
    const aligns = this.table?.aligns ?? []
    d.setFillColor(...PALE)
    d.rect(MARGIN, this.y, CONTENT_W, LEADING + PAD * 2, 'F')
    let x = MARGIN
    cells.forEach((cell, i) => {
      d.setFont(SANS, 'bold')
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

  row(values: string[], widths: number[], aligns: Align[]): void {
    const d = this.doc
    d.setFont(SANS, 'normal')
    d.setFontSize(SIZE.body)
    const wrapped = values.map((v, i) => cellLines(d, v, widths[i] - 4))
    const lines = Math.max(...wrapped.map((l) => l.length))
    const h = lines * LEADING + PAD * 2
    if (this.y + h > BODY_BOTTOM) this.pageBreak()

    const top = this.y
    let x = MARGIN
    wrapped.forEach((col, i) => {
      const isChip = i === values.length - 1 && this.table?.statusCol
      if (isChip) {
        // Statuses print as badges, like the page's: centred in the row's
        // height, drawn with the row itself so a page break can never split
        // text above and a badge stranded below.
        statusChip(d, x, x + widths[i], top + (h - 5) / 2, String(values[i] || 'No CLOs'))
      } else {
        col.forEach((line, li) => {
          d.text(line, place(d, x, widths[i], aligns[i], line), top + PAD + SIZE.body * MM_PER_PT + li * LEADING, alignOpt(aligns[i]))
        })
      }
      x += widths[i]
    })
    this.y = top + h
    d.setDrawColor(...RULE)
    d.setLineWidth(0.15)
    d.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y)
  }

  empty(message: string): void {
    this.space(LEADING + PAD * 2)
    this.put(message, MARGIN + 2, { color: MUTED })
  }

  sub(text: string): void {
    this.put(text, MARGIN, { color: MUTED, size: SIZE.foot })
  }

  /**
   * Bullet or numbered list. The marker is drawn for real -- ".1" never made
   * sense and the placeholder that stood in for it did not print anything.
   */
  bulleted(lines: string[], numbered = false): void {
    const d = this.doc
    for (let i = 0; i < lines.length; i += 1) {
      const marker = numbered ? `${i + 1}.` : '•'
      const textX = MARGIN + (numbered ? 8 : 5)
      const wrapped = cellLines(d, lines[i], CONTENT_W - textX - 3)
      this.space(wrapped.length * LEADING + PAD)
      d.setFont(SANS, numbered ? 'bold' : 'normal')
      d.setFontSize(SIZE.body)
      d.setTextColor(...(numbered ? DARK : INK))
      d.text(marker, MARGIN + 1, this.y + 2.9)
      d.setFont(SANS, 'normal')
      d.setTextColor(...INK)
      wrapped.forEach((part, li) => {
        d.text(part, textX, this.y + 2.9 + li * LEADING)
      })
      this.y += wrapped.length * LEADING + 1.2
    }
  }

  signatureRow(date: string): void {
    const half = CONTENT_W / 2
    this.space(30)
    const blocks: { name?: string; role: string }[] = [
      { name: this.model.signatures.preparedName, role: this.model.signatures.preparedRole },
      { role: 'Reviewed by' },
    ]
    // Two columns: each is a line, a name, a role and the date.
    blocks.forEach((block, i) => {
      const x = MARGIN + i * half
      this.doc.setDrawColor(...RULE)
      this.doc.setLineWidth(0.25)
      this.doc.line(x + 4, this.y, x + half - 14, this.y)
      this.doc.setFont(SANS, 'bold')
      this.doc.setFontSize(SIZE.body)
      this.doc.setTextColor(...INK)
      this.doc.text(block.name || ' ', x + 4, this.y + 4.5)
      this.doc.setFont(SANS, 'normal')
      this.doc.setFontSize(SIZE.foot)
      this.doc.setTextColor(...MUTED)
      this.doc.text(block.role, x + 4, this.y + 8.4)
      this.doc.text(`Date: ${date}`, x + 4, this.y + 12)
    })
    this.y += 17
  }

  // ---- charts ----

  bars(): void {
    const d = this.doc
    const rows = this.model.poCoverage.rows
    const chartH = 46
    const labelBand = 6
    this.space(chartH + labelBand + 8)
    const innerW = CONTENT_W - 14
    const x0 = MARGIN + 12
    const y0 = this.y + chartH

    // Percent gridlines at quarters, labelled on the left.
    d.setFont(SANS, 'normal')
    d.setFontSize(SIZE.foot)
    for (const pct of [0, 25, 50, 75, 100]) {
      const gy = y0 - (chartH * pct) / 100
      d.setDrawColor(...RULE)
      d.setLineWidth(0.15)
      d.line(x0, gy, x0 + innerW, gy)
      d.setTextColor(...MUTED)
      d.text(`${pct}%`, x0 - 3, gy + 1.2, { align: 'right' })
    }

    const slot = innerW / Math.max(rows.length, 1)
    const barW = Math.min(slot * 0.62, 12)
    rows.forEach((row, i) => {
      const bx = x0 + i * slot + (slot - barW) / 2
      const bh = (chartH * Math.max(0, Math.min(100, row.percent))) / 100
      d.setFillColor(...(i % 2 === 0 ? BAR : BAR_SOFT))
      d.rect(bx, y0 - bh, barW, bh, 'F')
      d.setFont(SANS, 'bold')
      d.setFontSize(7)
      d.setTextColor(...GOOD_INK)
      d.text(`${row.percent}%`, bx + barW / 2, y0 - bh - 1.4, { align: 'center' })
      d.setFont(SANS, 'normal')
      d.setTextColor(...INK)
      d.text(row.label, bx + barW / 2, y0 + 4.2, { align: 'center' })
      if (row.count) {
        d.setTextColor(...MUTED)
        d.setFontSize(SIZE.kpiSub)
        d.text(`${row.count}`, bx, y0 - bh - 4.4)
      }
    })

    const notes: string[] = []
    if (this.model.poCoverage.uncovered) notes.push(`${this.model.poCoverage.uncovered} outcome(s) have no mapped CLOs`)
    if (this.model.poCoverage.hidden) notes.push(`${this.model.poCoverage.hidden} more not charted`)
    notes.push(`${this.model.poCoverage.totalClos} learning outcomes in total`)
    d.setFont(SANS, 'normal')
    d.setFontSize(SIZE.foot)
    d.setTextColor(...MUTED)
    d.text(notes.join('  ·  '), MARGIN, y0 + labelBand + 2)
    this.y = y0 + labelBand + 6
  }

  /**
   * The donut, as filled wedges: a polygon whose outer edge is its arc, walked
   * in short steps so a 24-segment approximation reads as smooth on paper.
   */
  donut(cx: number, cy: number, rOuter: number, rInner: number): void {
    const d = this.doc
    const slices = this.model.mix.slices.filter((s) => s.count > 0)
    const total = slices.reduce((n, s) => n + s.count, 0)

    // Twenty-four points per quarter circle is plenty at print resolution.
    const STEPS = 48
    const arc = (from: number, to: number, r: number): [number, number][] => {
      const pts: [number, number][] = []
      const steps = Math.max(2, Math.ceil((Math.abs(to - from) / (Math.PI * 2)) * STEPS))
      for (let i = 0; i <= steps; i += 1) {
        const a = from + (to - from) * (i / steps)
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
      return pts
    }

    let angle = -Math.PI / 2
    for (const slice of slices) {
      const sweep = (slice.count / total) * Math.PI * 2
      const outer = arc(angle, angle + sweep, rOuter)
      const inner = arc(angle + sweep, angle, rInner)
      const poly = [...outer, ...inner]
      const deltas: number[][] = []
      for (let i = 1; i < poly.length; i += 1) {
        deltas.push([poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]])
      }
      d.setFillColor(...slice.rgb)
      d.lines(deltas, poly[0][0], poly[0][1], [1, 1], 'F', true)
      angle += sweep
    }

    // The hub carries what the ring is about: the mapped count.
    d.setFillColor(255, 255, 255)
    d.circle(cx, cy, rInner - 0.4, 'F')
    d.setFont(SANS, 'bold')
    d.setFontSize(SIZE.title)
    d.setTextColor(...DARK)
    d.text(String(this.model.mix.centerValue), cx, cy - 0.5, { align: 'center' })
    d.setFont(SANS, 'normal')
    d.setFontSize(7)
    d.setTextColor(...MUTED)
    d.text(this.model.mix.centerLabel, cx, cy + 3.6, { align: 'center' })

    // Legend on the right: dot, label and share, one row per slice.
    const lx = cx + rOuter + 8
    slices.forEach((slice, i) => {
      const ly = cy - rOuter + 6 + i * 6.4
      d.setFillColor(...slice.rgb)
      d.circle(lx, ly - 1.2, 1.5, 'F')
      d.setFont(SANS, 'normal')
      d.setFontSize(SIZE.body)
      d.setTextColor(...INK)
      d.text(`${slice.label} (${slice.count})`, lx + 4, ly)
      d.setFont(SANS, 'bold')
      d.text(`${total === 0 ? 0 : Math.round((slice.count / total) * 100)}%`, lx + 34, ly)
    })
  }

  // ---- matrix ----

  matrixRow(label: string, hitCols: number[], totalCols: number, colW: number, rowH = 5.2): void {
    const d = this.doc
    if (this.y + rowH > BODY_BOTTOM) this.pageBreak()
    d.setFillColor(...CELL_OFF)
    d.rect(MARGIN + 24, this.y, colW * totalCols, rowH, 'F')
    for (let c = 0; c < totalCols; c += 1) {
      if (hitCols.includes(c)) {
        d.setFillColor(...CELL_ON)
        d.rect(MARGIN + 24 + c * colW, this.y, colW, rowH, 'F')
      }
    }
    d.setFont(SANS, 'bold')
    d.setFontSize(SIZE.head)
    d.setTextColor(...INK)
    d.text(label, MARGIN + 2, this.y + rowH / 2 + 1)
    this.y += rowH
  }
}

/**
 * Draw the whole document. Pure with respect to PdfDoc, so tests can drive a
 * recorder; the one jsPDF-touching function is buildReportsPdf, which loads
 * jsPDF, builds the document, renders and hands back the blob.
 */
export function renderReportsPdf(doc: PdfDoc, model: ReportsPdfModel): void {
  const w = new Writer(doc, model)
  w.masthead()
  w.titleBand()

  // ---- 1. Executive Summary ----
  w.sectionHeading(1, 'Executive Summary')
  w.kpis()
  w.gap()

  // ---- 2. Curriculum Mapping Summary ----
  w.sectionHeading(2, 'Curriculum Mapping Summary')
  w.sub('Term placement and mapping coverage of every course in the program.')
  const widths = [26, 56, 24, 16, 14, CONTENT_W - 136]
  const aligns: Align[] = ['left', 'left', 'left', 'left', 'right', 'left']
  w.tableHeader(['Course Code', 'Course Title', 'Academic Year', 'Sem', '#CLOs', 'Mapping Status'], widths, aligns, true)
  if (model.mapping.rows.length === 0) {
    w.empty('No courses in this program yet.')
  } else {
    for (const row of model.mapping.rows) {
      w.row([row.code, row.title, row.year, row.semester, String(row.clos), row.status], widths, aligns)
    }
  }
  w.gap()

  // ---- 3. PO Coverage ----
  w.sectionHeading(3, 'PO Coverage Chart')
  w.sub('Percentage of learning outcomes mapped to each Program Outcome.')
  if (model.poCoverage.rows.length === 0) w.empty('No program outcomes recorded yet.')
  else w.bars()
  w.gap()

  // ---- 4. CLO-to-PO matrix ----
  // The band prints even with nothing to align -- a numbered sheet that skips
  // its own numbers reads as pages falling out of a bound one.
  const cols = model.matrix.columns
  w.sectionHeading(4, 'CLO - PO Alignment Matrix')
  if (cols.length === 0 || model.matrix.rows.length === 0) {
    w.empty('Nothing to align yet: map learning outcomes to program outcomes first.')
  } else {
    w.sub(`${model.matrix.rows.length} mapped learning outcome(s) across ${cols.length} program outcome(s). ${model.matrix.unmappedCount} further outcome(s) map nothing and appear under Mapping Gaps.`)
    const colW = Math.min(11, (CONTENT_W - 24) / cols.length)
    // Column headings ride their own row so the letter codes stay readable.
    w.tableHeader(['', ...cols.map((c) => c.label)], [24, ...cols.map(() => colW)], cols.map(() => 'left' as Align))
    for (const row of model.matrix.rows) {
      w.matrixRow(row.label, row.hits, cols.length, colW)
    }
    w.sub('A filled cell means the learning outcome names that program outcome. The matrix reads from the outcomes themselves; noting depth per cell has yet to be captured.')
  }
  w.gap()

  // ---- 5. Outcomes Alignment by Type ----
  w.sectionHeading(5, 'Outcomes Alignment by Type')
  if (model.mix.slices.length === 0) {
    w.empty('No mapped learning outcomes to distribute yet.')
  } else {
    // Room for a 50mm ring plus its legend rows before the next band.
    w.space(62)
    const cy = w.cursor + 27 + (model.mix.slices.length * 6.4) / 2
    w.donut(MARGIN + 27, cy, 25, 16)
    w.at(cy + 29)
  }
  w.gap()

  // ---- 6. Mapping Gaps ----
  w.sectionHeading(6, 'Mapping Gaps')
  w.sub('Learning outcomes that name no program outcome, and outcomes that no learning outcome names.')
  w.put(`Unmapped learning outcomes: ${model.gaps.unmappedClos.length}`, MARGIN, { style: 'bold', color: BAD_INK, size: SIZE.body })
  w.bulleted(model.gaps.unmappedClos.slice(0, 12).map((g) => `${g.course} - ${g.text}`))
  if (model.gaps.unmappedClos.length > 12) w.sub(`and ${model.gaps.unmappedClos.length - 12} more.`)
  w.put(`Program outcomes without coverage: ${model.gaps.unreachedPos.length}`, MARGIN, { style: 'bold', color: BAD_INK, size: SIZE.body })
  w.bulleted(model.gaps.unreachedPos.slice(0, 12).map((p) => `${p.code} - ${p.title}`))
  if (model.gaps.unreachedPos.length > 12) w.sub(`and ${model.gaps.unreachedPos.length - 12} more.`)
  w.gap()

  // ---- 7. CQI Actions ----
  w.sectionHeading(7, 'CQI Monitoring & Recommendations')
  const cw = [18, 66, 30, 24, CONTENT_W - 138]
  const cAligns: Align[] = ['left', 'left', 'left', 'left', 'left']
  w.tableHeader(['Code', 'Recommendation', 'Responsible', 'Target Date', 'Status'], cw, cAligns, true)
  if (model.cqi.missing) w.empty('The CQI actions table is not set up on this database yet.')
  else if (model.cqi.rows.length === 0) w.empty('No CQI actions recorded.')
  else {
    for (const row of model.cqi.rows) {
      w.row([row.code, row.recommendation, row.responsible, row.target ?? '—', row.status], cw, cAligns)
    }
  }
  w.gap()

  // ---- 8. Findings and remarks ----
  w.sectionHeading(8, 'Key Findings and Remarks')
  let n = 0
  for (const finding of model.findings) {
    n += 1
    w.put(`${n}. ${finding}`, MARGIN + 2, { size: SIZE.body })
  }
  w.gap()
  w.put('Recommendations', MARGIN, { style: 'bold', color: DARK })
  w.bulleted(model.recommendations, true)
  w.gap()

  w.signatureRow(model.signatures.date)

  // ---- repeat section bands for tables that broke mid-section handled in
  //      drawHeaderRow; footers are stamped last, when the count is known ----
  stampFooters(doc, model)
}

/**
 * Footer band on every page: what produced it, on the left; the sheet's strap
 * line, on the right. Second pass, because the page count is only known once
 * everything else is drawn.
 */
function stampFooters(doc: PdfDoc, model: ReportsPdfModel): void {
  const total = doc.getNumberOfPages()
  const y = PAGE.h - FOOTER_BAND
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    band(doc, 0, y, PAGE.w, FOOTER_BAND, DARK)
    doc.setTextColor(255, 255, 255)
    doc.setFont(SERIF, 'bold')
    doc.setFontSize(SIZE.foot)
    doc.text('CQI Monitoring System', MARGIN, y + 6)
    doc.setFont(SANS, 'normal')
    doc.text(`${model.meta.department}  ·  ${model.meta.institute}`, MARGIN + 38, y + 6)
    // A sheet with sections numbered from 1 needs a page of its own to be found.
    doc.text(`Page ${page} of ${total}`, PAGE.w / 2, y + 6, { align: 'center' })
    doc.setFont(SERIF, 'italic')
    doc.text('Data-Driven Decisions for Quality Education', MARGIN + CONTENT_W, y + 6, { align: 'right' })
  }
}

/**
 * The report as a PDF blob. jsPDF is imported here rather than at module scope
 * so it lands in its own chunk. `output('blob')` is cast because the declared
 * union widens past Blob for the other output formats.
 */
export async function buildReportsPdf(model: ReportsPdfModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  renderReportsPdf(doc as unknown as PdfDoc, model)
  return doc.output('blob') as Blob
}

/** "overall-report-2026-10-18.pdf" — same stamp style as the syllabus exports. */
export function overallReportPdfFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `overall-report-${stamp}.pdf`
}

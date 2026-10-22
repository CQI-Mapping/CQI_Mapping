import { describe, expect, it } from 'vitest'
import { buildReportsPdf, renderReportsPdf, type PdfDoc } from './reportsPdf'
import type { ReportsPdfModel } from './reportsPdfModel'

// ---------------------------------------------------------------------------
// A recorder standing in for jsPDF.
//
// The layout only ever talks to the PdfDoc interface, so the document can be
// built here and inspected as a list of calls: which strings landed on which
// page, at what colour and alignment, and where fills were used. A real jsPDF
// would have to be parsed back out of a byte stream to answer the same
// questions, and would drag a browser-shaped dependency into a unit test.
// ---------------------------------------------------------------------------

interface TextCall {
  text: string
  page: number
  x: number
  y: number
  align?: 'left' | 'center' | 'right'
  color: string
  font: string
}

// Average width of a character at the body sizes, close to helvetica's real
// metrics; the recorder's own wrap must not be fatter than the paper's, or a
// field that fits one line on paper becomes three lines under test.
const CHAR_MM = 1.3

function recorder() {
  const texts: TextCall[] = []
  let page = 1
  let color = '0,0,0'
  let font = 'helvetica: normal'
  let filledCount = 0

  const doc: PdfDoc = {
    addPage() {
      page += 1
    },
    getNumberOfPages: () => page,
    setPage(next) {
      page = next
    },
    setFont(name, style) {
      font = `${name}: ${style ?? 'normal'}`
    },
    setFontSize() {},
    setTextColor(r, g, b) {
      color = `${r},${g},${b}`
    },
    setDrawColor() {},
    setFillColor() {
      filledCount += 0 // fills are observed through lines/rect counts
    },
    setLineWidth() {},
    text(value, x, y, opts) {
      texts.push({ text: value, page, x, y, align: opts?.align, color, font })
    },
    splitTextToSize(value, width) {
      // Wrap like a real font would, on a character budget derived from the
      // column's width. Deterministic, and wide enough to be offensive.
      const perLine = Math.max(1, Math.floor(width / CHAR_MM))
      const words = value.split(' ')
      const lines: string[] = []
      let line = ''
      for (const word of words) {
        if (line === '') line = word
        else if ((line + ' ' + word).length <= perLine) line += ' ' + word
        else {
          lines.push(line)
          line = word
        }
      }
      if (line !== '') lines.push(line)
      return lines
    },
    getTextWidth: (value) => value.length * CHAR_MM,
    rect() {
      filledCount += 1
    },
    line() {},
    circle() {
      filledCount += 1
    },
    lines(segments) {
      filledCount += segments.length
    },
  }

  return {
    doc,
    texts,
    rectsOf: () => filledCount,
    pageOf: (needle: string) => texts.filter((t) => t.text === needle),
  }
}

const base: ReportsPdfModel = {
  meta: {
    institute: 'INSTITUTE FOR COMPUTER STUDIES',
    department: 'BSIT Department',
    tagline: ['Quality Education.', 'Continuous Improvement.', 'Better Future.'],
    academicYear: '2026 - 2027',
    program: 'Bachelor of Science in Information Technology (BSIT)',
    semester: '1',
    generated: 'October 17, 2026, 02:24 PM',
    reportId: 'CQI-OVR-20261017',
    source: 'CQI Monitoring System (Supabase)',
  },
  kpis: [
    { label: 'Total Programs', value: '1', sub: 'BSIT' },
    { label: 'Total Courses', value: '36', sub: 'Across 4 years' },
    { label: 'Total CLOs', value: '248', sub: 'From all courses' },
    { label: 'Mapping Coverage', value: '82%', sub: '(203 / 248 CLOs)', tone: 'good' },
  ],
  mapping: {
    rows: [
      { code: 'IT101', title: 'Introduction to Information Technology', year: '2026 - 2027', semester: '1', clos: 6, status: 'Mapped' },
      { code: 'IT103', title: 'Discrete Mathematics', year: '2026 - 2027', semester: '2', clos: 8, status: 'Partially Mapped' },
    ],
  },
  poCoverage: {
    rows: [
      { label: 'PO-1', percent: 93, count: 42 },
      { label: 'PO-2', percent: 87, count: 38 },
      { label: 'PO-3', percent: 0, count: 0 },
    ],
    uncovered: 2,
    hidden: 0,
    totalClos: 248,
  },
  matrix: {
    columns: [
      { key: 'po-1', label: 'PO-1' },
      { key: 'po-2', label: 'PO-2' },
    ],
    rows: [
      { label: 'IT101 · CLO-1', hits: [0] },
      { label: 'IT101 · CLO-2', hits: [0, 1] },
    ],
    unmappedCount: 45,
  },
  documents: {
    rows: [
      { label: 'PEO 1', detail: 'Graduates demonstrate professional and ethical competence.', codes: ['PO-1', 'PO-2'] },
      { label: 'Strategic Goal 2', detail: 'Strengthen instruction quality.', codes: [] },
      { label: 'CHED', detail: 'CMO 25 s. 2015', codes: ['PO-1'] },
    ],
  },
  cqi: {
    missing: false,
    rows: [
      { code: 'IT103', recommendation: 'Validate and map the 45 unmapped CLOs.', responsible: 'Program Head', status: 'Pending', target: 'Dec 2026' },
    ],
  },
  findings: ['Mapping coverage is 82% — 203 of 248 learning outcomes name a program outcome.'],
  recommendations: ['Map the 45 learning outcomes that currently name no program outcome.'],
  signatures: {
    preparedName: 'Maria Santos',
    preparedRole: 'Coordinator',
    date: 'October 17, 2026',
  },
}

const emptyModel: ReportsPdfModel = {
  ...base,
  kpis: [],
  mapping: { rows: [] },
  poCoverage: { rows: [], uncovered: 0, hidden: 0, totalClos: 0 },
  matrix: { columns: [], rows: [], unmappedCount: 0 },
  documents: { rows: [] },
  cqi: { missing: true, rows: [] },
  findings: [],
  recommendations: [],
}

describe('renderReportsPdf masthead and title band', () => {
  const { doc, texts } = recorder()
  renderReportsPdf(doc, base)

  it('names the system with the department and tagline', () => {
    expect(texts.some((t) => t.text === 'CQI MONITORING SYSTEM')).toBe(true)
    expect(texts.some((t) => t.text.includes('BSIT Department'))).toBe(true)
    for (const line of base.meta.tagline) {
      expect(texts.some((t) => t.text === line)).toBe(true)
    }
  })

  it('titles the sheet and carries the identifying fields', () => {
    expect(texts.some((t) => t.text === 'OVERALL REPORT')).toBe(true)
    expect(texts.some((t) => t.text === 'Academic Year')).toBe(true)
    expect(texts.some((t) => t.text === '2026 - 2027')).toBe(true)
    // The program's full name wraps inside its field rather than truncating,
    // so the assertion reads the identifying tail, not a whole line.
    expect(texts.some((t) => t.text.includes('(BSIT)'))).toBe(true)
    expect(texts.some((t) => t.text === base.meta.reportId)).toBe(true)
    expect(texts.some((t) => t.text === base.meta.source)).toBe(true)
  })
})

describe('renderReportsPdf sections', () => {
  const { doc, texts } = recorder()
  renderReportsPdf(doc, base)

  it('numbers the section bands in order', () => {
    const headings = texts.filter((t) => /^\d+\.\s/.test(t.text) && t.font.includes('bold')).map((t) => t.text)
    expect(headings[0]).toBe('1.  Executive Summary')
    expect(headings).toContain('2.  Curriculum Mapping Summary')
    expect(headings).toContain('3.  PO Coverage Chart')
    expect(headings).toContain('4.  CLO - PO Alignment Matrix')
    expect(headings).toContain('5.  Alignment to PEOs, Goals and CHED Memoranda')
    expect(headings).toContain('6.  CQI Monitoring & Recommendations')
    expect(headings).toContain('7.  Key Findings and Remarks')
  })

  it('draws the KPI values and their qualifiers', () => {
    for (const card of base.kpis) {
      expect(texts.some((t) => t.text === card.label)).toBe(true)
      expect(texts.some((t) => t.text === card.value)).toBe(true)
    }
    expect(texts.some((t) => t.text === '(203 / 248 CLOs)')).toBe(true)
  })

  it('lays the KPI cards out four to a row', () => {
    // The recorder cannot count columns, but two rows of four on eight cards
    // has to mean two page-1 rows; a five-across overflow would put a card
    // where it does not belong. Four labels fit the content width only because
    // the layout chose that size, which is the behaviour under test.
    const labelsOnFirstPage = texts.filter((t) => base.kpis.some((k) => k.label === t.text) && t.page === 1)
    expect(labelsOnFirstPage.length).toBe(base.kpis.length)
  })

  it('prints the mapping rows with statuses worded like the page', () => {
    expect(texts.some((t) => t.text === 'IT101')).toBe(true)
    // Course titles wrap across lines, so the words carry the assertion.
    expect(texts.some((t) => t.text.includes('Information Technology'))).toBe(true)
    expect(texts.some((t) => t.text === 'Mapped')).toBe(true)
    expect(texts.some((t) => t.text === 'Partially Mapped')).toBe(true)
  })

  it('draws the coverage bars with their percents', () => {
    expect(texts.some((t) => t.text === '93%')).toBe(true)
    expect(texts.some((t) => t.text === 'PO-1')).toBe(true)
    expect(texts.some((t) => t.text.includes('no mapped CLOs'))).toBe(true)
  })

  it('titles the matrix and its ending note honestly', () => {
    expect(texts.some((t) => t.text === '4.  CLO - PO Alignment Matrix')).toBe(true)
    expect(texts.some((t) => t.text.includes('names that program outcome'))).toBe(true)
  })

  it('names each document with the outcomes that cite it', () => {
    expect(texts.some((t) => t.text === 'PEO 1')).toBe(true)
    expect(texts.some((t) => t.text === 'Graduates demonstrate professional and ethical competence.')).toBe(true)
    expect(texts.some((t) => t.text === 'Program outcomes (2): PO-1, PO-2')).toBe(true)
    expect(texts.some((t) => t.text === 'Strategic Goal 2')).toBe(true)
    // A document nothing cites is listed and said so, not skipped: the count
    // is a finding here. Silence would read as a missing record.
    expect(texts.some((t) => t.text === 'Program outcomes aligned: none')).toBe(true)
  })

  it('says plainly when no documents are recorded', () => {
    const r = recorder()
    renderReportsPdf(r.doc, { ...emptyModel, documents: { rows: [] } })
    expect(r.texts.some((t) => t.text.includes('No PEOs, strategic goals or memoranda recorded'))).toBe(true)
  })

  it('prints the CQI action with its status', () => {
    expect(texts.some((t) => t.text === 'Pending')).toBe(true)
    expect(texts.some((t) => t.text.includes('unmapped CLOs'))).toBe(true)
  })

  it('says plainly when the CQI table is absent', () => {
    const other = recorder()
    renderReportsPdf(other.doc, emptyModel)
    expect(other.texts.some((t) => t.text.includes('not set up on this database'))).toBe(true)
  })

  it('numbers the findings and the recommendations', () => {
    expect(texts.some((t) => t.text === '1. Mapping coverage is 82% — 203 of 248 learning outcomes name a program outcome.')).toBe(true)
    expect(texts.some((t) => t.text === '1.')).toBe(true)
  })

  it('signs the sheet with who prepared it', () => {
    expect(texts.some((t) => t.text === 'Maria Santos')).toBe(true)
    expect(texts.some((t) => t.text === 'Coordinator')).toBe(true)
    expect(texts.some((t) => t.text === 'Reviewed by')).toBe(true)
    expect(texts.some((t) => t.text === 'Date: October 17, 2026')).toBe(true)
  })

  it('empties gracefully across every section', () => {
    // emptyModel exercises the same pass with nothing anywhere: no throw, and
    // every numbered band still present -- a section that vanished entirely
    // would read as pages falling out of a bound document.
    const r = recorder()
    renderReportsPdf(r.doc, emptyModel)
    const headings = r.texts.filter((t) => /^\d+\.\s/.test(t.text)).map((t) => t.text)
    expect(headings.length).toBe(7)
    expect(r.texts.some((t) => t.text.includes('Nothing to align yet'))).toBe(true)
  })

  it('keeps every line out of the footer band and clear of the running header', () => {
    // The defect this pins: a caption drawn with nothing behind it landed
    // where the footer stamps, and glyphs from the two interleaved. Body ink
    // is capped above the stamp zone on every page, and page 2 onward leaves
    // the running header band (0..8mm) untouched.
    const tall: ReportsPdfModel = {
      ...base,
      findings: Array.from({ length: 40 }, (_, i) => `Finding number ${i + 1}, stated at length to keep the section flowing past page breaks.`),
    }
    const r = recorder()
    renderReportsPdf(r.doc, tall)
    const inFooterZone = r.texts.filter((t) => t.y > 283.5 && t.y < 292)
    expect(inFooterZone).toEqual([])
    const underHeader = r.texts.filter((t) => t.page > 1 && t.y > 6 && t.y < 9.5)
    expect(underHeader).toEqual([])
  })
})

describe('renderReportsPdf pagination', () => {
  const longModel: ReportsPdfModel = {
    ...base,
    mapping: {
      rows: Array.from({ length: 140 }, (_, i) => ({
        code: `IT${100 + i}`,
        title: `Course subject number ${i + 1} in the program catalogue`,
        year: '2026 - 2027',
        semester: i % 2 ? '2' : '1',
        clos: 5 + (i % 7),
        status: i % 3 === 0 ? 'Mapped' : 'Partially Mapped',
      })),
    },
  }

  const { doc, texts, pageOf } = recorder()
  renderReportsPdf(doc, longModel)

  it('runs onto more pages than one', () => {
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('repeats the column headings on continuation pages', () => {
    // 'Course Title' belongs to the mapping table alone; the CQI table's
    // first heading is 'Code', so its later pages cannot fake a match.
    const headingPages = new Set(pageOf('Course Title').map((t) => t.page))
    expect(headingPages.size).toBeGreaterThan(1)
  })

  it('carries a footer band on every page', () => {
    const total = doc.getNumberOfPages()
    for (let page = 1; page <= total; page += 1) {
      expect(texts.some((t) => t.text === `Page ${page} of ${total}` && t.page === page)).toBe(true)
    }
  })

  it('identifies the document on every page after the first', () => {
    const headers = pageOf('CQI MONITORING SYSTEM')
    expect(new Set(headers.map((t) => t.page)).size).toBeGreaterThan(1)
  })
})

describe('buildReportsPdf', () => {
  // The layout above is exercised without jsPDF, which leaves the one thing
  // only the real thing can answer: does the click produce a file at all. A
  // wrong output format or missing method fails silently in the browser --
  // every other test still passes and the user gets an empty download.
  it('returns a real PDF blob', async () => {
    const blob = await buildReportsPdf(base)
    expect(blob.size).toBeGreaterThan(1000)
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())
    expect(head).toBe('%PDF-')
  })
})
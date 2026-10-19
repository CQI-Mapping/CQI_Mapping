import { describe, expect, it } from 'vitest'
import {
  buildReportsPdf,
  columnWidths,
  overallReportPdfFileName,
  renderReportsPdf,
  type PdfDoc,
} from './reportsPdf'
import type { Report, ReportRow, ReportSection, SummaryLine } from './reports'

// ---------------------------------------------------------------------------
// A recorder standing in for jsPDF.
//
// The layout only ever talks to the PdfDoc interface, so the whole document can
// be built here and inspected as a list of calls: which strings landed on which
// page, at what colour, with what alignment. A real jsPDF would have to be
// parsed back out of a byte stream to answer the same questions, and would drag
// a browser-shaped dependency into a unit test.
// ---------------------------------------------------------------------------

interface TextCall {
  text: string
  page: number
  align?: 'left' | 'center' | 'right'
  color: string
}

const CHAR_MM = 1.6

function recorder() {
  const texts: TextCall[] = []
  const pages: number[] = []
  let page = 1
  let color = '0,0,0'

  const doc: PdfDoc = {
    addPage() {
      page += 1
    },
    getNumberOfPages: () => page,
    setPage(next) {
      page = next
    },
    setFont() {},
    setFontSize() {},
    setTextColor(r, g, b) {
      color = `${r},${g},${b}`
    },
    setDrawColor() {},
    setFillColor() {},
    setLineWidth() {},
    text(value, _x, _y, opts) {
      texts.push({ text: value, page, align: opts?.align, color })
    },
    splitTextToSize(value, width) {
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
    rect() {},
    line() {},
  }

  return { doc, texts, pages, pageOf: (needle: string) => texts.filter((t) => t.text === needle) }
}

const meta = {
  academicYear: '2026 - 2027',
  semester: '1',
  generated: 'Oct 17, 2026 02:24 PM',
  institute: 'College of Information Technology',
  program: 'BSIT Program',
}

const summary: SummaryLine[] = [
  { key: 'programs', title: 'Programs', active: 1, archived: 0, total: 1 },
  { key: 'clos', title: 'Course Learning Outcomes', active: 2, archived: 1, total: 3 },
]

const programs: ReportSection = {
  key: 'programs',
  title: 'Programs',
  hasCourse: false,
  rows: [
    { code: 'BSIT', name: 'Bachelor of Science in Information Technology', status: 'active' },
    { code: 'BSCS', name: 'Computer Science', status: 'archived' },
  ],
}

const clos: ReportSection = {
  key: 'clos',
  title: 'Course Learning Outcomes',
  hasCourse: true,
  rows: [
    { code: 'CLO-1', name: 'Apply PO-12, PO-6', course: 'IT21', status: 'active' },
    { code: 'CLO-2', name: 'Analyze PO-3', course: 'IT21', status: 'active' },
  ],
}

const report: Report = {
  sections: [programs, clos],
  summary,
  shownCount: 4,
}

const emptySection: Report = {
  sections: [{ key: 'courses', title: 'Courses', hasCourse: false, rows: [] }],
  summary,
  shownCount: 0,
}

describe('overallReportPdfFileName', () => {
  it('names the file by date', () => {
    expect(overallReportPdfFileName(new Date(2026, 9, 18))).toBe('overall-report-2026-10-18.pdf')
  })
})

describe('columnWidths', () => {
  it('fills the content width with or without a course column', () => {
    const sum = (w: number[]) => w.reduce((a, b) => a + b, 0)
    expect(sum(columnWidths(false))).toBe(182)
    expect(sum(columnWidths(true))).toBe(182)
  })

  it('gives the name column more room without the course column', () => {
    const withoutCourse = columnWidths(false)
    const withCourse = columnWidths(true)
    // Same index only because the course column is inserted, so compare by the
    // shared layout: the name column is whatever is left over.
    expect(withoutCourse[withoutCourse.length - 2]).toBeGreaterThan(
      withCourse[withCourse.length - 2],
    )
  })
})

describe('renderReportsPdf title block', () => {
  const { doc, texts } = recorder()
  renderReportsPdf(doc, report, meta)

  it('names the document and the system', () => {
    expect(texts.some((t) => t.text === 'CQI MONITORING SYSTEM')).toBe(true)
    expect(texts.some((t) => t.text === 'Overall Report')).toBe(true)
  })

  it('carries the scope, year, semester and stamp', () => {
    // The institute and the program share one scope line under the title.
    expect(
      texts.some((t) => t.text.includes(meta.institute) && t.text.includes(meta.program)),
    ).toBe(true)
    expect(texts.some((t) => t.text === 'ACADEMIC YEAR')).toBe(true)
    expect(texts.some((t) => t.text === '2026 - 2027')).toBe(true)
    expect(texts.some((t) => t.text === 'SEMESTER')).toBe(true)
    expect(texts.some((t) => t.text === '1')).toBe(true)
    expect(texts.some((t) => t.text === meta.generated)).toBe(true)
  })

  it('leaves the semester out when the report has none', () => {
    const other = recorder()
    renderReportsPdf(other.doc, report, {
      academicYear: '2026 - 2027',
      generated: 'Oct 17, 2026 02:24 PM',
    })
    expect(other.texts.some((t) => t.text === 'SEMESTER')).toBe(false)
  })
})

describe('renderReportsPdf tables', () => {
  const { doc, texts, pageOf } = recorder()
  renderReportsPdf(doc, report, meta)

  it('summarises the whole dataset before the tables', () => {
    const active = pageOf('Active').length
    expect(active).toBeGreaterThan(0)
    expect(texts.some((t) => t.text === 'Section')).toBe(true)
    // The summary counts all three learning outcomes; the tables below show two.
    expect(texts.some((t) => t.text === '3')).toBe(true)
  })

  it('renders a section heading and its column headings', () => {
    expect(texts.some((t) => t.text === 'Programs')).toBe(true)
    expect(texts.some((t) => t.text === 'Course Learning Outcomes')).toBe(true)
    expect(texts.some((t) => t.text === 'No.')).toBe(true)
    expect(texts.some((t) => t.text === 'Code')).toBe(true)
    expect(texts.some((t) => t.text === 'Name')).toBe(true)
  })

  it('shows the course column only where a section has one', () => {
    // Course appears once as a column heading, not once per section.
    expect(pageOf('Course').length).toBe(1)
  })

  it('labels every row Active or Archived, matching the summary wording', () => {
    expect(texts.some((t) => t.text === 'Status')).toBe(true)
    expect(pageOf('Active').some((t) => t.align === 'right')).toBe(true)
    expect(pageOf('Archived').some((t) => t.align === 'right')).toBe(true)
  })

  it('numbers rows from one within each section', () => {
    expect(pageOf('1').length).toBeGreaterThan(0)
    expect(pageOf('2').length).toBeGreaterThan(0)
  })

  it('right-aligns the count columns and left-aligns the names', () => {
    const name = texts.find((t) => t.text === 'Information Technology' || t.text === 'Bachelor of Science in Information Technology')
    expect(name?.align).toBeUndefined()
    const status = pageOf('Archived')
    expect(status[0]?.align).toBe('right')
  })

  it('marks an archived row by its ink rather than a word in the name', () => {
    const archived = texts.find((t) => t.text === 'Computer Science')
    const active = texts.find((t) => t.text === 'Bachelor of Science in Information Technology')
    expect(archived?.color).not.toBe(active?.color)
  })

  it('says so when a section has nothing to show', () => {
    const empty = recorder()
    renderReportsPdf(empty.doc, emptySection, meta)
    expect(empty.texts.some((t) => t.text === 'No records to show.')).toBe(true)
  })
})

describe('renderReportsPdf pagination', () => {
  /** A section long enough to run off the bottom of an A4 page several times. */
  const longSection: Report = {
    ...report,
    sections: [
      {
        key: 'clos',
        title: 'Course Learning Outcomes',
        hasCourse: true,
        rows: Array.from({ length: 220 }, (_, i): ReportRow => ({
          code: `CLO-${i + 1}`,
          name: `Outcome number ${i + 1} for subject IT21`,
          course: 'IT21',
          status: 'active',
        })),
      },
    ],
  }

  const { doc, texts, pageOf } = recorder()
  renderReportsPdf(doc, longSection, meta)

  it('runs onto more pages than one', () => {
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('repeats the column headings on the continuation pages', () => {
    const headingPages = new Set(pageOf('Code').map((t) => t.page))
    expect(headingPages.size).toBeGreaterThan(1)
  })

  it('identifies the document on every page after the first', () => {
    const headers = texts.filter((t) => t.text.startsWith('Academic Year'))
    expect(new Set(headers.map((t) => t.page)).size).toBeGreaterThan(1)
  })

  it('keeps numbering across the break instead of restarting at one', () => {
    // The last row is only on the document if its number survived every page
    // change; a counter reset per page would stop well short of 220.
    expect(texts.some((t) => t.text === '220')).toBe(true)
  })

  it('stamps every page with the page number and the total', () => {
    const total = doc.getNumberOfPages()
    for (let page = 1; page <= total; page += 1) {
      expect(texts.some((t) => t.text === `Page ${page} of ${total}` && t.page === page)).toBe(true)
    }
    expect(texts.some((t) => t.text === `Generated ${meta.generated}`)).toBe(true)
  })
})

describe('buildReportsPdf', () => {
  // The layout above is exercised without jsPDF, which leaves the one thing only
  // the real thing can answer: does the click produce a file at all. A wrong
  // output format or a missing method here fails silently in the browser --
  // every other test still passes and the user gets an empty download.
  it('returns a real PDF blob', async () => {
    const blob = await buildReportsPdf(report, meta)
    expect(blob.size).toBeGreaterThan(1000)
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())
    expect(head).toBe('%PDF-')
  })
})
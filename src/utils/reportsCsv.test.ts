import { describe, expect, it } from 'vitest'
import { buildReportsCsv, csvCell, csvLine, overallReportFileName } from './reportsCsv'
import type { Report } from './reports'

const report: Report = {
  summary: [
    { key: 'programs', title: 'Programs', active: 1, archived: 0, total: 1 },
    { key: 'clos', title: 'Learning Outcomes', active: 2, archived: 0, total: 2 },
  ],
  shownCount: 3,
  sections: [
    {
      key: 'programs',
      title: 'Programs',
      hasCourse: false,
      rows: [{ code: 'BSIT', name: 'Information Technology', status: 'active' }],
    },
    {
      key: 'clos',
      title: 'Course Learning Outcomes',
      hasCourse: true,
      rows: [
        {
          code: 'CLO-1',
          name: 'Apply PO-12, PO-6',
          course: 'IT21',
          status: 'active',
        },
      ],
    },
  ],
}

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('PO-12')).toBe('PO-12')
  })

  it('passes numbers through as text', () => {
    expect(csvCell(12)).toBe('12')
  })

  it('quotes cells that contain a comma', () => {
    expect(csvCell('PO-12, PO-6')).toBe('"PO-12, PO-6"')
  })

  it('doubles embedded quotes', () => {
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""')
  })
})

describe('csvLine', () => {
  it('joins cells with commas', () => {
    expect(csvLine(['No.', 'Code', 'Name'])).toBe('No.,Code,Name')
  })
})

describe('buildReportsCsv', () => {
  const csv = buildReportsCsv(report, {
    academicYear: '2026 - 2027',
    generated: 'Oct 17, 2026 02:24 PM',
  })

  it('opens with the meta block', () => {
    expect(csv.split('\r\n').slice(0, 3)).toEqual([
      'CQI Monitoring System — Overall Report',
      'Academic Year,2026 - 2027',
      'Report Generated,"Oct 17, 2026 02:24 PM"',
    ])
  })

  it('renders each section with its header row and numbered rows', () => {
    expect(csv).toContain('Programs\r\nNo.,Code,Name\r\n1,BSIT,Information Technology')
  })

  it('shows the course column only where a section has it', () => {
    expect(csv).toContain('Course Learning Outcomes\r\nNo.,Code,Course,Name')
    expect(csv).toContain('1,CLO-1,IT21,"Apply PO-12, PO-6"')
  })

  it('separates sections with a blank line and ends with one', () => {
    expect(csv).toMatch(/Information Technology\r\n\r\nCourse Learning Outcomes/)
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})

describe('overallReportFileName', () => {
  it('names the file by date', () => {
    expect(overallReportFileName(new Date(2026, 9, 18))).toBe('overall-report-2026-10-18.csv')
  })
})

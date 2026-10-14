import { describe, it, expect } from 'vitest'
import { reportFileName } from './download'

// Shared by the PDF and Word exports, so the two must agree on naming.
describe('reportFileName', () => {
  const d = new Date(2026, 9, 14) // 14 Oct 2026, local time

  it('builds syllabus-<code>-<YYYY-MM-DD>.<ext>', () => {
    expect(reportFileName('IT21', 'pdf', d)).toBe('syllabus-IT21-2026-10-14.pdf')
    expect(reportFileName('IT21', 'docx', d)).toBe('syllabus-IT21-2026-10-14.docx')
  })

  it('zero-pads month and day', () => {
    expect(reportFileName('IT21', 'pdf', new Date(2026, 0, 5))).toBe('syllabus-IT21-2026-01-05.pdf')
    expect(reportFileName('IT21', 'pdf', new Date(2026, 11, 31))).toBe('syllabus-IT21-2026-12-31.pdf')
  })

  it('keeps a hyphenated course code intact', () => {
    expect(reportFileName('IT-21', 'pdf', d)).toBe('syllabus-IT-21-2026-10-14.pdf')
  })

  it('strips characters that are unsafe in a filename', () => {
    expect(reportFileName('IT 21/A', 'pdf', d)).toBe('syllabus-IT-21-A-2026-10-14.pdf')
  })

  it('collapses runs of separators', () => {
    expect(reportFileName('IT  21   /  A', 'pdf', d)).toBe('syllabus-IT-21-A-2026-10-14.pdf')
  })

  it('falls back to "report" when the code has no usable characters', () => {
    expect(reportFileName('   ', 'pdf', d)).toBe('syllabus-report-2026-10-14.pdf')
    expect(reportFileName('', 'docx', d)).toBe('syllabus-report-2026-10-14.docx')
  })
})
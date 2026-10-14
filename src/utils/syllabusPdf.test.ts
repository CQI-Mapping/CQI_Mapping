import { describe, it, expect } from 'vitest'
import { pdfFileSlug } from './syllabusPdf'

// Importing the module must not pull html2pdf.js in — the dynamic import sits
// inside downloadSyllabusPdf, which keeps the ~750 KB library off first load.
describe('pdfFileSlug', () => {
  it('builds syllabus-<code>-<YYYY-MM-DD>.pdf', () => {
    const d = new Date(2026, 9, 14) // 14 Oct 2026, local time
    expect(pdfFileSlug('IT21', d)).toBe('syllabus-IT21-2026-10-14.pdf')
  })

  it('zero-pads month and day', () => {
    expect(pdfFileSlug('IT21', new Date(2026, 0, 5))).toBe('syllabus-IT21-2026-01-05.pdf')
    expect(pdfFileSlug('IT21', new Date(2026, 11, 31))).toBe('syllabus-IT21-2026-12-31.pdf')
  })

  it('keeps a hyphenated course code intact', () => {
    expect(pdfFileSlug('IT-21', new Date(2026, 9, 14))).toBe('syllabus-IT-21-2026-10-14.pdf')
  })

  it('strips characters that are unsafe in a filename', () => {
    expect(pdfFileSlug('IT 21/A', new Date(2026, 9, 14))).toBe('syllabus-IT-21-A-2026-10-14.pdf')
  })

  it('collapses runs of separators', () => {
    expect(pdfFileSlug('IT  21   /  A', new Date(2026, 9, 14)))
      .toBe('syllabus-IT-21-A-2026-10-14.pdf')
  })

  it('falls back to "report" when the code has no usable characters', () => {
    expect(pdfFileSlug('   ', new Date(2026, 9, 14))).toBe('syllabus-report-2026-10-14.pdf')
    expect(pdfFileSlug('', new Date(2026, 9, 14))).toBe('syllabus-report-2026-10-14.pdf')
  })
})
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CoverageSpine from './CoverageSpine'
import { coverageSummary } from '../utils/coverage'
import type { CloPoMappingEntry, CourseLearningOutcome } from '../services/database'

// The spine renders a coverageSummary() and nothing else, so these tests build
// one through the same pure function the page uses rather than hand-writing
// numbers -- a fixture that disagreed with coverageSummary would let these pass
// while the page showed something else.

const clos = (n: number): CourseLearningOutcome[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `l${i}`,
    code: `CLO-${i + 1}`,
    description: null,
    course_id: 'c1',
    created_at: '',
  }))

const map = (i: number): CloPoMappingEntry => ({
  id: `m${i}`,
  level: 3,
  clo_id: { id: `l${i}`, code: `CLO-${i + 1}`, course_id: 'c1' },
  po_id: { id: 'o1', code: 'PO-1', program_id: 'p1' },
})

const render = (total: number, mapped: number, fullyMappedCourses = 0, coursesTotal = 0) =>
  renderToStaticMarkup(
    createElement(CoverageSpine, {
      programCode: 'BSIT',
      coverage: coverageSummary(clos(total), clos(mapped).map((_, i) => map(i))),
      coursesFullyMapped: fullyMappedCourses,
      coursesTotal,
    }),
  )

describe('CoverageSpine', () => {
  it('leads with the coverage percentage and the program', () => {
    const html = render(4, 3)
    expect(html).toContain('Mapping coverage · BSIT')
    expect(html).toContain('75%')
    expect(html).toContain('3 of 4 learning outcomes reach at least one Program Outcome')
  })

  it('splits the bar between mapped and unmapped', () => {
    const html = render(4, 3)
    expect(html).toContain('width:75%')
    expect(html).toContain('width:25%')
  })

  it('counts mapped and unmapped outcomes as text beside the bar', () => {
    const html = render(4, 3, 2, 5)
    expect(html).toContain('2</span> of 5 courses')
    expect(html).toContain('1</span> unmapped')
  })

  // A fresh program has no outcomes at all. Showing 0% would claim the mapping
  // is complete-but-empty, which is a different and wrong finding.
  it('shows a dash and says why, rather than 0%, with no outcomes', () => {
    const html = render(0, 0)
    expect(html).toContain('<span class="spine__value">—</span>')
    expect(html).toContain('No learning outcomes recorded for this program yet')
    // The bar still renders full width, so the layout does not jump.
    expect(html).toContain('width:100%')
  })

  it('describes the bar for a screen reader, not just its colour', () => {
    const html = render(4, 3)
    expect(html).toContain('75% mapped, 1 learning outcomes unmapped')
  })
})

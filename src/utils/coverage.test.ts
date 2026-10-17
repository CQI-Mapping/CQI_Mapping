import { describe, it, expect } from 'vitest'
import {
  alignmentMatrix,
  coverageSummary,
  courseCoverage,
  mappingGaps,
  poCoverage,
  programClos,
  programCourses,
  programMappings,
} from './coverage'
import type {
  CloPoMappingEntry,
  Course,
  CourseLearningOutcome,
  Program,
  ProgramOutcome,
} from '../services/database'

const program = (id = 'p1', code = 'BSIT'): Program => ({
  id,
  code,
  name: `Bachelor of Science in ${code}`,
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
})

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  code: 'IT21',
  title: 'Object Oriented Programming',
  units: 3,
  credit_lecture: 2,
  credit_laboratory: 1,
  description: '',
  program_id: 'p1',
  curriculum_id: null,
  instructor_id: null,
  prerequisite: '',
  corequisite: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const clo = (over: Partial<CourseLearningOutcome> = {}): CourseLearningOutcome => ({
  id: 'l1',
  code: 'CLO-1',
  description: 'Explain classes and objects',
  course_id: 'c1',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const po = (over: Partial<ProgramOutcome> = {}): ProgramOutcome => ({
  id: 'o1',
  code: 'PO-1',
  description: 'Articulate and discuss the latest in the field',
  program_id: 'p1',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const map = (over: Partial<CloPoMappingEntry> = {}): CloPoMappingEntry => ({
  id: 'm1',
  level: 3,
  clo_id: { id: 'l1', code: 'CLO-1', course_id: 'c1' },
  po_id: { id: 'o1', code: 'PO-1', program_id: 'p1' },
  ...over,
})

describe('program scoping', () => {
  it('keeps only the courses and CLOs of the selected program', () => {
    const courses = [course(), course({ id: 'c2', code: 'CS11', program_id: 'p2' })]
    const clos = [clo(), clo({ id: 'l2', course_id: 'c2' })]
    expect(programCourses(courses, 'p1').map((c) => c.code)).toEqual(['IT21'])
    expect(programClos(courses, clos, 'p1').map((c) => c.id)).toEqual(['l1'])
  })

  it('keeps only mappings whose two endpoints are in the program', () => {
    // The caller hands in the program's CLO list (programClos output); the
    // rows must not sneak in a PO from another program on that side.
    const clos = [clo()]
    const rows = [
      map(),
      // a mapping into a PO of another program, even from this program's CLO
      map({ id: 'm2', po_id: { id: 'o9', code: 'PO-1', program_id: 'p2' } }),
      // a mapping into a CLO the caller did not hand in
      map({ id: 'm3', clo_id: { id: 'l2', code: 'CLO-1', course_id: 'c2' } }),
    ]
    expect(programMappings(clos, rows, 'p1')).toHaveLength(1)
  })
})

describe('coverageSummary', () => {
  it('counts a CLO mapped when any PO reaches it', () => {
    const clos = [clo(), clo({ id: 'l2' })]
    const rows = [
      map(),
      // second mapping of the same CLO must not double-count it
      map({ id: 'm2', po_id: { id: 'o2', code: 'PO-2', program_id: 'p1' } }),
    ]
    const summary = coverageSummary(clos, rows)
    expect(summary).toEqual({
      totalClos: 2,
      mappedClos: 1,
      coveragePercent: 50,
      unmappedClos: 1,
    })
  })

  it('is zero, not NaN, with no CLOs at all', () => {
    expect(coverageSummary([], [])).toEqual({
      totalClos: 0,
      mappedClos: 0,
      coveragePercent: 0,
      unmappedClos: 0,
    })
  })
})

describe('courseCoverage', () => {
  it('separates mapped, partially mapped and unmapped courses', () => {
    const courses = [course(), course({ id: 'c2', code: 'IT22' }), course({ id: 'c3', code: 'IT23' })]
    const clos = [
      clo(),
      clo({ id: 'l2', course_id: 'c2' }),
      clo({ id: 'l3', course_id: 'c2' }),
      clo({ id: 'l4', course_id: 'c3' }),
    ]
    const rows = [
      map(), // c1's only CLO is mapped
      map({ id: 'm2', clo_id: { id: 'l2', code: 'CLO-1', course_id: 'c2' } }), // one of c2's two
    ]
    const byStatus = Object.fromEntries(
      courseCoverage(courses, clos, rows).map((r) => [r.course.id, r.status]),
    )
    expect(byStatus).toEqual({ c1: 'mapped', c2: 'partial', c3: 'unmapped' })
  })

  it('calls a course with no CLOs "none", not "unmapped"', () => {
    const rows = courseCoverage([course()], [], [])
    expect(rows[0].status).toBe('none')
    expect(rows[0].cloCount).toBe(0)
  })
})

describe('mappingGaps', () => {
  it('lists only the CLOs with no mapping, with their course code', () => {
    const courses = [course(), course({ id: 'c2', code: 'IT22' })]
    const clos = [clo(), clo({ id: 'l2', course_id: 'c2' })]
    const gaps = mappingGaps(clos, [map()], courses)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].courseCode).toBe('IT22')
  })
})

describe('poCoverage', () => {
  it('measures each PO against the whole CLO list of its program', () => {
    const clos = [clo(), clo({ id: 'l2' })]
    const pos = [po(), po({ id: 'o2', code: 'PO-2' })]
    const rows = [
      map(),
      map({
        id: 'm2',
        clo_id: { id: 'l2', code: 'CLO-1', course_id: 'c1' },
        po_id: { id: 'o2', code: 'PO-2', program_id: 'p1' },
      }),
    ]
    const coverage = poCoverage(pos, clos, rows)
    expect(coverage.map((c) => c.percent)).toEqual([50, 50])
  })

  it('keeps an unmapped PO at 0% rather than dropping it', () => {
    const clos = [clo()]
    const coverage = poCoverage([po(), po({ id: 'o2', code: 'PO-2' })], clos, [map()])
    expect(coverage.find((c) => c.po.code === 'PO-2')?.percent).toBe(0)
  })

  it('sorts by parsed number, PO-2 before PO-10', () => {
    const coverage = poCoverage(
      [po({ id: 'b', code: 'PO-10' }), po({ id: 'a', code: 'PO-2' })],
      [],
      [],
    )
    expect(coverage.map((c) => c.po.code)).toEqual(['PO-2', 'PO-10'])
  })

  it('is 0% for every PO when the program has no CLOs', () => {
    const coverage = poCoverage([po()], [], [])
    expect(coverage[0]).toEqual({ po: expect.anything(), mappedCloCount: 0, percent: 0 })
  })
})

describe('alignmentMatrix', () => {
  // A duplicate cell cannot exist in the database -- the table is UNIQUE
  // (clo_id, po_id) -- so the guard here is a client that ignores that.
  it('holds the deepest level when a CLO maps a PO twice', () => {
    const rows = alignmentMatrix([clo()], [po()], [map(), map({ id: 'm2', level: 1 })], [course()])
    expect(rows[0].levels).toEqual([3])
  })

  it('gives every CLO a row, unmapped ones included', () => {
    const courses = [course()]
    const clos = [clo(), clo({ id: 'l2', code: 'CLO-2' })]
    const rows = alignmentMatrix(clos, [po()], [map()], courses)
    expect(rows).toHaveLength(2)
    expect(rows[1].levels).toEqual([null])
    expect(rows[0].levels).toEqual([3])
  })

  it('sorts rows by course code, then CLO code', () => {
    const courses = [course({ id: 'c2', code: 'IT13' })]
    const clos = [
      clo({ id: 'l3', course_id: 'c2', code: 'CLO-2' }),
      clo({ id: 'l2', code: 'CLO-2' }),
      clo({ id: 'l1', course_id: 'c2', code: 'CLO-1' }),
    ]
    const rows = alignmentMatrix(clos, [po()], [], [course(), course({ id: 'c2', code: 'IT13' })])
    expect(rows.map((r) => `${r.courseCode} ${r.clo.code}`)).toEqual([
      'IT13 CLO-1',
      'IT13 CLO-2',
      'IT21 CLO-2',
    ])
  })
})

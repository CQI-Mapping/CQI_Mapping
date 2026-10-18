import { describe, it, expect } from 'vitest'
import {
  buildReport,
  buildRecordMix,
  isArchived,
  BLANK_NAME,
  COLUMNS,
  SECTION_ORDER,
  SECTION_TITLES,
} from './reports'
import type { ReportInput } from './reports'
import type {
  Course,
  CourseLearningOutcomeStandalone,
  Program,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../services/database'

const program = (over: Partial<Program> = {}): Program => ({
  id: 'p1',
  code: 'BSIT',
  name: 'Bachelor of Science in Information Technology',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  code: 'IT21',
  title: 'Object Oriented Programming',
  units: 3,
  credit_lecture: 2,
  credit_laboratory: 1,
  description: null,
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

const po = (over: Partial<ProgramOutcomeStandalone> = {}): ProgramOutcomeStandalone => ({
  id: 'o1',
  code: 'PO-1',
  title: 'Articulate and discuss the latest in the field',
  description: null,
  cmo_id: null,
  cmo_text: null,
  peo_id: null,
  peo_text: null,
  sg_id: null,
  sg_text: null,
  source: 'admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const peo = (over: Partial<ProgramEducationalObjective> = {}): ProgramEducationalObjective => ({
  id: 'e1',
  code: 'PEO-1',
  title: 'Produce competent graduates',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const clo = (
  over: Partial<CourseLearningOutcomeStandalone> = {},
): CourseLearningOutcomeStandalone => ({
  id: 'l1',
  code: 'CLO-1',
  course: 'IT21',
  title: 'Explain classes and objects',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const empty = (over: Partial<ReportInput> = {}): ReportInput => ({
  programs: [],
  courses: [],
  pos: [],
  peos: [],
  clos: [],
  ...over,
})

const sectionOf = (inv: ReturnType<typeof buildReport>, key: string) =>
  inv.sections.find((s) => s.key === key)!

/**
 * The sections that actually have a row. buildReport() always returns all
 * five sections so the page can render a heading and an empty-state row for
 * each; filtering empties the rows, it does not remove the section.
 */
const shownKeys = (inv: ReturnType<typeof buildReport>) =>
  inv.sections.filter((s) => s.rows.length > 0).map((s) => s.key)

describe('buildReport', () => {
  it('returns all five sections in institutional-to-detail order', () => {
    const inv = buildReport(empty())
    expect(inv.sections.map((s) => s.key)).toEqual([
      'programs',
      'peos',
      'pos',
      'courses',
      'clos',
    ])
    expect(inv.sections.map((s) => s.title)).toEqual([
      'Programs',
      'Program Educational Objectives',
      'Program Outcomes',
      'Courses',
      'Course Learning Outcomes',
    ])
  })

  it('handles an entirely empty database without throwing', () => {
    const inv = buildReport(empty())
    expect(inv.shownCount).toBe(0)
    expect(inv.sections.every((s) => s.rows.length === 0)).toBe(true)
    expect(inv.summary.every((l) => l.total === 0)).toBe(true)
  })

  it('flattens each list into its own code-and-name row', () => {
    const inv = buildReport(
      empty({
        programs: [program()],
        courses: [course()],
        pos: [po()],
        peos: [peo()],
        clos: [clo()],
      }),
    )
    expect(inv.shownCount).toBe(5)
    expect(inv.sections.map((s) => s.rows[0].name)).toEqual([
      'Bachelor of Science in Information Technology',
      'Produce competent graduates',
      'Articulate and discuss the latest in the field',
      'Object Oriented Programming',
      'Explain classes and objects',
    ])
  })

  // This report is a name list. The first version carried program / units / CMO
  // / description too; these are the guards against those creeping back into
  // the row shape. Learning outcomes are the one exception: a row may also know
  // the course it belongs to, because CLO-1 of one course and CLO-1 of another
  // are indistinguishable without it.
  it('carries a code, a name and a status on every row, plus a course only for CLOs', () => {
    const inv = buildReport(
      empty({
        programs: [program()],
        courses: [course()],
        pos: [po()],
        peos: [peo()],
        clos: [clo()],
      }),
    )
    for (const section of inv.sections) {
      for (const row of section.rows) {
        expect(Object.keys(row).sort()).toEqual(
          section.key === 'clos' ? ['code', 'course', 'name', 'status'] : ['code', 'name', 'status'],
        )
      }
    }
  })

  it('trims stored whitespace so names do not render padded', () => {
    const inv = buildReport(
      empty({ peos: [peo({ title: '  Produce competent graduates  ' })] }),
    )
    expect(sectionOf(inv, 'peos').rows[0].name).toBe('Produce competent graduates')
  })

  // A blank title is allowed by the data even though the column is NOT NULL:
  // an empty string passes that constraint, and would otherwise render as a
  // blank cell in a report whose whole job is listing names.
  it('falls back to a placeholder when a name is blank', () => {
    const inv = buildReport(empty({ peos: [peo({ title: '   ' })] }))
    expect(sectionOf(inv, 'peos').rows[0].name).toBe(BLANK_NAME)
  })

  it('uses a learning outcome description when its title is blank', () => {
    const inv = buildReport(
      empty({ clos: [clo({ title: '', description: 'Explain classes and objects' })] }),
    )
    expect(sectionOf(inv, 'clos').rows[0].name).toBe('Explain classes and objects')
  })

  describe('archived records', () => {
    const withArchived = empty({
      peos: [peo({ code: 'PEO-1' }), peo({ id: 'e2', code: 'PEO-2', status: 'archived' })],
    })

    it('hides archived records by default', () => {
      const rows = sectionOf(buildReport(withArchived), 'peos').rows
      expect(rows.map((r) => r.code)).toEqual(['PEO-1'])
    })

    it('includes them when asked', () => {
      const rows = sectionOf(buildReport(withArchived, { includeArchived: true }), 'peos').rows
      expect(rows.map((r) => r.code)).toEqual(['PEO-1', 'PEO-2'])
    })

    it('still marks them, so the page can show them as archived', () => {
      const rows = sectionOf(buildReport(withArchived, { includeArchived: true }), 'peos').rows
      expect(rows.map(isArchived)).toEqual([false, true])
    })

    // The summary counts the dataset, not the filtered view. Counting the
    // visible rows instead would report "0 archived" the moment archived
    // records are hidden, which reads as data loss rather than a filter.
    it('counts archived records in the summary even while hiding them', () => {
      const line = buildReport(withArchived).summary.find((l) => l.key === 'peos')!
      expect(line).toMatchObject({ active: 1, archived: 1, total: 2 })
    })

    it('treats a record with no status column as active', () => {
      const inv = buildReport(empty({ peos: [{ ...peo(), status: undefined as never }] }))
      expect(inv.shownCount).toBe(1)
      expect(isArchived(inv.sections[1].rows[0])).toBe(false)
    })
  })

  describe('search', () => {
    const data = empty({
      programs: [program({ code: 'BSIT', name: 'Bachelor of Science in Information Technology' })],
      courses: [course({ code: 'IT21', title: 'Object Oriented Programming' })],
    })

    it('matches on name, case-insensitively', () => {
      expect(shownKeys(buildReport(data, { query: 'INFORMATION TECHNOLOGY' }))).toEqual([
        'programs',
      ])
    })

    // The search box is aimed at codes typed the way they are stored ("PO-1"),
    // but a user types "po 1" and "po1". All three forms have to find the same
    // outcome, which is why normalisation drops punctuation instead of
    // replacing it with a space.
    it.each(['po-1', 'po 1', 'po1', 'PO 1'])(
      'matches the stored code PO-1 when searched as %j',
      (q) => {
        expect(shownKeys(buildReport(empty({ pos: [po({ code: 'PO-1' })] }), { query: q }))).toEqual(
          ['pos'],
        )
      },
    )

    // The cost of dropping punctuation: "po 1" is a substring of "po10". An
    // extra row is the acceptable failure; finding nothing is not.
    it('over-matches PO-10 when searching PO 1, by design', () => {
      expect(shownKeys(buildReport(empty({ pos: [po({ code: 'PO-10' })] }), { query: 'po 1' }))).toEqual(
        ['pos'],
      )
    })

    it('returns nothing for a query that matches nothing', () => {
      const inv = buildReport(data, { query: 'zzzz' })
      expect(inv.shownCount).toBe(0)
      expect(inv.summary.find((l) => l.key === 'courses')!.total).toBe(1)
    })

    it('treats whitespace-only input as no filter', () => {
      expect(buildReport(data, { query: '   ' }).shownCount).toBe(2)
    })

    // Search matches only the two columns the table shows. Matching a column
    // that was removed from the table would return rows whose reason for
    // matching is invisible.
    it('does not match on a description that is no longer displayed', () => {
      const inv = buildReport(
        empty({ programs: [program({ description: 'Information Technology' })] }),
        { query: 'description text' },
      )
      expect(inv.shownCount).toBe(0)
    })
  })

  describe('ordering', () => {
    // Course codes are stored without a separator ("IT1", "IT21"), so plain
    // string order would put IT21 before IT3.
    it('sorts codes numerically where they carry numbers', () => {
      const inv = buildReport(
        empty({
          courses: [
            course({ id: 'a', code: 'IT21' }),
            course({ id: 'b', code: 'IT3' }),
            course({ id: 'c', code: 'IT10' }),
          ],
        }),
      )
      expect(sectionOf(inv, 'courses').rows.map((r) => r.code)).toEqual(['IT3', 'IT10', 'IT21'])
    })

    it('sorts outcomes by their parsed number, as the Curriculum Report does', () => {
      const inv = buildReport(
        empty({ pos: [po({ id: 'b', code: 'PO-10' }), po({ id: 'a', code: 'PO-2' })] }),
      )
      expect(sectionOf(inv, 'pos').rows.map((r) => r.code)).toEqual(['PO-2', 'PO-10'])
    })

    it('puts learning outcomes in subject order, then code', () => {
      const inv = buildReport(
        empty({
          clos: [
            clo({ id: '1', code: 'CLO-2', course: 'IT21' }),
            clo({ id: '2', code: 'CLO-1', course: 'IT21' }),
            clo({ id: '3', code: 'CLO-1', course: 'IT13' }),
          ],
        }),
      )
      // IT13 comes before IT21, and within IT21 the outcomes run 1 then 2. The
      // subject is not shown, but it is the only thing separating one course's
      // CLO-1 from another's, so it decides the order.
      expect(sectionOf(inv, 'clos').rows.map((r) => r.code)).toEqual([
        'CLO-1',
        'CLO-1',
        'CLO-2',
      ])
    })

    it('does not mutate the arrays it was handed', () => {
      const pos = [po({ id: 'b', code: 'PO-10' }), po({ id: 'a', code: 'PO-2' })]
      const snapshot = pos.map((p) => p.code)
      buildReport(empty({ pos }))
      expect(pos.map((p) => p.code)).toEqual(snapshot)
    })
  })
})

// Guards the two declarations that must stay in step: SECTION_ORDER drives the
// page and the summary, so a section missing from it would exist in
// SECTION_TITLES and never render anywhere.
describe('section declarations', () => {
  it('titles every ordered section exactly once', () => {
    expect([...SECTION_ORDER].sort()).toEqual(Object.keys(SECTION_TITLES).sort())
  })

  it('has no duplicate section keys', () => {
    expect(new Set(SECTION_ORDER).size).toBe(SECTION_ORDER.length)
  })

  // Every section shares one column list. The first version gave each section
  // its own, and the header and the body drifted apart.
  it('uses one shared column list for every section', () => {
    expect(COLUMNS).toEqual(['Code', 'Name'])
  })
})

describe('buildRecordMix', () => {
  const mixOf = (inv: ReturnType<typeof buildReport>) => buildRecordMix(inv.summary)

  it('counts every record, archived included', () => {
    const inv = buildReport(
      empty({
        programs: [program(), program({ id: 'p2', code: 'BSCS', status: 'archived' })],
        clos: [clo()],
      }),
    )
    // Archived records are hidden by default on the page, but the donut reports
    // what is on the books -- the same total the Totals table shows.
    const mix = mixOf(inv)
    expect(mix.total).toBe(3)
    expect(mix.slices.find((s) => s.key === 'programs')?.total).toBe(2)
  })

  it('gives every section a wedge, in report order, even when it is empty', () => {
    const mix = mixOf(buildReport(empty({ courses: [course()] })))
    expect(mix.slices.map((s) => s.key)).toEqual(SECTION_ORDER)
  })

  it('expresses each wedge as a share of the grand total', () => {
    const mix = mixOf(
      buildReport(empty({ courses: [course(), course({ id: 'c2' }), course({ id: 'c3' })] })),
    )
    const courses = mix.slices.find((s) => s.key === 'courses')!
    expect(courses.percent).toBe(100)
    expect(mix.slices.filter((s) => s.key !== 'courses').every((s) => s.percent === 0)).toBe(true)
  })

  it('rounds a share to one decimal place', () => {
    // 1 of 3 is 33.333...%, which has to render as something an arc can
    // honestly stand for.
    const mix = mixOf(buildReport(empty({ courses: [course()], clos: [clo(), clo({ id: 'l2' })] })))
    expect(mix.slices.find((s) => s.key === 'courses')?.percent).toBe(33.3)
    expect(mix.slices.find((s) => s.key === 'clos')?.percent).toBe(66.7)
  })

  // The divide-by-zero the chart would otherwise hit on a fresh install.
  it('returns zeroes rather than NaN for an empty database', () => {
    const mix = mixOf(buildReport(empty()))
    expect(mix.total).toBe(0)
    expect(mix.slices.every((s) => s.percent === 0 && s.total === 0)).toBe(true)
  })

  it('is unaffected by the search box, which hides rows but not records', () => {
    const input = empty({
      courses: [course(), course({ id: 'c2', code: 'IT22' })],
      clos: [clo()],
    })
    expect(mixOf(buildReport(input, { query: 'zzz' })).total).toBe(
      mixOf(buildReport(input)).total,
    )
  })
})
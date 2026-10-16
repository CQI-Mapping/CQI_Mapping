import { describe, it, expect } from 'vitest'
import {
  buildInventory,
  rowValues,
  programLabel,
  SECTION_DEFS,
  SECTION_ORDER,
} from './nameInventory'
import type { InventoryInput } from './nameInventory'
import type {
  ChedMemoOrder,
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

const cmo = (over: Partial<ChedMemoOrder> = {}): ChedMemoOrder => ({
  id: 'm1',
  code: 'CMO 25 s. 2015',
  title: 'BSIT Program Outcomes',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const empty = (over: Partial<InventoryInput> = {}): InventoryInput => ({
  programs: [],
  courses: [],
  pos: [],
  peos: [],
  clos: [],
  cmos: [],
  ...over,
})

const sectionOf = (inv: ReturnType<typeof buildInventory>, key: string) =>
  inv.sections.find((s) => s.key === key)!

/**
 * The sections that actually have a row. buildInventory() always returns all
 * five sections so the page can render a heading and an empty-state row for
 * each; filtering empties the rows, it does not remove the section.
 */
const shownKeys = (inv: ReturnType<typeof buildInventory>) =>
  inv.sections.filter((s) => s.rows.length > 0).map((s) => s.key)

describe('buildInventory', () => {
  it('returns all five sections in institutional-to-detail order', () => {
    const inv = buildInventory(empty())
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
    const inv = buildInventory(empty())
    expect(inv.shownCount).toBe(0)
    expect(inv.sections.every((s) => s.rows.length === 0)).toBe(true)
    expect(inv.summary.every((l) => l.total === 0)).toBe(true)
  })

  it('flattens each list into its own name row', () => {
    const inv = buildInventory(
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

  it('trims stored whitespace so names do not render padded', () => {
    const inv = buildInventory(empty({ peos: [peo({ title: '  Produce competent graduates  ' })] }))
    expect(inv.sections.find((s) => s.key === 'peos')!.rows[0].name).toBe(
      'Produce competent graduates',
    )
  })

  // A blank title is allowed by the data even though the column is NOT NULL:
  // an empty string passes that constraint, and would otherwise render as a
  // blank cell in a report whose whole job is listing names.
  it('falls back to a placeholder when a name is blank', () => {
    const inv = buildInventory(empty({ peos: [peo({ title: '   ' })] }))
    expect(inv.sections.find((s) => s.key === 'peos')!.rows[0].name).toBe('—')
  })

  describe('archived records', () => {
    const withArchived = empty({
      peos: [peo({ code: 'PEO-1' }), peo({ id: 'e2', code: 'PEO-2', status: 'archived' })],
    })

    it('hides archived records by default', () => {
      const inv = buildInventory(withArchived)
      const rows = inv.sections.find((s) => s.key === 'peos')!.rows
      expect(rows.map((r) => r.code)).toEqual(['PEO-1'])
    })

    it('includes them when asked', () => {
      const inv = buildInventory(withArchived, { includeArchived: true })
      const rows = inv.sections.find((s) => s.key === 'peos')!.rows
      expect(rows.map((r) => r.code)).toEqual(['PEO-1', 'PEO-2'])
    })

    // The summary counts the dataset, not the filtered view. Counting the
    // visible rows instead would report "0 archived" the moment archived
    // records are hidden, which reads as data loss rather than a filter.
    it('counts archived records in the summary even while hiding them', () => {
      const line = buildInventory(withArchived).summary.find((l) => l.key === 'peos')!
      expect(line).toMatchObject({ active: 1, archived: 1, total: 2 })
    })

    it('treats a record with no status column as active', () => {
      const inv = buildInventory(empty({ peos: [{ ...peo(), status: undefined as never }] }))
      expect(inv.shownCount).toBe(1)
    })
  })

  describe('search', () => {
    const data = empty({
      programs: [program({ code: 'BSIT', name: 'Bachelor of Science in Information Technology' })],
      courses: [course({ code: 'IT21', title: 'Object Oriented Programming' })],
    })

    // A course's parent is part of its searchable text, so searching for a program
    // by name surfaces the courses under it — which is what someone means when
    // they type a program name into a box on a page of course names.
    it('matches a name case-insensitively, and drags in courses of that program', () => {
      const inv = buildInventory(data, { query: 'INFORMATION TECHNOLOGY' })
      expect(shownKeys(inv)).toEqual(['programs', 'courses'])
    })

    // The search box is aimed at codes typed the way they are stored ("PO-1"), but
    // a user types "po 1" and "po1". All three forms have to find the same
    // outcome, which is why normalisation drops punctuation instead of
    // replacing it with a space.
    it.each(['po-1', 'po 1', 'po1', 'PO 1'])(
      'matches the stored code PO-1 when searched as %j',
      (query) => {
        const inv = buildInventory(empty({ pos: [po({ code: 'PO-1' })] }), { query })
        expect(shownKeys(inv)).toEqual(['pos'])
      },
    )

    // The cost of dropping punctuation: "po 1" is a substring of "po10". An
    // extra row is the acceptable failure; finding nothing is not.
    it('over-matches PO-10 when searching PO 1, by design', () => {
      const inv = buildInventory(empty({ pos: [po({ code: 'PO-10' })] }), { query: 'po 1' })
      expect(shownKeys(inv)).toEqual(['pos'])
    })

    it('matches a course through its program, the way a user searches for one', () => {
      const inv = buildInventory(
        empty({
          programs: [program()],
          courses: [course({ program_id: { id: 'p1', code: 'BSIT', name: 'Information Technology' } })],
        }),
        { query: 'information technology' },
      )
      expect(shownKeys(inv)).toEqual(['programs', 'courses'])
    })

    it('returns nothing for a query that matches nothing', () => {
      const inv = buildInventory(data, { query: 'zzzz' })
      expect(inv.shownCount).toBe(0)
      expect(inv.summary.find((l) => l.key === 'courses')!.total).toBe(1)
    })

    it('treats whitespace-only input as no filter', () => {
      expect(buildInventory(data, { query: '   ' }).shownCount).toBe(2)
    })
  })

  describe('ordering', () => {
    // Course codes are stored without a separator ("IT1", "IT21"), so plain
    // string order would put IT21 before IT3.
    it('sorts codes numerically where they carry numbers', () => {
      const inv = buildInventory(
        empty({
          courses: [
            course({ id: 'a', code: 'IT21' }),
            course({ id: 'b', code: 'IT3' }),
            course({ id: 'c', code: 'IT10' }),
          ],
        }),
      )
      expect(inv.sections.find((s) => s.key === 'courses')!.rows.map((r) => r.code)).toEqual([
        'IT3',
        'IT10',
        'IT21',
      ])
    })

    it('sorts outcomes by their parsed number, as the Curriculum Report does', () => {
      const inv = buildInventory(
        empty({
          pos: [po({ id: 'b', code: 'PO-10' }), po({ id: 'a', code: 'PO-2' })],
        }),
      )
      expect(inv.sections.find((s) => s.key === 'pos')!.rows.map((r) => r.code)).toEqual([
        'PO-2',
        'PO-10',
      ])
    })

    it('puts learning outcomes in subject order, then code', () => {
      const inv = buildInventory(
        empty({
          clos: [
            clo({ id: '1', code: 'CLO-2', course: 'IT21' }),
            clo({ id: '2', code: 'CLO-1', course: 'IT21' }),
            clo({ id: '3', code: 'CLO-1', course: 'IT13' }),
          ],
        }),
      )
      // IT13 comes before IT21, and within IT21 the outcomes run 1 then 2.
      expect(
        sectionOf(inv, 'clos').rows.map((r) => `${r.parent} ${r.code}`),
      ).toEqual(['IT13 CLO-1', 'IT21 CLO-1', 'IT21 CLO-2'])
    })

    it('does not mutate the arrays it was handed', () => {
      const pos = [po({ id: 'b', code: 'PO-10' }), po({ id: 'a', code: 'PO-2' })]
      const snapshot = pos.map((p) => p.code)
      buildInventory(empty({ pos }))
      expect(pos.map((p) => p.code)).toEqual(snapshot)
    })
  })

  describe('program outcomes', () => {
    it('resolves the CMO label for an admin outcome', () => {
      const inv = buildInventory(
        empty({ pos: [po({ cmo_id: 'm1' })], cmos: [cmo()] }),
      )
      expect(inv.sections.find((s) => s.key === 'pos')!.rows[0].note).toBe(
        'BSIT PROGRAM OUTCOMES (CMO 25 S. 2015)',
      )
    })

    it('labels an unaligned outcome UNCATEGORIZED', () => {
      const inv = buildInventory(empty({ pos: [po()] }))
      expect(inv.sections.find((s) => s.key === 'pos')!.rows[0].note).toBe('UNCATEGORIZED')
    })

    // Manager-authored outcomes store their CMO category in `description`
    // rather than in cmo_id, so the shared cmoLabel rule reads it from there.
    it('reads a manager outcome CMO out of its description field', () => {
      const inv = buildInventory(
        empty({
          pos: [
            po({
              source: 'manager',
              description: 'SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR (CMO 25 S. 2015)',
            }),
          ],
        }),
      )
      const row = inv.sections.find((s) => s.key === 'pos')!.rows[0]
      expect(row.note).toBe('SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR (CMO 25 S. 2015)')
      expect(row.parent).toBe('Manager')
    })

    it('marks an admin outcome as coming from Admin', () => {
      const inv = buildInventory(empty({ pos: [po()] }))
      expect(inv.sections.find((s) => s.key === 'pos')!.rows[0].parent).toBe('Admin')
    })
  })
})

describe('programLabel', () => {
  it('joins code and name when the course carries a resolved program', () => {
    const c = course({ program_id: { id: 'p1', code: 'BSIT', name: 'Information Technology' } })
    expect(programLabel(c, [])).toBe('BSIT — Information Technology')
  })

  // A join returns a bare id when it matched nothing (archived program, or one
  // the caller's role cannot read). Showing the UUID would be worse than
  // showing nothing, but looking it up by id recovers the name.
  it('falls back to a name lookup when program_id is a bare id', () => {
    expect(programLabel(course({ program_id: 'p1' }), [program()])).toBe(
      'Bachelor of Science in Information Technology',
    )
  })

  it('returns empty when the id resolves to nothing', () => {
    expect(programLabel(course({ program_id: 'gone' }), [])).toBe('')
  })
})

// The regression guard for the whole point of rowValues(): sections do not
// share a column layout, so a fixed row shape rendered under a fixed header
// shifts every column after the short one. Programs have no parent, learning
// outcomes no description, courses carry a unit count.
describe('rowValues', () => {
  it('produces exactly one value per declared column, for every section', () => {
    const inv = buildInventory(
      empty({
        programs: [program()],
        courses: [course()],
        pos: [po()],
        peos: [peo()],
        clos: [clo()],
      }),
    )
    for (const section of inv.sections) {
      const values = rowValues(section.key, section.rows[0])
      // Less one for the leading "No." the caller renders.
      expect(values).toHaveLength(SECTION_DEFS[section.key].columns.length - 1)
    }
  })

  it('lands the status in the last column, where the header expects it', () => {
      const inv = buildInventory(empty({ peos: [peo({ status: 'archived' })] }), {
        includeArchived: true,
      })
      const section = sectionOf(inv, 'peos')
      const values = rowValues(section.key, section.rows[0])
      expect(values[values.length - 1]).toBe('archived')
      expect(section.columns[section.columns.length - 1]).toBe('Status')
    })

  it('puts the code first and the name second', () => {
    const inv = buildInventory(empty({ clos: [clo()] }))
    const values = rowValues('clos', inv.sections.find((s) => s.key === 'clos')!.rows[0])
    expect(values[0]).toBe('CLO-1')
    expect(values[1]).toBe('Explain classes and objects')
  })

  it('drops the parent column for programs, which have none', () => {
    const inv = buildInventory(
      empty({ programs: [program({ description: 'The IT program' })] }),
    )
    const section = inv.sections.find((s) => s.key === 'programs')!
    expect(rowValues('programs', section.rows[0])).toEqual([
      'BSIT',
      'Bachelor of Science in Information Technology',
      'The IT program',
      'active',
    ])
  })

  it('keeps the unit count in the courses note column', () => {
    const inv = buildInventory(empty({ courses: [course({ units: 3 })] }))
    const values = rowValues('courses', inv.sections.find((s) => s.key === 'courses')!.rows[0])
    expect(values).toContain(3)
  })
})

// Guards the two lists that must stay in step: SECTION_ORDER drives the page
// and the summary, so a section missing from it would exist in SECTION_DEFS
// and never render anywhere.
describe('section declarations', () => {
  it('orders every declared section exactly once', () => {
    expect([...SECTION_ORDER].sort()).toEqual(Object.keys(SECTION_DEFS).sort())
  })

  it('has no duplicate section keys', () => {
    expect(new Set(SECTION_ORDER).size).toBe(SECTION_ORDER.length)
  })
})
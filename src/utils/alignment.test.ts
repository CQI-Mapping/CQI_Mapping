import { describe, it, expect } from 'vitest'
import {
  alignmentSummary,
  anchorCollisions,
  anchorDepthSlices,
  anchorKey,
  anchorList,
  anchorTallies,
  buildAnchors,
  courseOutcomes,
  courseProgramId,
  coursesInProgram,
  poOutcomes,
  spellingIssues,
} from './alignment'
import type {
  ChedMemoOrder,
  Course,
  CourseLearningOutcomeStandalone,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
  StrategicGoal,
} from '../services/database'

// These fixtures are shaped like the real data, because the real data is the
// problem: the same outcome written "PO-11" and "PO 11", a goal stored as
// "Goal 2:", PEO alignment held as a comma-separated string rather than ids.

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
  created_at: '',
  updated_at: '',
  ...over,
})

const cmo = (over: Partial<ChedMemoOrder> = {}): ChedMemoOrder => ({
  id: 'c-1',
  code: 'CMO 25 s. 2015',
  title: 'CMO 25',
  description: null,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...over,
})

const peo = (over: Partial<ProgramEducationalObjective> = {}): ProgramEducationalObjective => ({
  id: 'e-1',
  code: 'PEO 1',
  title: 'Produce competent graduates',
  description: null,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...over,
})

const goal = (over: Partial<StrategicGoal> = {}): StrategicGoal => ({
  id: 'g-1',
  code: 'Goal 1',
  title: 'Excellence',
  description: null,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...over,
})

const anchors = (over: Partial<Parameters<typeof buildAnchors>[0]> = {}) =>
  buildAnchors({ cmos: [cmo()], peos: [peo()], goals: [goal()], ...over })

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
  created_at: '',
  updated_at: '',
  ...over,
})

const clo = (over: Partial<CourseLearningOutcomeStandalone> = {}): CourseLearningOutcomeStandalone => ({
  id: 'l1',
  code: 'CLO-1',
  course: 'IT21',
  title: 'Explain classes and objects',
  description: null,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...over,
})

describe('anchorKey', () => {
  // The whole module leans on this: "PO 1" and "PO-1" are one outcome, and a
  // goal stored with a stray colon still finds its document.
  it('folds spacing, punctuation and case together', () => {
    expect(anchorKey('PO 1')).toBe(anchorKey('PO-1'))
    expect(anchorKey('Goal 2:')).toBe(anchorKey('Goal 2'))
    expect(anchorKey(' PEO  3 ')).toBe('PEO3')
  })

  it('treats a missing value as empty rather than throwing', () => {
    expect(anchorKey(null)).toBe('')
    expect(anchorKey(undefined)).toBe('')
  })
})

describe('anchorList', () => {
  it('splits a comma-separated alignment list and drops blanks', () => {
    expect(anchorList('PEO 1, PEO 3')).toEqual(['PEO 1', 'PEO 3'])
    expect(anchorList('Goal 1,,Goal 4 ,')).toEqual(['Goal 1', 'Goal 4'])
    expect(anchorList(null)).toEqual([])
  })
})

describe('poOutcomes', () => {
  it('collapses one outcome stored as several alignment rows', () => {
    const outcomes = poOutcomes(
      [po({ code: 'PO-11' }), po({ id: 'o2', code: 'PO 11', cmo_id: 'c-1' })],
      anchors(),
    )
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].rowCount).toBe(2)
    expect(outcomes[0].spellings).toEqual(['PO 11', 'PO-11'])
  })

  it('reports the CMO alignment held by any of an outcome’s rows', () => {
    const outcomes = poOutcomes(
      [po({ code: 'PO-1' }), po({ id: 'o2', code: 'PO 1', cmo_id: 'c-1' })],
      anchors(),
    )
    expect(outcomes[0].cmo).toEqual(['CMO 25 s. 2015'])
  })

  it('reads PEO and goal alignment out of the free-text lists', () => {
    const outcomes = poOutcomes(
      [
        po({ peo_text: 'PEO 1, PEO 3', sg_text: 'Goal 1, Goal 4' }),
        po({ id: 'o2', code: 'PO-2', sg_text: 'Goal 2:' }),
      ],
      anchors({
        peos: [peo(), peo({ id: 'e-3', code: 'PEO 3' })],
        goals: [goal(), goal({ id: 'g-2', code: 'Goal 2' }), goal({ id: 'g-4', code: 'Goal 4' })],
      }),
    )
    expect(outcomes[0].peo).toEqual(['PEO 1', 'PEO 3'])
    expect(outcomes[0].sg).toEqual(['Goal 1', 'Goal 4'])
    // "Goal 2:" has to find "Goal 2".
    expect(outcomes[1].sg).toEqual(['Goal 2'])
  })

  it('ignores alignment text naming a document that does not exist', () => {
    // Counting an alignment to a document with no record would put a fictional
    // row in a report meant to be evidence.
    const outcomes = poOutcomes([po({ peo_text: 'PEO 99' })], anchors())
    expect(outcomes[0].peo).toEqual([])
    expect(alignmentSummary(outcomes).aligned).toBe(0)
  })

  it('picks the most-written spelling for display, breaking ties alphabetically', () => {
    const outcomes = poOutcomes(
      [
        po({ code: 'PO-1' }),
        po({ id: 'o2', code: 'PO 1' }),
        po({ id: 'o3', code: 'PO 1 ' }),
      ],
      anchors(),
    )
    expect(outcomes[0].code).toBe('PO 1')
  })

  it('skips a row with no code at all rather than grouping them together', () => {
    const outcomes = poOutcomes([po({ code: '' }), po({ code: '   ' }), po()], anchors())
    expect(outcomes).toHaveLength(1)
  })

  it('handles an empty outcome list without throwing', () => {
    expect(poOutcomes([], anchors())).toEqual([])
  })
})

describe('alignmentSummary', () => {
  it('counts an outcome aligned to anything as anchored', () => {
    const outcomes = poOutcomes(
      [po({ cmo_id: 'c-1' }), po({ id: 'o2', code: 'PO-2', sg_text: 'Goal 1' }), po({ id: 'o3', code: 'PO-3' })],
      anchors(),
    )
    expect(alignmentSummary(outcomes)).toMatchObject({
      outcomes: 3,
      aligned: 2,
      unaligned: 1,
      percent: 67,
      withCmo: 1,
      withPeo: 0,
      withGoal: 1,
    })
  })

  it('is zero rather than NaN with no outcomes', () => {
    expect(alignmentSummary([])).toMatchObject({
      outcomes: 0,
      aligned: 0,
      unaligned: 0,
      percent: 0,
    })
  })
})

describe('anchorTallies', () => {
  it('counts an outcome under every document it reaches', () => {
    const outcomes = poOutcomes(
      [
        po({ cmo_id: 'c-1', peo_text: 'PEO 1' }),
        po({ id: 'o2', code: 'PO-2', cmo_id: 'c-1' }),
        po({ id: 'o3', code: 'PO-3' }),
      ],
      anchors(),
    )
    const tallies = anchorTallies(outcomes, anchors())
    expect(tallies.find((t) => t.anchor.code === 'CMO 25 s. 2015')?.count).toBe(2)
    expect(tallies.find((t) => t.anchor.family === 'peo')?.count).toBe(1)
  })

  // The bars deliberately do not sum to 100, and a reader who assumes they do
  // will misread the chart -- so the shape of it is pinned here.
  it('double-counts an outcome aligned to two documents, so bars exceed the aligned share', () => {
    const outcomes = poOutcomes(
      [po({ cmo_id: 'c-1', peo_text: 'PEO 1' }), po({ id: 'o2', code: 'PO-2' })],
      anchors(),
    )
    const tallies = anchorTallies(outcomes, anchors())
    const share = alignmentSummary(outcomes).percent
    expect(share).toBe(50)
    expect(tallies.find((t) => t.anchor.family === 'cmo')?.count).toBe(1)
    expect(tallies.find((t) => t.anchor.family === 'peo')?.count).toBe(1)
    // 50% + 50% of a 50%-aligned report: the sum is not a share of anything.
    expect(tallies.reduce((n, t) => n + t.percent, 0)).toBeGreaterThan(share)
  })

  it('keeps a document nothing reaches, at zero', () => {
    const tallies = anchorTallies(poOutcomes([po({ cmo_id: 'c-1' })], anchors()), anchors())
    const goalTally = tallies.find((t) => t.anchor.family === 'sg')!
    expect(goalTally.count).toBe(0)
    expect(goalTally.percent).toBe(0)
  })
})

describe('buildAnchors', () => {
  // Two memo rows share the code "CMO 25 s. 2015". Left in, they become two
  // identical bars both counting the same outcomes -- which reads as "twice as
  // many outcomes" when it is one code entered twice.
  it('collapses two records that share one code', () => {
    const list = anchors({ cmos: [cmo(), cmo({ id: 'c-2' })] })
    expect(list.filter((a) => a.family === 'cmo')).toHaveLength(1)
  })

  it('collapses a code written two ways', () => {
    const list = anchors({ cmos: [cmo(), cmo({ id: 'c-2', code: 'CMO-25 s. 2015' })] })
    expect(list.filter((a) => a.family === 'cmo')).toHaveLength(1)
  })

  it('keeps a memo and a PEO that share a code as two documents', () => {
    const list = anchors({ cmos: [cmo()], peos: [peo({ code: 'CMO 25 s. 2015' })] })
    expect(list.filter((a) => a.family === 'cmo')).toHaveLength(1)
    expect(list.filter((a) => a.family === 'peo')).toHaveLength(1)
  })
})

describe('anchorCollisions', () => {
  it('names a document code held by more than one record', () => {
    expect(
      anchorCollisions({ cmos: [cmo(), cmo({ id: 'c-2' })], peos: [peo()], goals: [goal()] }),
    ).toEqual([{ family: 'cmo', code: 'CMO 25 s. 2015', count: 2 }])
  })

  it('reports each duplicated code once, not once per record', () => {
    const out = anchorCollisions({
      cmos: [cmo(), cmo({ id: 'c-2' }), cmo({ id: 'c-3' })],
      peos: [],
      goals: [],
    })
    expect(out).toEqual([{ family: 'cmo', code: 'CMO 25 s. 2015', count: 3 }])
  })

  it('does not confuse a memo and a PEO that happen to share a code', () => {
    const out = anchorCollisions({
      cmos: [cmo(), cmo({ id: 'c-2' })],
      peos: [peo({ code: 'CMO 25 s. 2015' })],
      goals: [],
    })
    expect(out).toHaveLength(1)
    expect(out[0].family).toBe('cmo')
  })

  it('says nothing when every document has its own code', () => {
    expect(anchorCollisions({ cmos: [cmo()], peos: [peo()], goals: [goal()] })).toEqual([])
  })
})

describe('anchorDepthSlices', () => {
  const sliceOf = (rows: Parameters<typeof poOutcomes>[0]) => {
    const byKey = Object.fromEntries(
      anchorDepthSlices(poOutcomes(rows, anchors())).map((s) => [s.key, s]),
    )
    return byKey
  }

  it('puts an outcome in exactly one bucket, so the slices account for every outcome', () => {
    const slices = anchorDepthSlices(
      poOutcomes(
        [
          po({ cmo_id: 'c-1' }),
          po({ id: 'o2', code: 'PO-2', cmo_id: 'c-1', peo_text: 'PEO 1' }),
          po({ id: 'o3', code: 'PO-3' }),
        ],
        anchors(),
      ),
    )
    expect(slices.reduce((n, s) => n + s.count, 0)).toBe(3)
    // The counts are what the arc is drawn from, and they must total the whole.
    // The percentages are rounded per slice for the legend, so three thirds
    // read 33 + 33 + 33 -- the legend is a label, not an accounting.
    expect(slices.map((s) => s.percent)).toEqual([33, 33, 33])
  })

  it('separates a CMO-only outcome from one that also reaches a PEO', () => {
    const byKey = sliceOf([
      po({ cmo_id: 'c-1' }),
      po({ id: 'o2', code: 'PO-2', cmo_id: 'c-1', peo_text: 'PEO 1' }),
    ])
    expect(byKey.cmo.count).toBe(1)
    expect(byKey['cmo-peo'].count).toBe(1)
  })

  it('separates the fully anchored outcome from the rest', () => {
    const byKey = sliceOf([
      po({ cmo_id: 'c-1', peo_text: 'PEO 1', sg_text: 'Goal 1' }),
      po({ id: 'o2', code: 'PO-2' }),
    ])
    expect(byKey['cmo-peo-goal'].count).toBe(1)
    expect(byKey.none.count).toBe(1)
  })

  it('puts the unaligned slice last, beside the list naming them', () => {
    const slices = anchorDepthSlices(
      poOutcomes([po({ cmo_id: 'c-1' }), po({ id: 'o2', code: 'PO-2' })], anchors()),
    )
    expect(slices.map((s) => s.key)).toEqual(['cmo', 'none'])
    expect(slices[slices.length - 1].key).toBe('none')
  })

  // Reachable only with odd data -- a goal with no CMO, say. Kept so the slices
  // account for every outcome instead of silently dropping the ones the ladder
  // does not describe.
  it('does not drop an outcome the ladder cannot place', () => {
    const byKey = sliceOf([po({ sg_text: 'Goal 1' })])
    expect(byKey.other.count).toBe(1)
  })

  it('omits a bucket nothing lands in, and copes with no outcomes at all', () => {
    const slices = anchorDepthSlices(poOutcomes([po({ cmo_id: 'c-1' })], anchors()))
    expect(slices.map((s) => s.key)).toEqual(['cmo'])
    expect(anchorDepthSlices([])).toEqual([])
  })
})

describe('courseOutcomes', () => {
  it('matches a learning outcome to its course by code', () => {
    const rows = courseOutcomes([course()], [clo()])
    expect(rows[0].outcomeCount).toBe(1)
  })

  it('folds the sloppy spellings the schema allows', () => {
    const rows = courseOutcomes([course()], [clo({ course: 'IT-21' }), clo({ id: 'l2', course: 'it 21' })])
    expect(rows[0].outcomeCount).toBe(2)
  })

  it('reports 0 for a course with nothing, and names no match', () => {
    const rows = courseOutcomes([course()], [])
    expect(rows[0].outcomeCount).toBe(0)
    expect(rows[0].matched).toEqual([])
  })

  it('keeps the raw text so a loose match can be spotted', () => {
    const rows = courseOutcomes([course()], [clo({ course: 'IT 21 - OOP' })])
    expect(rows[0].outcomeCount).toBe(1)
    expect(rows[0].matched).toEqual(['IT 21 - OOP'])
  })
})

describe('courseProgramId', () => {
  // The bug this exists to prevent: fetchCourses() expands the relation, so
  // program_id arrives as { id, code, name } and a === comparison against the
  // program id matches nothing. The report showed 0 of 33 courses.
  it('reads the id out of an expanded relation', () => {
    const joined = course({ program_id: { id: 'p1', code: 'BSIT', name: 'Informatics' } })
    expect(courseProgramId(joined)).toBe('p1')
  })

  it('passes a bare uuid straight through', () => {
    expect(courseProgramId(course({ program_id: 'p1' }))).toBe('p1')
  })

  it('yields an empty id rather than undefined, so a comparison is always a string one', () => {
    expect(courseProgramId(course({ program_id: null as never }))).toBe('')
  })
})

describe('coursesInProgram', () => {
  it('finds courses whether the relation was expanded or not', () => {
    const courses = [
      course({ id: 'c1', code: 'IT21' }),
      course({ id: 'c2', code: 'CS11', program_id: { id: 'p2', code: 'BSCS', name: 'Computing' } }),
      course({ id: 'c3', code: 'IT13', program_id: 'p1' }),
    ]
    expect(coursesInProgram(courses, 'p1').map((c) => c.code)).toEqual(['IT13', 'IT21'])
  })

  it('sorts by parsed number, so IT2 precedes IT10', () => {
    const courses = [
      course({ id: 'a', code: 'IT10' }),
      course({ id: 'b', code: 'IT2' }),
    ]
    expect(coursesInProgram(courses, 'p1').map((c) => c.code)).toEqual(['IT2', 'IT10'])
  })
})


describe('spellingIssues', () => {
  it('lists outcomes whose code is written more than one way, worst first', () => {
    const outcomes = poOutcomes(
      [
        po({ code: 'PO-11' }),
        po({ id: 'o2', code: 'PO 11' }),
        po({ id: 'o3', code: 'PO-3' }),
        po({ id: 'o4', code: 'PO 3' }),
        po({ id: 'o5', code: 'PO 3 ' }),
        po({ id: 'o6', code: 'PO-9' }),
      ],
      anchors(),
    )
    const issues = spellingIssues(outcomes)
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ rows: 3, spellings: expect.any(Array) })
    expect(issues[1].rows).toBe(2)
  })

  it('says nothing when every code is written one way', () => {
    expect(spellingIssues(poOutcomes([po(), po({ id: 'o2', code: 'PO-2' })], anchors()))).toEqual([])
  })
})

// Outcome alignment: what each program outcome is anchored to.
//
// This replaces the coverage rules that read clo_po_matrix, program_outcomes
// and course_learning_outcomes. Those three tables are empty and nothing in the
// app writes to them, so a report built on them reads zero against a system
// that holds 33 courses, 44 program outcome rows and 3 CHED memoranda. The data
// that is actually entered lives in the standalone admin tables, and this is
// the shape of it:
//
//   - A program outcome is one CODE, but it is stored as a row per alignment.
//     "PO-11" and "PO 11" are the same outcome written two ways: 44 rows are 27
//     outcomes, and counting rows would overstate the curriculum by 63%. So
//     outcomes are grouped by a punctuation-insensitive key, and the spelling
//     variants are kept because the disagreement is itself a finding.
//
//   - CMO alignment is a foreign key (cmo_id) and is trustworthy.
//
//   - PEO and Strategic Goal alignment is NOT a foreign key. It is free text in
//     peo_text / sg_text holding a comma-separated list -- "PEO 1, PEO 3",
//     "Goal 1, Goal 4" -- with no ids at all. It has to be parsed, and one goal
//     is stored as "Goal 2:" with a stray colon that must still match "Goal 2".
//
// Pure, like reports.ts: plain arrays in, plain objects out, so the rules are
// testable without a database.

import type {
  Course,
  CourseLearningOutcomeStandalone,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
  StrategicGoal,
  ChedMemoOrder,
} from '../services/database'
import { cloMatchesSubject, normalizeCode } from './courseCodes'

/**
 * The program a course belongs to, as an id.
 *
 * fetchCourses() selects `program_id ( id, code, name )`, so Supabase hands back
 * the joined row and `course.program_id` is an OBJECT, not a uuid -- which the
 * Course type admits by declaring it `string | { id, code, name }`. Comparing
 * that object to a program id with `===` silently matches nothing: the report
 * showed zero courses against a database holding 33, with no error anywhere to
 * explain it. Both shapes are accepted here so the caller never has to know
 * which one the select returned.
 */
export function courseProgramId(course: Course): string {
  const p = course.program_id
  return typeof p === 'string' ? p : (p?.id ?? '')
}

/** Courses of one program, in code order. */
export function coursesInProgram(courses: Course[], programId: string): Course[] {
  return courses
    .filter((c) => courseProgramId(c) === programId)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

/** The three things a program outcome is aligned to. */
export type AnchorFamily = 'cmo' | 'peo' | 'sg'

export const FAMILY_LABELS: Record<AnchorFamily, string> = {
  cmo: 'CMO',
  peo: 'PEO',
  sg: 'Strategic Goal',
}

/**
 * Comparison key for a code or an anchor name.
 *
 * Stricter than courseCodes.normalizeCode on purpose: it drops every
 * non-alphanumeric character, which is what makes "Goal 2:" find "Goal 2" and
 * "PO 1" find "PO-1". Applied to anchors and to stored alignment text only --
 * course codes keep normalizeCode's narrower rule, because loosening a helper
 * the Subject Graph and the Curriculum Report also use would change what
 * subjects those pages think a learning outcome belongs to.
 */
export const anchorKey = (s: string | null | undefined) =>
  (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** "PEO 1, PEO 3" -> ["PEO 1", "PEO 3"]. Blank entries dropped. */
export function anchorList(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** One institutional document an outcome can be aligned to. */
export interface Anchor {
  family: AnchorFamily
  id: string
  code: string
  title: string | null
}

/**
 * The three anchor lists, in the order the report reads them.
 *
 * Deduplicated by family and code. The memo table holds two rows both coded
 * "CMO 25 s. 2015" -- different documents to the database, since outcomes align
 * to one id or the other, but the chart and the matrix can only label a column
 * by its code. Left in, they render as two identical bars both counting the
 * same outcomes, which reads as "twice as many outcomes" when it is one code
 * entered twice. anchorCollisions() is what reports them.
 */
export function buildAnchors(input: {
  cmos: ChedMemoOrder[]
  peos: ProgramEducationalObjective[]
  goals: StrategicGoal[]
}): Anchor[] {
  const all = [
    ...input.cmos.map((a) => ({ family: 'cmo' as const, id: a.id, code: a.code, title: a.title })),
    ...input.peos.map((a) => ({ family: 'peo' as const, id: a.id, code: a.code, title: a.title })),
    ...input.goals.map((a) => ({ family: 'sg' as const, id: a.id, code: a.code, title: a.title })),
  ]
  const seen = new Set<string>()
  return all.filter((a) => {
    const key = `${a.family}:${anchorKey(a.code)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * A document code held by more than one record, read off the raw lists before
 * buildAnchors() collapsed them.
 */
export interface AnchorCollision {
  family: AnchorFamily
  code: string
  /** Distinct document records sharing this code. */
  count: number
}

export function anchorCollisions(input: {
  cmos: ChedMemoOrder[]
  peos: ProgramEducationalObjective[]
  goals: StrategicGoal[]
}): AnchorCollision[] {
  const groups = new Map<string, { family: AnchorFamily; code: string; ids: Set<string> }>()
  const add = (family: AnchorFamily, id: string, code: string) => {
    const key = `${family}:${anchorKey(code)}`
    const g = groups.get(key) ?? { family, code, ids: new Set<string>() }
    g.ids.add(id)
    groups.set(key, g)
  }
  for (const a of input.cmos) add('cmo', a.id, a.code)
  for (const a of input.peos) add('peo', a.id, a.code)
  for (const a of input.goals) add('sg', a.id, a.code)

  return [...groups.values()]
    .filter((g) => g.ids.size > 1)
    .map((g) => ({ family: g.family, code: g.code, count: g.ids.size }))
}

/**
 * Every program outcome, collapsed from its alignment rows.
 *
 * `spellings` holds each way the code has been written, deduplicated and
 * sorted, so "PO-11"/"PO 11" reads as one outcome with a spelling note rather
 * than as two outcomes. `code` is the most frequently written spelling, with
 * ties broken alphabetically so the report shows the same label on every load.
 */
export interface PoOutcome {
  key: string
  code: string
  spellings: string[]
  title: string
  status: string
  /** Alignment rows that collapsed into this one outcome. */
  rowCount: number
  /** Anchor codes, per family, deduplicated and sorted. */
  cmo: string[]
  peo: string[]
  sg: string[]
}

const anchorsFor = (
  family: AnchorFamily,
  raw: string | null | undefined,
  anchors: Anchor[],
): string[] => {
  const byCode = new Map(
    anchors.filter((a) => a.family === family).map((a) => [anchorKey(a.code), a.code]),
  )
  const out = new Set<string>()
  for (const token of anchorList(raw)) {
    const match = byCode.get(anchorKey(token))
    if (match) out.add(match)
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/**
 * Collapse program outcome rows into outcomes.
 *
 * CMO alignment comes from the id, which is a real foreign key; PEO and goal
 * alignment comes from parsing the comma-separated text, because there is no id
 * to join on. A text token that names no known document is dropped rather than
 * shown: an alignment to a document that does not exist cannot be counted, and
 * inventing it would put a fictional row in a report meant to be evidence.
 */
export function poOutcomes(
  rows: ProgramOutcomeStandalone[],
  anchors: Anchor[],
): PoOutcome[] {
  const groups = new Map<string, { spellings: Set<string>; rows: ProgramOutcomeStandalone[] }>()

  for (const row of rows) {
    const key = anchorKey(row.code)
    if (!key) continue
    const group = groups.get(key) ?? { spellings: new Set<string>(), rows: [] }
    group.spellings.add((row.code || '').trim())
    group.rows.push(row)
    groups.set(key, group)
  }

  return [...groups.entries()].map(([key, group]) => {
    const spellings = [...group.spellings].sort((a, b) => a.localeCompare(b))
    const counts = new Map<string, number>()
    for (const s of spellings) counts.set(s, (counts.get(s) ?? 0) + 1)
    // Most-written spelling wins; alphabetical tie-break keeps it stable.
    const code = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0]

    // An outcome aligned to several documents stores several rows; the union is
    // what "this outcome is aligned to" means.
    const cmo = new Set<string>()
    const byCmoId = new Map(anchors.filter((a) => a.family === 'cmo').map((a) => [a.id, a.code]))
    for (const row of group.rows) {
      if (row.cmo_id && byCmoId.has(row.cmo_id)) cmo.add(byCmoId.get(row.cmo_id)!)
      for (const token of anchorList(row.cmo_text)) {
        const match = anchors.find(
          (a) => a.family === 'cmo' && anchorKey(a.code) === anchorKey(token),
        )
        if (match) cmo.add(match.code)
      }
    }

    const peo = new Set<string>()
    const sg = new Set<string>()
    for (const row of group.rows) {
      for (const token of anchorList(row.peo_text)) {
        const match = anchors.find((a) => a.family === 'peo' && anchorKey(a.code) === anchorKey(token))
        if (match) peo.add(match.code)
      }
      for (const token of anchorList(row.sg_text)) {
        const match = anchors.find((a) => a.family === 'sg' && anchorKey(a.code) === anchorKey(token))
        if (match) sg.add(match.code)
      }
    }

    const title =
      group.rows.find((r) => (r.title || '').trim())?.title.trim() ??
      (group.rows[0]?.title || '').trim()

    return {
      key,
      code,
      spellings,
      title: title || '—',
      status: group.rows.some((r) => r.status === 'active') ? 'active' : 'archived',
      rowCount: group.rows.length,
      cmo: [...cmo].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      peo: [...peo].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      sg: [...sg].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }
  })
}

/** One slice of the alignment pie: how completely an outcome is anchored. */
export interface AnchorSlice {
  key: string
  label: string
  count: number
  percent: number
}

/**
 * Group outcomes by how far they are anchored, for the pie.
 *
 * The buckets are cumulative rather than per-family, because that is the
 * question a reader actually has: is this outcome tied to nothing, to a CMO
 * alone, or all the way up the chain? Counting per family instead would put one
 * outcome in three slices and make the pie lie about its own total.
 *
 * Ordered by depth, most anchored first, so the ring reads as a taper and the
 * unaligned tail is the last slice -- sitting next to the list of which
 * outcomes it contains.
 */
export function anchorDepthSlices(outcomes: PoOutcome[]): AnchorSlice[] {
  const buckets = [
    {
      key: 'cmo-peo-goal',
      label: 'CMO + PEO + goal',
      test: (o: PoOutcome) => o.cmo.length > 0 && o.peo.length > 0 && o.sg.length > 0,
    },
    {
      key: 'cmo-peo',
      label: 'CMO + PEO',
      test: (o: PoOutcome) => o.cmo.length > 0 && o.peo.length > 0 && o.sg.length === 0,
    },
    {
      key: 'cmo',
      label: 'CMO only',
      test: (o: PoOutcome) => o.cmo.length > 0 && o.peo.length === 0 && o.sg.length === 0,
    },
    {
      key: 'other',
      // Anchored, but with no CMO -- a goal or PEO reached without the
      // memorandum, which is odd data rather than a normal state. The three
      // buckets above already cover every outcome that HAS a CMO, so this is
      // the remainder and cannot overlap them. Without it the slices would stop
      // totalling the whole and the pie would be quietly wrong.
      label: 'Partly anchored',
      test: (o: PoOutcome) => o.cmo.length === 0 && o.peo.length + o.sg.length > 0,
    },
    {
      key: 'none',
      label: 'Anchored to nothing',
      test: (o: PoOutcome) => o.cmo.length + o.peo.length + o.sg.length === 0,
    },
  ]

  const total = outcomes.length
  return buckets
    .map((b) => {
      const count = outcomes.filter(b.test).length
      return {
        key: b.key,
        label: b.label,
        count,
        percent: total === 0 ? 0 : Math.round((count / total) * 100),
      }
    })
    .filter((s) => s.count > 0)
}

/** How many of the program's outcomes reach at least one institutional anchor. */
export interface AlignmentSummary {
  outcomes: number
  aligned: number
  unaligned: number
  percent: number
  withCmo: number
  withPeo: number
  withGoal: number
}

export function alignmentSummary(outcomes: PoOutcome[]): AlignmentSummary {
  const alignedOf = (o: PoOutcome) => o.cmo.length + o.peo.length + o.sg.length > 0
  const aligned = outcomes.filter(alignedOf).length
  return {
    outcomes: outcomes.length,
    aligned,
    unaligned: outcomes.length - aligned,
    percent: outcomes.length === 0 ? 0 : Math.round((aligned / outcomes.length) * 100),
    withCmo: outcomes.filter((o) => o.cmo.length > 0).length,
    withPeo: outcomes.filter((o) => o.peo.length > 0).length,
    withGoal: outcomes.filter((o) => o.sg.length > 0).length,
  }
}

/** One bar of the anchor chart: how many outcomes reach this document. */
export interface AnchorTally {
  anchor: Anchor
  count: number
  /** Share of all outcomes. The bars need not sum to 100 — an outcome can be
   *  aligned to several documents, and that is the point of the chart. */
  percent: number
}

export function anchorTallies(outcomes: PoOutcome[], anchors: Anchor[]): AnchorTally[] {
  const field = { cmo: 'cmo', peo: 'peo', sg: 'sg' } as const
  const total = outcomes.length
  return anchors.map((anchor) => {
    const list = outcomes.filter((o) => o[field[anchor.family]].includes(anchor.code))
    return {
      anchor,
      count: list.length,
      percent: total === 0 ? 0 : Math.round((list.length / total) * 100),
    }
  })
}

/** One course of the program, with how many learning outcomes it carries. */
export interface CourseOutcomes {
  course: Course
  outcomeCount: number
  /** The raw `course` text on each matched outcome, when they disagree. */
  matched: string[]
}

export function courseOutcomes(
  courses: Course[],
  clos: CourseLearningOutcomeStandalone[],
): CourseOutcomes[] {
  return courses.map((course) => {
    const key = normalizeCode(course.code)
    const matched = clos.filter((c) => cloMatchesSubject(c.course, key))
    return { course, outcomeCount: matched.length, matched: matched.map((c) => c.course.trim()) }
  })
}

/** An outcome whose code has been written more than one way. */
export interface SpellingIssue {
  code: string
  spellings: string[]
  /** Alignment rows collapsed into this one outcome. */
  rows: number
}

export function spellingIssues(outcomes: PoOutcome[]): SpellingIssue[] {
  return outcomes
    .filter((o) => o.spellings.length > 1)
    .map((o) => ({ code: o.code, spellings: o.spellings, rows: o.rowCount }))
    .sort((a, b) => b.rows - a.rows || a.code.localeCompare(b.code))
}

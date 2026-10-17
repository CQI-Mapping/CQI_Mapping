// Coverage: how completely a program's curriculum is mapped.
//
// The record inventory (utils/reports.ts) answers "what exists". This answers
// the audit question behind the Overall Report: of the learning outcomes a
// program actually has, how many reach a Program Outcome, per course, per
// outcome, and where the holes are.
//
// Sources are the three matrix-side tables -- course_learning_outcomes (one
// row per CLO, with a real course_id), program_outcomes (one row per PO, with
// a real program_id) and clo_po_matrix (clo_id, po_id, level 1-3). The admin
// standalone lists are deliberately NOT read here: their `course` field is
// free text, and a coverage claim should rest on foreign keys, not on
// string-matching.
//
// Pure on purpose, same as reports.ts: plain arrays in, plain objects out, no
// React and no Supabase, so the tests can hold the rules without a database.

import type {
  CloPoMappingEntry,
  Course,
  CourseLearningOutcome,
  ProgramOutcome,
} from '../services/database'
import { poNumber } from './report'

/** Mapping depth, straight from clo_po_matrix.level. */
export type MappingLevel = 1 | 2 | 3

/**
 * One-letter cell codes, the convention curriculum-mapping papers use: an
 * outcome is Introduced, Developed or Mastered by a learning outcome. Level 1
 * is the shallowest, so 1=I up to 3=M.
 */
export const LEVEL_LETTERS: Record<MappingLevel, string> = { 1: 'I', 2: 'D', 3: 'M' }

/** Words behind the letters, in legend order (deepest first). */
export const LEVEL_LEGEND: { letter: string; word: string }[] = [
  { letter: 'M', word: 'Mastered' },
  { letter: 'D', word: 'Developed' },
  { letter: 'I', word: 'Introduced' },
]

const isLevel = (v: number): v is MappingLevel => v >= 1 && v <= 3

/** One course of the selected program, with how well its CLOs are mapped. */
export interface CourseMapping {
  course: Course
  cloCount: number
  /** CLOs of this course that have at least one PO mapping. */
  mappedCloCount: number
  /**
   * A course is Mapped when every CLO it has reaches a PO, Partially Mapped
   * when some do, and Unmapped when none do. A course with no CLOs at all is
   * "none" — there is nothing to map, which is a different fact from having
   * CLOs and leaving them unmapped.
   */
  status: 'mapped' | 'partial' | 'unmapped' | 'none'
}

/** Every CLO of the program that reaches no PO at all. */
export interface MappingGap {
  clo: CourseLearningOutcome
  courseCode: string
}

/** How completely the program's CLOs map to POs, as one rollup. */
export interface CoverageSummary {
  totalClos: number
  /** CLOs with at least one mapping. */
  mappedClos: number
  coveragePercent: number
  unmappedClos: number
}

/** Share of the program's CLOs that reach one specific PO. */
export interface PoCoverage {
  po: ProgramOutcome
  mappedCloCount: number
  percent: number
}

const text = (v: string | null | undefined) => (v || '').trim()
const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Courses of one program, in code order. */
export function programCourses(courses: Course[], programId: string): Course[] {
  return courses
    .filter((c) => c.program_id === programId)
    .sort((a, b) => byText(a.code, b.code))
}

/** CLOs belonging to one program, via their course's program. */
export function programClos(
  courses: Course[],
  clos: CourseLearningOutcome[],
  programId: string,
): CourseLearningOutcome[] {
  const ids = new Set(courses.filter((c) => c.program_id === programId).map((c) => c.id))
  return clos
    .filter((c) => ids.has(c.course_id))
    .sort((a, b) => byText(a.code, b.code))
}

/**
 * Matrix rows that belong to one program: both endpoints must be the
 * program's. The nested select on CloPoMappingEntry carries the program and
 * course ids, so no join is needed here -- but a stale row whose CLO was
 * deleted out from under the matrix cannot happen either, the FK cascade
 * guarantees it.
 */
export function programMappings(
  clos: CourseLearningOutcome[],
  matrix: CloPoMappingEntry[],
  programId: string,
): CloPoMappingEntry[] {
  const cloIds = new Set(clos.map((c) => c.id))
  return matrix.filter((m) => cloIds.has(m.clo_id.id) && m.po_id.program_id === programId)
}

/** Mapped CLO id set from the matrix rows. */
const mappedCloIds = (rows: CloPoMappingEntry[]) => new Set(rows.map((m) => m.clo_id.id))

export function coverageSummary(
  clos: CourseLearningOutcome[],
  rows: CloPoMappingEntry[],
): CoverageSummary {
  const mapped = mappedCloIds(rows)
  const mappedClos = clos.filter((c) => mapped.has(c.id)).length
  return {
    totalClos: clos.length,
    mappedClos,
    coveragePercent: clos.length === 0 ? 0 : Math.round((mappedClos / clos.length) * 100),
    unmappedClos: clos.length - mappedClos,
  }
}

export function courseCoverage(
  courses: Course[],
  clos: CourseLearningOutcome[],
  rows: CloPoMappingEntry[],
): CourseMapping[] {
  const mapped = mappedCloIds(rows)
  const byCourse = new Map<string, CourseLearningOutcome[]>()
  for (const clo of clos) {
    const list = byCourse.get(clo.course_id) ?? []
    list.push(clo)
    byCourse.set(clo.course_id, list)
  }

  return courses.map((course) => {
    const courseClos = byCourse.get(course.id) ?? []
    const mappedClos = courseClos.filter((c) => mapped.has(c.id)).length
    const status: CourseMapping['status'] =
      courseClos.length === 0
        ? 'none'
        : mappedClos === 0
          ? 'unmapped'
          : mappedClos < courseClos.length
            ? 'partial'
            : 'mapped'
    return { course, cloCount: courseClos.length, mappedCloCount: mappedClos, status }
  })
}

export function mappingGaps(
  clos: CourseLearningOutcome[],
  rows: CloPoMappingEntry[],
  courses: Course[],
): MappingGap[] {
  const mapped = mappedCloIds(rows)
  const codeOf = new Map(courses.map((c) => [c.id, text(c.code)]))
  return clos
    .filter((c) => !mapped.has(c.id))
    .map((clo) => ({ clo, courseCode: codeOf.get(clo.course_id) ?? '' }))
}

/**
 * Coverage per PO: what share of the program's CLOs reach it.
 *
 * POs sort by their parsed number (PO-2 before PO-10), the order the Curriculum
 * Report uses. A PO nothing maps to is kept at 0% rather than dropped -- the
 * hole in the bars is the finding.
 */
export function poCoverage(
  pos: ProgramOutcome[],
  clos: CourseLearningOutcome[],
  rows: CloPoMappingEntry[],
): PoCoverage[] {
  const sorted = [...pos].sort((a, b) => poNumber(a.code) - poNumber(b.code) || byText(a.code, b.code))
  if (clos.length === 0) return sorted.map((po) => ({ po, mappedCloCount: 0, percent: 0 }))

  const perPo = new Map<string, Set<string>>()
  for (const m of rows) {
    const set = perPo.get(m.po_id.id) ?? new Set<string>()
    set.add(m.clo_id.id)
    perPo.set(m.po_id.id, set)
  }

  return sorted.map((po) => {
    const mappedCloCount = perPo.get(po.id)?.size ?? 0
    return {
      po,
      mappedCloCount,
      percent: Math.round((mappedCloCount / clos.length) * 100),
    }
  })
}

/** One matrix row: a CLO and what level it reaches each PO at, if any. */
export interface MatrixRow {
  clo: CourseLearningOutcome
  courseCode: string
  /** Level per PO, aligned with `pos`; null where nothing maps. */
  levels: (MappingLevel | null)[]
}

/**
 * The CLO-to-PO grid, rows = the program's CLOs, columns = its POs.
 *
 * Rows are built from the CLO list, not from the matrix, so an entirely
 * unmapped CLO still gets a row of dashes -- a matrix that only showed mapped
 * rows would hide exactly what it exists to expose. Rows sort by course code
 * then CLO code, reading like the syllabus.
 */
export function alignmentMatrix(
  clos: CourseLearningOutcome[],
  pos: ProgramOutcome[],
  rows: CloPoMappingEntry[],
  courses: Course[],
): MatrixRow[] {
  const codeOf = new Map(courses.map((c) => [c.id, text(c.code)]))
  const sortedPos = [...pos].sort(
    (a, b) => poNumber(a.code) - poNumber(b.code) || byText(a.code, b.code),
  )
  const byClo = new Map<string, Map<string, number>>()
  for (const m of rows) {
    const cell = byClo.get(m.clo_id.id) ?? new Map<string, number>()
    const current = cell.get(m.po_id.id)
    // Deepest wins if a client sends the same cell twice. The table is UNIQUE
    // (clo_id, po_id), so the database will not hand back a pair of them, but
    // collapsing to the deeper reading is the sane failure: an outcome that
    // any record calls Mastered is not Introduced.
    if (current === undefined || m.level > current) cell.set(m.po_id.id, m.level)
    byClo.set(m.clo_id.id, cell)
  }

  return [...clos]
    .sort(
      (a, b) =>
        byText(codeOf.get(a.course_id) ?? '', codeOf.get(b.course_id) ?? '') ||
        byText(a.code, b.code),
    )
    .map((clo) => ({
      clo,
      courseCode: codeOf.get(clo.course_id) ?? '',
      levels: sortedPos.map((po) => {
        const level = byClo.get(clo.id)?.get(po.id)
        return typeof level === 'number' && isLevel(level) ? (level as MappingLevel) : null
      }),
    }))
}

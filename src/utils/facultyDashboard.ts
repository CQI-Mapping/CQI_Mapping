// The rules behind the faculty home (pages/user/Dashboard.tsx): which subjects
// a faculty member has written for, the figures for their own outcomes, and
// the next step the hero card names. Pure functions over the rows the page
// loads, so the page only lays them out and the rules stay under test.
import type { Course, CourseLearningOutcomeStandalone } from '../services/database'
import { normalizeCode } from './courseCodes'

type Outcome = CourseLearningOutcomeStandalone

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const updatedAt = (l: Outcome) => +new Date(l.updated_at)

const isActive = (l: Outcome) => !l.status || l.status === 'active'

/** Keys of the subjects that hold at least one active outcome: an archived
 *  outcome no longer covers its subject. */
const heldKeys = (clos: Outcome[]) =>
  new Set(clos.filter(isActive).map((l) => normalizeCode(l.course || '')))

/** One subject the faculty member has written for. */
export interface SubjectRollup {
  /** Normalized code, the grouping key: "it 10" and "IT10" are one subject. */
  key: string
  /** The subject's own code, or the outcome's spelling when no subject matches. */
  code: string
  /** The subject's title; '' when no subject matches the code. */
  title: string
  /** Outcomes written in this subject, archived ones included. */
  count: number
  /** How many of those outcomes are archived. */
  archived: number
  /** The most recently changed outcome, the one a row opens. */
  latest: Outcome
}

/** Subjects the faculty member has written for, most recently changed first. */
export function groupOutcomesBySubject(clos: Outcome[], courses: Course[]): SubjectRollup[] {
  const subjectByKey = new Map(courses.map((c) => [normalizeCode(c.code), c]))
  const groups = new Map<string, Outcome[]>()
  for (const l of clos) {
    const key = normalizeCode(l.course || '')
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const latest = rows.reduce((a, b) => (updatedAt(b) > updatedAt(a) ? b : a))
      const subject = subjectByKey.get(key)
      return {
        key,
        code: subject?.code ?? ((latest.course || '').trim() || '—'),
        title: subject?.title ?? '',
        count: rows.length,
        archived: rows.filter((l) => !isActive(l)).length,
        latest,
      }
    })
    .sort((a, b) => updatedAt(b.latest) - updatedAt(a.latest))
}

/** The order the next-step card walks subjects in: year, then semester, then
 *  code, so a newcomer is pointed at the first year's subjects first. */
const curriculumOrder = (a: Course, b: Course) =>
  (a.year_level ?? 99) - (b.year_level ?? 99) ||
  (a.semester ?? 9) - (b.semester ?? 9) ||
  a.code.localeCompare(b.code, undefined, { numeric: true })

/** What the hero's next-step card asks for. */
export type NextStep =
  | { kind: 'no-subjects' }
  | { kind: 'start'; subject: Course; total: number }
  | { kind: 'next'; subject: Course; missing: number; total: number }
  | { kind: 'done'; total: number }

/** The subject to write for next: the first in curriculum order that holds no
 *  active outcome from this faculty member. */
export function planNextStep(courses: Course[], clos: Outcome[]): NextStep {
  if (courses.length === 0) return { kind: 'no-subjects' }
  const held = heldKeys(clos)
  const missing = courses.filter((c) => !held.has(normalizeCode(c.code))).sort(curriculumOrder)
  const total = courses.length
  if (missing.length === 0) return { kind: 'done', total }
  if (held.size === 0) return { kind: 'start', subject: missing[0], total }
  return { kind: 'next', subject: missing[0], missing: missing.length, total }
}

/** The stat row's figures, all read from the faculty member's own outcomes. */
export function ownFigures(clos: Outcome[], courses: Course[], now: number) {
  const held = heldKeys(clos)
  const active = clos.filter(isActive).length
  const latest = clos.reduce<Outcome | null>(
    (best, l) => (best === null || updatedAt(l) > updatedAt(best) ? l : best),
    null,
  )
  return {
    total: clos.length,
    active,
    archived: clos.length - active,
    covered: courses.filter((c) => held.has(normalizeCode(c.code))).length,
    editedThisWeek: clos.filter((l) => updatedAt(l) >= now - WEEK_MS).length,
    latest,
  }
}

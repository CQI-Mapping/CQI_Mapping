// Option lists for the blueprint's identifying fields: Program, Course title
// and Semester.
//
// Extracted because two places build them — the page's editor and the editor
// inside an expanded card — and they must produce identical lists. A card
// offering a program the page does not, or scoping courses differently, is a
// bug you only notice once you have saved through both.
//
// All three builders take the currently-saved value and keep it as its own
// option when it matches nothing listed. That is the important behaviour:
// the <select> is bound to the stored string, so a value with no matching
// option would silently show the placeholder and then overwrite the saved
// value on the next unrelated edit. An archived program, a deleted course, or a
// semester from before the picker existed all hit that path.

import type { Course, Program } from '../services/database'

/**
 * Both semesters carry the same academic year — the usual Aug-July calendar
 * puts 1st Sem in Aug-Dec 2026 and 2nd Sem in Jan-May 2027, so they share
 * 2026-2027. Spelled out in full because this string is what the exported
 * workbook prints.
 */
export const SCHOOL_YEAR = '2026-2027'
export const TERMS = [`1st Semester, ${SCHOOL_YEAR}`, `2nd Semester, ${SCHOOL_YEAR}`]

/** "BSIT - Bachelor of Science in Information Technology" */
export const programLabel = (p: Program): string => `${p.code} - ${p.name}`

/** "IT20 - Data Structures and Algorithm" */
export const courseLabel = (c: Course): string => `${c.code} - ${c.title}`

/**
 * A relation column arrives either as a bare uuid or, when a join resolved, as
 * the joined row. Both have to reduce to an id.
 */
export const relId = (v: string | { id: string } | null | undefined) =>
  v == null ? '' : typeof v === 'string' ? v : v.id

export interface Option {
  id: string
  value: string
}

/**
 * Programs, with the saved value kept if it is not among them.
 *
 * The saved program is stored in the exam's `code` column — the field is
 * misnamed, which is why the card once led with it as though it were a title.
 */
export function buildProgramOptions(programs: Program[], saved: string): Option[] {
  const options = programs.map((p) => ({ id: p.id, value: programLabel(p) }))
  if (saved && !options.some((o) => o.value === saved)) {
    options.unshift({ id: 'unlisted', value: saved })
  }
  return options
}

/**
 * Courses, scoped to the chosen program where there is one.
 *
 * An exam saved before the picker existed has no program to scope by, so every
 * course is listed rather than hiding them behind a prerequisite. A course that
 * is off-list (archived, or belonging to a program the user just switched away
 * from) stays visible as its own option, so changing Program never silently
 * discards a course the user already picked.
 */
export function buildCourseOptions(
  courses: Course[],
  programId: string,
  saved: string,
): Option[] {
  const scoped = programId ? courses.filter((c) => relId(c.program_id) === programId) : courses
  const options = scoped.map((c) => ({ id: c.id, value: courseLabel(c) }))
  if (saved && !options.some((o) => o.value === saved)) {
    options.unshift({ id: 'unlisted', value: saved })
  }
  return options
}

/** The two semesters, with a saved term that matches neither kept as its own. */
export function buildTermOptions(saved: string): string[] {
  const options = [...TERMS]
  if (saved && !options.includes(saved)) options.unshift(saved)
  return options
}

/** The program a stored value refers to, or '' when it matches none. */
export function programIdForLabel(programs: Program[], label: string): string {
  return programs.find((p) => programLabel(p) === label)?.id ?? ''
}
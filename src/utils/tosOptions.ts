// Option lists for the blueprint's identifying fields: Program, Course title,
// Semester and School Year.
//
// Extracted because two places build them — the page's editor and the editor
// inside an expanded card — and they must produce identical lists. A card
// offering a program the page does not, or scoping courses differently, is a
// bug you only notice once you have saved through both.
//
// All builders take the currently-saved value and keep it as its own option
// when it matches nothing listed. That is the important behaviour: the
// <select> is bound to the stored string, so a value with no matching option
// would silently show the placeholder and then overwrite the saved value on
// the next unrelated edit. A semester or school year saved before the picker
// existed all hit that path.

import type { Course, Program } from '../services/database'

/**
 * Both semesters carry the same academic year — the usual Aug-July calendar
 * puts 1st Sem in Aug-Dec 2026 and 2nd Sem in Jan-May 2027, so they share
 * 2026-2027. Spelled out in full because this string is what the exported
 * workbook prints.
 */
export const SCHOOL_YEAR = '2026-2027'

export const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer']

/** The exam coverages a blueprint can be for, matching the workbook's title line. */
export const EXAM_TYPES = ['Prelim', 'Midterm', 'Finals']

/** School years offered in the picker, current year first. */
export function schoolYearOptions(): string[] {
  const current = Number(SCHOOL_YEAR.split('-')[0])
  const years: string[] = []
  for (let start = current - 2; start <= current + 2; start++) {
    years.push(`${start}-${start + 1}`)
  }
  return years
}

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

/** Programs, with the saved value kept if it is not among them.
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

/** Courses, scoped to the chosen program where there is one.
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

/** Compose the stored "term" string from semester and school year. */
export function composeTerm(semester: string, schoolYear: string): string {
  return `${semester}, ${schoolYear}`
}

/** Split a stored "term" string back into [semester, school year]. */
export function splitTerm(term: string): { semester: string; schoolYear: string } {
  const comma = term.indexOf(',')
  if (comma === -1) return { semester: term.trim(), schoolYear: '' }
  return {
    semester: term.slice(0, comma).trim(),
    schoolYear: term.slice(comma + 1).trim(),
  }
}

/** The two semesters, with a saved semester that matches neither kept as its own. */
export function buildSemesterOptions(saved: string): string[] {
  const options = [...SEMESTERS]
  if (saved && !options.includes(saved)) options.unshift(saved)
  return options
}

/** The school years, with a saved year that matches none kept as its own. */
export function buildSchoolYearOptions(saved: string): string[] {
  const options = schoolYearOptions()
  if (saved && !options.includes(saved)) options.unshift(saved)
  return options
}

/** The exam coverages, with a saved type that matches none kept as its own. */
export function buildExamTypeOptions(saved: string): string[] {
  const options = [...EXAM_TYPES]
  if (saved && !options.includes(saved)) options.unshift(saved)
  return options
}

/** The program a stored value refers to, or '' when it matches none. */
export function programIdForLabel(programs: Program[], label: string): string {
  return programs.find((p) => programLabel(p) === label)?.id ?? ''
}

/**
 * Save failures out of the database read like PostgreSQL, and name neither the
 * row nor the cure. This translates the one a blueprint save can actually hit
 * -- code 23505, the UNIQUE constraint refusing two blueprints that file the
 * same program, course, exam type, semester and school year -- and passes
 * everything else through with whatever diagnostics PostgREST did provide
 * joined on: the package's own docs warn that reading only `message` hides the
 * actionable part, which it puts in `hint` and classes by `code`. Reading the
 * fields structurally also avoids leaning on `instanceof Error`, a poor gate
 * for a value that arrived over the wire.
 */
export function describeTosError(e: unknown, fallback: string): string {
  const code = (e as { code?: unknown } | null | undefined)?.code
  if (code === '23505') {
    return 'A blueprint with this program, course, exam type, semester and school year already exists. Change one of them, or keep editing the one you have.'
  }
  if (typeof e === 'string') return e
  if (!e || typeof e !== 'object') return fallback
  const { message, hint, code: dbCode } = e as Record<string, unknown>
  const parts = [message, hint, dbCode].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  )
  return parts.length > 0 ? parts.join(' — ') : fallback
}

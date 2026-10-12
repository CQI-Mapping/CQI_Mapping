// Shared subject/course code helpers.
//
// Codes in the database are free text and inconsistent — "IT 21", "IT21",
// "IT 21 - OOP", "IT21-OOP", "IT-21" all refer to the same subject. These
// helpers normalize a code to a comparable key and loosely match a CLO's
// `course` field against a subject code. Used by the Subject Graph and the
// Curriculum Report so both agree on which CLOs belong to which subject.

export const normalizeCode = (code: string) =>
  code.trim().toUpperCase().replace(/[\s\-–—._/,]+/g, '')

// ── Credit / contact-hour wording shared by the Curriculum Report (View.tsx)
// and the Subject Graph's About card (SubjectView.tsx), so both read the same.

export const SEMESTER_WEEKS = 18

// A subject's weekly contact hours come from its unit load, not from how those
// units are split between lecture and laboratory — a 3-unit subject runs 5
// hours a week whether it is 2L/1Lab, 1L/2Lab or 0L/3Lab, over an 18-week
// semester ("5 hours ... or 90 hours").
export const EXTRA_WEEKLY_HOURS = 2

type CreditFields = {
  units?: number | null
  credit_lecture?: number | null
  credit_laboratory?: number | null
}

/** "3 units (2 units Lecture and 1 laboratory)" — the report's V. Credit line. */
export const courseCreditLabel = (c: CreditFields) =>
  `${c.units ?? 0} units (${c.credit_lecture ?? 0} units Lecture and ${c.credit_laboratory ?? 0} laboratory)`

/** "5 hours in every week for 18 weeks, or 90 hours in a semester". */
export const courseHoursSentence = (c: CreditFields) => {
  const units = Number(c.units) || 0
  if (units <= 0) return 'No hours recorded for this subject yet.'
  const weekly = units + EXTRA_WEEKLY_HOURS
  const semester = weekly * SEMESTER_WEEKS
  return `${weekly} hours in every week for ${SEMESTER_WEEKS} weeks, or ${semester} hours in a semester`
}

const firstToken = (s: string) => {
  const m = s.trim().split(/[\s\-–—]+/)[0]
  return m || ''
}

// True when a CLO record's `course` field refers to the given subject code.
// `subjectKey` is expected to be already normalized via normalizeCode().
// Lenient: handles "IT 21", "IT21", "IT 21 - OOP", "IT21-OOP", "IT-21" etc.
export const cloMatchesSubject = (cloCourse: string, subjectKey: string) => {
  const raw = (cloCourse || '').trim()
  if (!raw) return false
  const norm = normalizeCode(raw)
  if (norm === subjectKey) return true
  if (normalizeCode(firstToken(raw)) === subjectKey) return true
  if (norm.includes(subjectKey)) return true
  const tokens = raw
    .split(/[\s,;|]+/)
    .map((s) => normalizeCode(s))
    .filter(Boolean)
  return tokens.includes(subjectKey)
}

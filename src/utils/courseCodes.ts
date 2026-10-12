// Shared subject/course code helpers.
//
// Codes in the database are free text and inconsistent — "IT 21", "IT21",
// "IT 21 - OOP", "IT21-OOP", "IT-21" all refer to the same subject. These
// helpers normalize a code to a comparable key and loosely match a CLO's
// `course` field against a subject code. Used by the Subject Graph and the
// Curriculum Report so both agree on which CLOs belong to which subject.

export const normalizeCode = (code: string) =>
  code.trim().toUpperCase().replace(/[\s\-–—._/,]+/g, '')

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

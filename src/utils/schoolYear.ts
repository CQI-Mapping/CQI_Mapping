// School-year helpers, shared by the curriculum form and the map's
// program-year boot — one authority for "what school year a moment falls
// in" and "what year a record's name carries", so the form's window, the
// map's default pick and the dashboard block can never disagree.
//
// Philippine school years open in August (SY 2026-2027 spans Aug 2026 …
// May 2027), so August through December belongs to the year ahead.

/** The school year a moment belongs to, named by its opening year:
 *  November 2026 → 2026 (SY 2026-2027); July 2026 → 2025 (SY 2025-2026). */
export function schoolYearStartFor(now: Date = new Date()): number {
  const y = now.getFullYear()
  return now.getMonth() + 1 >= 8 ? y : y - 1
}

/** Today's school-year opening year, by the local clock. */
export const CURRENT_SY_START = schoolYearStartFor()

/** Read an opening year out of a label the managers actually write —
 *  "BSIT 2026-2027", "SY 2019-20", "BSIT 2020/2021". The first clean pair
 *  wins, where clean means the second year is the first year + 1; anything
 *  ambiguous ("2019-2025", two unconnected numbers) returns null so the
 *  caller can fall back to an unset record. */
export function labelSchoolYearStart(label: string): number | null {
  const m = label.match(
    /(1[0-9]{3}|2[0-9]{3})[-–—/ .]((?:1[0-9]{3}|2[0-9]{3})|[0-9]{2})(?![0-9])/,
  )
  if (!m) return null
  const start = Number(m[1])
  if (start < 1990 || start > 2099) return null
  const end = m[2].length === 2
    ? Math.floor(start / 100) * 100 + Number(m[2])
    : Number(m[2])
  return end === start + 1 ? start : null
}

/** The year window the curriculum form offers: fifteen years back from the
 *  current school year through ten ahead — enough to fix older records and
 *  prepare the coming ones without endless scrolling. */
export function schoolYearOptions(): number[] {
  return Array.from({ length: 26 }, (_, i) => CURRENT_SY_START - 15 + i)
}

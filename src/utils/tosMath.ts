// Pure math behind the Table of Specification.
//
// A TOS is a blueprint that holds two things in tension and this file models
// both, because the gap between them is the whole point:
//
//   INTENT  — what a topic's hour allotment says it is worth, derived from
//             the sheet's total:  (total / totalHours) * topicHours.
//             This is the spreadsheet's =($C$19/$B$20)*B13 formula.
//
//   REALITY — how many items actually landed in each Bloom column, summed
//             per level. These are hand-placed in the spreadsheet, and they
//             are the numbers a student actually faces.
//
// When they disagree, the exam has drifted away from its own syllabus hours.
// validateSheet() reports that drift instead of letting it hide behind a
// total that still adds up.
//
// No React and no Supabase in here, so the page, the printable grid, and the
// vitest suite all read from one place.

export const BLOOM_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const

export type BloomLevel = typeof BLOOM_LEVELS[number]

export const BLOOM_LABELS: Record<BloomLevel, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
}

// Column headings for the nine-column grid. Full words would blow the layout.
export const BLOOM_SHORT: Record<BloomLevel, string> = {
  remember: 'R',
  understand: 'U',
  apply: 'Ap',
  analyze: 'An',
  evaluate: 'Ev',
  create: 'C',
}

export const BLOOM_DESCRIPTIONS: Record<BloomLevel, string> = {
  remember: 'Recall a fact, term, or definition',
  understand: 'Explain it or paraphrase it in your own words',
  apply: 'Use the knowledge in a new situation',
  analyze: 'Break it apart and see the relationships',
  evaluate: 'Judge it against a standard or criterion',
  create: 'Produce something new using it',
}

// Per-topic Bloom placement. Missing key means "nothing at this level".
export type BloomCounts = Partial<Record<BloomLevel, number>>

export interface TosTopic {
  id: string
  position: number
  title: string
  slo: string
  hours: number
  bloom: BloomCounts
}

export interface TosSheet {
  id: string
  kind: 'items' | 'points'
  label: string
  total: number
  note: string
  topics: TosTopic[]
}

export interface TosExam {
  code: string
  title: string
  examType: string
  term: string
  coverage: string
  preparedBy: string
  totalHours: number
}

// How far a topic's placed items may sit from its weighted items before we
// call it drift. Half an item — anything smaller is just rounding.
export const WEIGHT_TOLERANCE = 0.25

/** Coerce anything (a string from an <input>, undefined, NaN) to a safe number. */
export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Trim float noise for display: 20 -> "20", 2.5 -> "2.5", 0.333 -> "0.33". */
export const fmt = (n: number): string => String(Math.round(num(n) * 100) / 100)

/**
 * One decimal, always. The weighted column in the faculty workbook is formatted
 * this way, so 1.25 items reads "1.3" there. Matching it keeps the document
 * looking like the sheet it came from.
 */
export const fmt1 = (n: number): string => num(n).toFixed(1)

/** Items actually placed in one topic, across every Bloom column. */
export const topicPlaced = (topic: TosTopic): number =>
  BLOOM_LEVELS.reduce((sum, level) => sum + num(topic.bloom[level]), 0)

/** Sum of the hour allotments across a sheet's topics. */
export const totalHours = (topics: TosTopic[]): number =>
  topics.reduce((sum, t) => sum + num(t.hours), 0)

/** INTENT: what the hour allotment says this topic is worth. */
export const weightedItems = (
  total: number,
  hours: number,
  topicHours: number,
): number => (hours > 0 ? (num(total) / hours) * num(topicHours) : 0)

/** INTENT, pre-bound to a sheet. */
export const weightedFor = (sheet: TosSheet, topic: TosTopic): number =>
  weightedItems(num(sheet.total), totalHours(sheet.topics), num(topic.hours))

/** REALITY: the per-level column sums, matching row 19 of the spreadsheet. */
export const bloomTotals = (topics: TosTopic[]): Record<BloomLevel, number> => {
  const out = {} as Record<BloomLevel, number>
  for (const level of BLOOM_LEVELS) out[level] = 0
  for (const topic of topics) {
    for (const level of BLOOM_LEVELS) out[level] += num(topic.bloom[level])
  }
  return out
}

/** Every item in the sheet, all columns. Must equal sheet.total. */
export const placedTotal = (topics: TosTopic[]): number =>
  Object.values(bloomTotals(topics)).reduce((sum, n) => sum + num(n), 0)

/** Row 12: each Bloom level as a share of the exam total. */
export const shares = (
  topics: TosTopic[],
  total: number,
): Record<BloomLevel, number> => {
  const totals = bloomTotals(topics)
  const out = {} as Record<BloomLevel, number>
  for (const level of BLOOM_LEVELS) {
    out[level] = total > 0 ? totals[level] / num(total) : 0
  }
  return out
}

/** Bloom levels actually used, for the legend. */
export const usedLevels = (topics: TosTopic[]): BloomLevel[] =>
  BLOOM_LEVELS.filter((level) => bloomTotals(topics)[level] > 0)

export type IssueLevel = 'error' | 'warn' | 'info'

export interface TosIssue {
  level: IssueLevel
  code: string
  message: string
}

/**
 * Check one sheet for internal consistency. Pure — returns everything it
 * finds rather than throwing on the first problem, so the page can show the
 * full picture at once.
 */
export function validateSheet(
  sheet: TosSheet,
  declaredHours?: number | null,
): TosIssue[] {
  const issues: TosIssue[] = []
  const topics = sheet.topics
  const total = num(sheet.total)
  const unit = sheet.kind === 'points' ? 'points' : 'items'

  if (topics.length === 0) {
    issues.push({
      level: 'error',
      code: 'NO_TOPICS',
      message: 'This sheet has no topics yet.',
    })
    return issues
  }

  if (total <= 0) {
    issues.push({
      level: 'error',
      code: 'NO_TOTAL',
      message: `Set how many ${unit} this exam is worth before the columns can be checked.`,
    })
  } else {
    const placed = placedTotal(topics)
    if (Math.abs(placed - total) > 0.001) {
      const gap = Math.abs(placed - total)
      issues.push({
        level: 'error',
        code: 'SUM_MISMATCH',
        message:
          `Columns total ${fmt(placed)} ${unit} but the sheet declares ${fmt(total)} — ` +
          `${fmt(gap)} ${placed > total ? 'over' : 'unassigned'}.`,
      })
    }
  }

  const hours = totalHours(topics)
  if (declaredHours != null && Math.abs(hours - num(declaredHours)) > 0.001) {
    issues.push({
      level: 'warn',
      code: 'HOURS_MISMATCH',
      message:
        `Topics add up to ${fmt(hours)} hrs but the exam declares ` +
        `${fmt(num(declaredHours))} hrs.`,
    })
  }

  // Intent vs reality, topic by topic.
  if (total > 0) {
    const drifted = topics.filter(
      (t) => Math.abs(topicPlaced(t) - weightedFor(sheet, t)) > WEIGHT_TOLERANCE,
    )
    if (drifted.length > 0) {
      const detail = drifted
        .map(
          (t) =>
            `#${t.position} ${t.title} (${fmt(weightedFor(sheet, t))} by hours, ` +
            `${fmt(topicPlaced(t))} placed)`,
        )
        .join('; ')
      issues.push({
        level: 'warn',
        code: 'WEIGHT_DRIFT',
        message:
          `${drifted.length} topic(s) place a different number of ${unit} than ` +
          `their hours imply: ${detail}.`,
      })
    }
  }

  if (total > 0) {
    const s = shares(topics, total)
    const skewed = BLOOM_LEVELS.filter((level) => s[level] > 0.6)
    if (skewed.length > 0) {
      issues.push({
        level: 'info',
        code: 'TARGET_SKEW',
        message:
          `${skewed.map((l) => BLOOM_LABELS[l]).join(' and ')} ` +
          `${skewed.length > 1 ? 'make up' : 'makes up'} more than 60% of this exam — ` +
          `usually worth a second look.`,
      })
    }
  }

  return issues
}

/**
 * A v4-shaped id. New topics are assigned an id client-side so React has a
 * stable key before the server replies, and it has to be a real UUID because
 * tos_topics.id is a UUID column — a "topic-123" placeholder would fail the
 * insert. Falls back to a manual v4 when crypto.randomUUID is unavailable
 * (older browsers, plain Node test runs).
 */
const uuid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

/** An empty topic row, for the "Add topic" button. */
export const blankTopic = (position: number): TosTopic => ({
  id: uuid(),
  position,
  title: '',
  slo: '',
  hours: 0,
  bloom: {},
})

/** Renumber positions 1..n so the grid never shows gaps after a delete. */
export const renumber = (topics: TosTopic[]): TosTopic[] =>
  topics.map((t, i) => (t.position === i + 1 ? t : { ...t, position: i + 1 }))
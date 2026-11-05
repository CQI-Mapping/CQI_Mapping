import { describe, expect, it } from 'vitest'
import type { Course, CourseLearningOutcomeStandalone } from '../services/database'
import { groupOutcomesBySubject, ownFigures, planNextStep, weeklyEditTrend } from './facultyDashboard'

const subject = (code: string, title: string, year: number | null, semester: number | null) =>
  ({ id: code, code, title, year_level: year, semester }) as unknown as Course

const outcome = (code: string, course: string, updated: string, status = 'active') =>
  ({
    id: code,
    code,
    course,
    title: '',
    description: null,
    status,
    created_at: updated,
    updated_at: updated,
  }) as CourseLearningOutcomeStandalone

describe('groupOutcomesBySubject', () => {
  it('groups spellings of one code and names the subject from the list', () => {
    const courses = [subject('IT 10', 'Intro to IT', 1, 1), subject('IT20', 'Programming 1', 1, 2)]
    const rows = groupOutcomesBySubject(
      [
        outcome('CLO1', 'IT10', '2026-11-02T08:00:00.000Z'),
        outcome('CLO2', 'it 10', '2026-11-03T08:00:00.000Z'),
        outcome('CLO3', 'IT20', '2026-11-01T08:00:00.000Z'),
      ],
      courses,
    )
    expect(rows.map((r) => [r.code, r.title, r.count, r.latest.code])).toEqual([
      ['IT 10', 'Intro to IT', 2, 'CLO2'],
      ['IT20', 'Programming 1', 1, 'CLO3'],
    ])
  })

  it('counts archived outcomes apart from the rest of their subject', () => {
    const rows = groupOutcomesBySubject(
      [
        outcome('CLO1', 'IT10', '2026-11-02T08:00:00.000Z'),
        outcome('CLO2', 'IT10', '2026-11-01T08:00:00.000Z', 'archived'),
      ],
      [subject('IT10', 'Intro to IT', 1, 1)],
    )
    expect(rows[0]).toMatchObject({ count: 2, archived: 1 })
  })

  it('falls back to the outcome spelling when no subject matches, and dashes a blank course', () => {
    const rows = groupOutcomesBySubject(
      [outcome('CLO1', 'GE 99', '2026-11-02T08:00:00.000Z'), outcome('CLO2', '', '2026-11-01T08:00:00.000Z')],
      [],
    )
    expect(rows.map((r) => [r.code, r.title])).toEqual([
      ['GE 99', ''],
      ['—', ''],
    ])
  })
})

describe('planNextStep', () => {
  const courses = [
    subject('IT20', 'Programming 1', 1, 2),
    subject('IT10', 'Intro to IT', 1, 1),
    subject('IT30', 'Data Structures', 2, 1),
  ]

  it('reports no subjects when none exist', () => {
    expect(planNextStep([], [])).toEqual({ kind: 'no-subjects' })
  })

  it('starts with the first subject in curriculum order when no outcomes exist', () => {
    expect(planNextStep(courses, [])).toMatchObject({ kind: 'start', subject: { code: 'IT10' }, total: 3 })
  })

  it('points at the next subject still missing outcomes once some exist', () => {
    const clos = [outcome('CLO1', 'IT10', '2026-11-02T08:00:00.000Z')]
    expect(planNextStep(courses, clos)).toMatchObject({
      kind: 'next',
      subject: { code: 'IT20' },
      missing: 2,
      total: 3,
    })
  })

  it('treats a subject whose only outcomes are archived as still missing', () => {
    const clos = [outcome('CLO1', 'IT10', '2026-11-02T08:00:00.000Z', 'archived')]
    expect(planNextStep(courses, clos)).toMatchObject({ kind: 'start', subject: { code: 'IT10' } })
  })

  it('reports done when every subject has outcomes', () => {
    const clos = courses.map((c, i) => outcome(`CLO${i}`, c.code, '2026-11-02T08:00:00.000Z'))
    expect(planNextStep(courses, clos)).toEqual({ kind: 'done', total: 3 })
  })
})

describe('ownFigures', () => {
  const now = new Date(2026, 10, 5, 15, 0).getTime()
  const courses = [subject('IT10', 'Intro to IT', 1, 1), subject('IT20', 'Programming 1', 1, 2)]

  it('counts active and archived outcomes, covered subjects and this week’s edits', () => {
    const clos = [
      outcome('CLO1', 'IT10', new Date(2026, 10, 4, 9, 0).toISOString()),
      outcome('CLO2', 'IT10', new Date(2026, 10, 1, 9, 0).toISOString(), 'archived'),
      outcome('CLO3', 'IT99', new Date(2026, 9, 20, 9, 0).toISOString()),
    ]
    expect(ownFigures(clos, courses, now)).toMatchObject({
      total: 3,
      active: 2,
      archived: 1,
      covered: 1,
      editedThisWeek: 2,
    })
  })

  it('does not count a subject as covered by archived outcomes alone', () => {
    const clos = [outcome('CLO1', 'IT20', '2026-11-02T08:00:00.000Z', 'archived')]
    expect(ownFigures(clos, courses, now).covered).toBe(0)
  })

  it('returns the most recently changed outcome as latest, or null when there are none', () => {
    const clos = [
      outcome('CLO1', 'IT10', '2026-11-01T08:00:00.000Z'),
      outcome('CLO2', 'IT20', '2026-11-03T08:00:00.000Z'),
    ]
    expect(ownFigures(clos, courses, now).latest?.code).toBe('CLO2')
    expect(ownFigures([], courses, now).latest).toBeNull()
  })
})

describe('weeklyEditTrend', () => {
  const DAY = 24 * 60 * 60 * 1000
  const now = new Date(2026, 10, 5, 15, 0).getTime()
  const ago = (days: number) => new Date(now - days * DAY).toISOString()

  it('splits four trailing weeks oldest first, boundary edits going to the older bucket', () => {
    const clos = [
      outcome('CLO1', 'IT10', ago(2)),   // this week
      outcome('CLO2', 'IT10', ago(9)),   // last week
      outcome('CLO3', 'IT99', ago(16)),  // two weeks back
      outcome('CLO4', 'IT99', ago(23)),  // three weeks back
      // Exactly seven days old: the [start, end) window counts a boundary
      // edit in its OWN trailing bucket — the same inclusive rule the
      // "Edited this week" figure uses, so they can never disagree.
      outcome('CLO5', 'IT99', ago(7)),
    ]
    expect(weeklyEditTrend(clos, now).map((w) => w.count)).toEqual([1, 1, 1, 2])
  })

  it('agrees with the Edited this week figure on the trailing window', () => {
    const courses = [subject('IT10', 'Intro to IT', 1, 1)]
    const clos = [outcome('CLO1', 'IT10', ago(1)), outcome('CLO2', 'IT10', ago(10))]
    const trend = weeklyEditTrend(clos, now)
    expect(trend[3].count).toBe(ownFigures(clos, courses, now).editedThisWeek)
    expect(trend).toHaveLength(4)
  })

  it('stays a flat quiet baseline when nothing was edited', () => {
    expect(weeklyEditTrend([], now)).toEqual([
      expect.objectContaining({ count: 0 }),
      expect.objectContaining({ count: 0 }),
      expect.objectContaining({ count: 0 }),
      expect.objectContaining({ count: 0 }),
    ])
  })
})

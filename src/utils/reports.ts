// Reports: the consolidated list of every named record in the system.
//
// The Curriculum Report and the Subject Graph's About card each answer "what
// does this one subject look like". This answers the other question -- "what is
// actually on the books" -- by flattening the five named lists (programs,
// courses, program outcomes, objectives and learning outcomes) into one shape
// the page and the Excel export can both render.
//
// It is deliberately a code-and-name list and nothing more. The first version
// carried a program, a unit count, a description and a CMO alignment alongside
// each name; that is the Curriculum Report's job, and repeating it here made
// this a second, worse copy of that document. This one answers "what exists",
// so a row is a code, a name and a status.
//
// Pure on purpose: no React, no Supabase. buildReport() takes plain arrays
// and returns plain sections, which is what the tests read, and it is what lets
// the export write the exact rows the page is showing rather than re-deriving
// them and drifting.

import type {
  Course,
  CourseLearningOutcomeStandalone,
  Program,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../services/database'
import { isActive, poNumber } from './report'
import { normalizeCode } from './courseCodes'

export type SectionKey = 'programs' | 'courses' | 'pos' | 'peos' | 'clos'

/** One flattened row. Every section has this exact shape. */
export interface ReportRow {
  code: string
  name: string
  status: string
  /**
   * The course a learning outcome belongs to. Only CLO rows carry it; every
   * other section leaves it undefined.
   *
   * Without it, CLO-1 of one course and CLO-1 of another were two rows that
   * looked identical, in a list sorted by the very field it hid -- so the order
   * made sense and the rows did not.
   */
  course?: string
}

export interface ReportSection {
  key: SectionKey
  title: string
  rows: ReportRow[]
  /**
   * Whether this section renders the Course column. Only the CLO section can,
   * and only when its outcomes actually name a course — a Course column of
   * nothing over on Programs would be a bordered hole nobody asked for.
   */
  hasCourse: boolean
}

/**
 * Column headings, in order, after the leading "No." the caller renders.
 *
 * One layout for every section, rather than a per-section map. The first
 * version gave each section its own columns, which meant the header and the
 * body could disagree — a fixed row shape under a varying header shifts every
 * column after the short one. A single shared list removes that whole class of
 * bug by not having anywhere for it to live.
 *
 * Learning outcomes are the one exception, and columns() is how it stays an
 * exception rather than a per-section map again: the Course column appears or
 * disappears for the whole report on one flag, so the header and the body still
 * come from the same place.
 */
export const COLUMNS = ['Code', 'Name']

/** Heading for the learning outcome's owning course. */
export const COURSE_COLUMN = 'Course'

/** Headings for a report, given whether it shows the course column. */
export function columns(hasCourse: boolean): string[] {
  return hasCourse ? ['Code', COURSE_COLUMN, 'Name'] : [...COLUMNS]
}

/**
 * A row's cell values, in columns() order.
 *
 * The page and the Excel export both render through this, so a row cannot show
 * one set of values under a header built from another list.
 */
export function rowCells(row: ReportRow, hasCourse: boolean): string[] {
  return hasCourse ? [row.code, row.course ?? BLANK_NAME, row.name] : [row.code, row.name]
}

/** Section titles, in report order: broad scope down to per-subject detail. */
export const SECTION_ORDER: SectionKey[] = ['programs', 'peos', 'pos', 'courses', 'clos']

export const SECTION_TITLES: Record<SectionKey, string> = {
  programs: 'Programs',
  courses: 'Courses',
  pos: 'Program Outcomes',
  peos: 'Program Educational Objectives',
  clos: 'Course Learning Outcomes',
}

export interface ReportInput {
  programs: Program[]
  courses: Course[]
  pos: ProgramOutcomeStandalone[]
  peos: ProgramEducationalObjective[]
  clos: CourseLearningOutcomeStandalone[]
}

export interface ReportOptions {
  /** Archived records are hidden by default, matching every other report here. */
  includeArchived?: boolean
  /** Free-text filter, matched against the code and the name. */
  query?: string
}

export interface SummaryLine {
  key: SectionKey
  title: string
  active: number
  archived: number
  total: number
}

/**
 * One wedge of the record-mix donut: what share of everything on the books a
 * single record type is. Derived from the same summary lines the Totals table
 * renders, so the two can never disagree.
 */
export interface MixSlice {
  key: SectionKey
  title: string
  total: number
  /** Share of the grand total, 0-100, to one decimal place. */
  percent: number
}

export interface RecordMix {
  /** Every named record in the system, active and archived. */
  total: number
  slices: MixSlice[]
}

export interface Report {
  sections: ReportSection[]
  /**
   * Counts for the whole dataset, NOT for what the filters currently show.
   * The tables below narrow as the search box is typed in; a summary that
   * counted those same rows would report "0 archived" the moment archived
   * records are hidden, which reads as data loss rather than a filter.
   */
  summary: SummaryLine[]
  /** Rows currently displayed, summed across sections. */
  shownCount: number
}

const text = (v: string | null | undefined) => (v || '').trim()

/**
 * Search normalisation: lowercase, with every non-alphanumeric run removed.
 *
 * Dropping punctuation outright (rather than turning it into a space) is what
 * lets "po1", "po 1" and "PO-1" all find the same outcome — the three ways a
 * user actually types a code that is stored with a hyphen. The cost is that
 * "po 1" also matches PO-10; returning an extra row is a far better failure
 * than a search box that silently finds nothing.
 */
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Digits-insensitive string order: PO-2 before PO-10. */
const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Program outcomes sort by their parsed number first, then by code. This is the
 * order the Curriculum Report already uses (utils/report.poNumber), so the two
 * documents list the same outcomes in the same sequence.
 */
const byPoNumber = (a: { code: string }, b: { code: string }) =>
  poNumber(a.code) - poNumber(b.code) || byText(a.code, b.code)

/** Shown in place of a name the record does not actually have. */
export const BLANK_NAME = '—'

/**
 * Whether a row is archived. The inverse of report.isActive, exported under its
 * own name so callers that want to *mark* archived rows (the page mutes them)
 * are not left reaching for the filter's sense of the check.
 */
export const isArchived = (row: { status?: string }) => !isActive(row)

/**
 * The course code to show for a learning outcome.
 *
 * `course` is free text and inconsistent the way course codes are everywhere
 * else in this schema — "IT 21", "it21", "IT21 - OOP" all mean IT21 — so it is
 * resolved to the course list's own spelling whenever one matches exactly. That
 * makes the column read as codes rather than as whatever was typed that day.
 *
 * An exact match only. courseCodes.cloMatchesSubject also accepts a substring,
 * which is right for the Subject Graph's fuzzy grouping but wrong here: with
 * "IT2" and "IT21" both on file it would attribute an outcome to the wrong
 * subject, and this column is a claim about ownership.
 *
 * A value that matches nothing is left as typed. That is an orphaned outcome,
 * and blanking it would hide the one thing on this page worth noticing.
 */
function courseCodeFor(raw: string | null | undefined, courses: Course[]): string {
  const typed = text(raw)
  if (!typed) return ''
  const key = normalizeCode(typed)
  const match = courses.find((c) => normalizeCode(c.code) === key)
  return match ? text(match.code) : typed
}

/**
 * Flatten the five lists into report sections.
 *
 * Every list is flattened BEFORE the archive and search filters are applied, so
 * the summary can count the full dataset while the tables show what the
 * controls select.
 */
export function buildReport(input: ReportInput, options: ReportOptions = {}): Report {
  const { programs, courses, pos, peos, clos } = input
  const includeArchived = options.includeArchived ?? false
  const needle = normalize((options.query ?? '').trim())

  const nameOf = (raw: string | null | undefined, fallback: string | null = '') =>
    text(raw) || text(fallback) || BLANK_NAME

  // Decided from the whole dataset, before either filter, so the column cannot
  // flicker on and off while the search box is being typed in.
  const hasCourse = clos.some((c) => text(c.course) !== '')

  // ---- flatten ----
  const programRows: ReportRow[] = [...programs]
    .sort((a, b) => byText(a.code, b.code) || byText(a.name, b.name))
    .map((p) => ({ code: text(p.code), name: nameOf(p.name), status: p.status }))

  const courseRows: ReportRow[] = [...courses]
    .sort((a, b) => byText(a.code, b.code) || byText(a.title, b.title))
    .map((c) => ({ code: text(c.code), name: nameOf(c.title), status: c.status }))

  const poRows: ReportRow[] = [...pos]
    .sort(byPoNumber)
    .map((p) => ({ code: text(p.code), name: nameOf(p.title), status: p.status }))

  const peoRows: ReportRow[] = [...peos]
    .sort((a, b) => byText(a.code, b.code))
    .map((p) => ({ code: text(p.code), name: nameOf(p.title), status: p.status }))

  // Learning outcomes belong to a subject, so they sort by subject first and by
  // code within it — the order the faculty reads them in on the CLO page. The
  // subject is not shown (this is a name list, not the CLO map) but it is the
  // only thing that makes CLO-1 of one course distinguishable from CLO-1 of
  // another, so it decides the order — and it is now shown too, which is what
  // finally makes that order legible.
  const cloRows: ReportRow[] = [...clos]
    .sort((a, b) => byText(a.course, b.course) || byText(a.code, b.code))
    .map((c) => ({
      code: text(c.code),
      name: nameOf(c.title, c.description),
      status: c.status,
      course: courseCodeFor(c.course, courses) || BLANK_NAME,
    }))

  // ---- filter ----
  // Search matches the columns the table shows. Matching a hidden column would
  // return rows whose reason for matching is invisible, which is worse than not
  // matching at all.
  //
  // The course matches only on the rows that carry one, which is exactly the
  // rows whose table shows a Course column: typing "IT21" finds that course's
  // outcomes, and there is no other way to ask.
  //
  // Archived rows are dropped before the search runs, so the filter never has
  // to know about them.
  const keep = (row: ReportRow) =>
    (includeArchived || isActive(row)) &&
    (needle === '' ||
      normalize(row.code).includes(needle) ||
      normalize(row.name).includes(needle) ||
      normalize(row.course ?? '').includes(needle))

  const built: Record<SectionKey, ReportRow[]> = {
    programs: programRows,
    courses: courseRows,
    pos: poRows,
    peos: peoRows,
    clos: cloRows,
  }

  const sections = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    rows: built[key].filter(keep),
    hasCourse: key === 'clos' && hasCourse,
  }))

  // The summary counts the flattened rows, before either filter.
  const summary = SECTION_ORDER.map((key) => {
    const rows = built[key]
    const archived = rows.filter((r) => !isActive(r)).length
    return {
      key,
      title: SECTION_TITLES[key],
      active: rows.length - archived,
      archived,
      total: rows.length,
    }
  })

  return {
    sections,
    summary,
    shownCount: sections.reduce((n, s) => n + s.rows.length, 0),
  }
}

/**
 * Turn the Totals rows into donut wedges.
 *
 * Percentages are of the grand total, not of each section — the chart answers
 * "what is most of this system made of", which is the one question the flat
 * tables cannot answer at a glance.
 *
 * Every section is kept, including one with no records, so the legend stays the
 * same length as the data changes instead of silently losing a row. The
 * percentage is rounded to one decimal because that is all a donut can honestly
 * show; two would imply a precision nobody can read off an arc.
 */
export function buildRecordMix(summary: SummaryLine[]): RecordMix {
  const total = summary.reduce((n, line) => n + line.total, 0)
  return {
    total,
    slices: summary.map((line) => ({
      key: line.key,
      title: line.title,
      total: line.total,
      percent: total === 0 ? 0 : Math.round((line.total / total) * 1000) / 10,
    })),
  }
}
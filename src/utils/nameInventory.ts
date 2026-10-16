// Name Inventory: the consolidated list of every named record in the system.
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
// this a second, worse copy of that document. A name inventory answers "what
// exists", so a row is a code, a name and a status.
//
// Pure on purpose: no React, no Supabase. buildInventory() takes plain arrays
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

export type SectionKey = 'programs' | 'courses' | 'pos' | 'peos' | 'clos'

/** One flattened row. Every section has this exact shape. */
export interface InventoryRow {
  code: string
  name: string
  status: string
}

export interface InventorySection {
  key: SectionKey
  title: string
  rows: InventoryRow[]
}

/**
 * Column headings, in order, after the leading "No." the caller renders.
 *
 * One layout for every section, rather than a per-section map. The first
 * version gave each section its own columns, which meant the header and the
 * body could disagree — a fixed row shape under a varying header shifts every
 * column after the short one. A single shared list removes that whole class of
 * bug by not having anywhere for it to live.
 */
export const COLUMNS = ['Code', 'Name']

/** Section titles, in report order: broad scope down to per-subject detail. */
export const SECTION_ORDER: SectionKey[] = ['programs', 'peos', 'pos', 'courses', 'clos']

export const SECTION_TITLES: Record<SectionKey, string> = {
  programs: 'Programs',
  courses: 'Courses',
  pos: 'Program Outcomes',
  peos: 'Program Educational Objectives',
  clos: 'Course Learning Outcomes',
}

export interface InventoryInput {
  programs: Program[]
  courses: Course[]
  pos: ProgramOutcomeStandalone[]
  peos: ProgramEducationalObjective[]
  clos: CourseLearningOutcomeStandalone[]
}

export interface InventoryOptions {
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

export interface Inventory {
  sections: InventorySection[]
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
 * Flatten the five lists into inventory sections.
 *
 * Every list is flattened BEFORE the archive and search filters are applied, so
 * the summary can count the full dataset while the tables show what the
 * controls select.
 */
export function buildInventory(input: InventoryInput, options: InventoryOptions = {}): Inventory {
  const { programs, courses, pos, peos, clos } = input
  const includeArchived = options.includeArchived ?? false
  const needle = normalize((options.query ?? '').trim())

  const nameOf = (raw: string | null | undefined, fallback: string | null = '') =>
    text(raw) || text(fallback) || BLANK_NAME

  // ---- flatten ----
  const programRows: InventoryRow[] = [...programs]
    .sort((a, b) => byText(a.code, b.code) || byText(a.name, b.name))
    .map((p) => ({ code: text(p.code), name: nameOf(p.name), status: p.status }))

  const courseRows: InventoryRow[] = [...courses]
    .sort((a, b) => byText(a.code, b.code) || byText(a.title, b.title))
    .map((c) => ({ code: text(c.code), name: nameOf(c.title), status: c.status }))

  const poRows: InventoryRow[] = [...pos]
    .sort(byPoNumber)
    .map((p) => ({ code: text(p.code), name: nameOf(p.title), status: p.status }))

  const peoRows: InventoryRow[] = [...peos]
    .sort((a, b) => byText(a.code, b.code))
    .map((p) => ({ code: text(p.code), name: nameOf(p.title), status: p.status }))

  // Learning outcomes belong to a subject, so they sort by subject first and by
  // code within it — the order the faculty reads them in on the CLO page. The
  // subject is not shown (this is a name list, not the CLO map) but it is the
  // only thing that makes CLO-1 of one course distinguishable from CLO-1 of
  // another, so it decides the order.
  const cloRows: InventoryRow[] = [...clos]
    .sort((a, b) => byText(a.course, b.course) || byText(a.code, b.code))
    .map((c) => ({ code: text(c.code), name: nameOf(c.title, c.description), status: c.status }))

  // ---- filter ----
  // Search matches only the two columns the table shows. Matching a hidden
  // column would return rows whose reason for matching is invisible, which is
  // worse than not matching at all.
  //
  // Archived rows are dropped before the search runs, so the filter never has
  // to know about them.
  const keep = (row: InventoryRow) =>
    (includeArchived || isActive(row)) &&
    (needle === '' ||
      normalize(row.code).includes(needle) ||
      normalize(row.name).includes(needle))

  const built: Record<SectionKey, InventoryRow[]> = {
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
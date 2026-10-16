// Name Inventory: the consolidated list of every named record in the system.
//
// The Curriculum Report and the Subject Graph's About card each answer "what
// does this one subject look like". This answers the other question -- "what is
// actually on the books" -- by flattening the five named lists (programs,
// courses, program outcomes, objectives and learning outcomes) into a single
// shape that the page and the Excel export can both render without needing to
// know which table a row came from.
//
// Pure on purpose: no React, no Supabase. buildInventory() takes plain arrays
// and returns plain sections, which is what the tests read, and it is what lets
// the export write the exact rows the page is showing rather than re-deriving
// them and drifting.

import type {
  ChedMemoOrder,
  Course,
  CourseLearningOutcomeStandalone,
  Program,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../services/database'
import { cmoLabel, isActive, poNumber } from './report'

export type SectionKey = 'programs' | 'courses' | 'pos' | 'peos' | 'clos'

/** One flattened row. `parent`/`note` carry whatever context its section has. */
export interface InventoryRow {
  code: string
  name: string
  /** The record's parent (a course's program, a CLO's course) — often blank. */
  parent: string
  /** Free-form extra column: a description, an alignment, a unit count. */
  note: string | number
  status: string
}

export interface InventorySection {
  key: SectionKey
  title: string
  /** Column headings in order. Length matches what a row renders as. */
  columns: string[]
  rows: InventoryRow[]
}

/**
 * Per-section shape. Declared here rather than at each call site so the page
 * header, the table and the spreadsheet always agree on the column count -- a
 * row can never be longer than the heading above it.
 */
export const SECTION_DEFS: Record<SectionKey, { title: string; columns: string[] }> = {
  programs: {
    title: 'Programs',
    columns: ['No.', 'Code', 'Program Name', 'Description', 'Status'],
  },
  courses: {
    title: 'Courses',
    columns: ['No.', 'Code', 'Course Title', 'Program', 'Units', 'Status'],
  },
  pos: {
    title: 'Program Outcomes',
    columns: ['No.', 'Code', 'Program Outcome', 'Source', 'CMO Alignment', 'Status'],
  },
  peos: {
    title: 'Program Educational Objectives',
    columns: ['No.', 'Code', 'Educational Objective', 'Description', 'Status'],
  },
  clos: {
    title: 'Course Learning Outcomes',
    columns: ['No.', 'Code', 'Course Learning Outcome', 'Course', 'Status'],
  },
}

/** Section order: broad institutional scope down to the per-subject detail. */
export const SECTION_ORDER: SectionKey[] = ['programs', 'peos', 'pos', 'courses', 'clos']

/**
 * Which row field feeds which column, per section — the single source of truth
 * for keeping the header and the body aligned.
 *
 * Sections do NOT share a column layout: learning outcomes have no description
 * column, programs have no parent, courses carry a unit count between the two.
 * A fixed row shape rendered under a fixed header silently shifts every column
 * after the short one, so both the page and the spreadsheet read this map
 * instead of assuming a layout. Its length must always equal the section's
 * column count minus the leading "No." — asserted in nameInventory.test.ts.
 */
const CELL_SOURCES: Record<SectionKey, (keyof InventoryRow)[]> = {
  programs: ['code', 'name', 'note', 'status'],
  courses: ['code', 'name', 'parent', 'note', 'status'],
  pos: ['code', 'name', 'parent', 'note', 'status'],
  peos: ['code', 'name', 'note', 'status'],
  clos: ['code', 'name', 'parent', 'status'],
}

/**
 * One row's cell values, in its section's column order and ready to render.
 * `No.` is not here: it is the row's position, which the caller knows.
 */
export function rowValues(key: SectionKey, row: InventoryRow): (string | number)[] {
  return CELL_SOURCES[key].map((field) => row[field])
}

export interface InventoryInput {
  programs: Program[]
  courses: Course[]
  pos: ProgramOutcomeStandalone[]
  peos: ProgramEducationalObjective[]
  clos: CourseLearningOutcomeStandalone[]
  cmos: ChedMemoOrder[]
}

export interface InventoryOptions {
  /** Archived records are hidden by default, matching every other report here. */
  includeArchived?: boolean
  /** Free-text filter, matched against code, name, parent and note. */
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
const normalize = (v: string | number) =>
  String(v).toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Digits-insensitive string order: PO-2 before PO-10. */
const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Program outcomes sort by their parsed number first, then by code. This is the
 * order the Curriculum Report already uses (utils/report.poNumber), so the two
 * documents list the same outcomes in the same sequence.
 */
const byPoNumber = (
  a: { code: string },
  b: { code: string },
) => poNumber(a.code) - poNumber(b.code) || byText(a.code, b.code)

/**
 * A course's program, resolved to a readable label.
 *
 * fetchCourses() joins program_id, so it usually arrives as an object — but it
 * arrives as a bare id when the join found nothing (an archived program, or one
 * the caller's role cannot read). The id lookup is the fallback so the column
 * shows a name rather than a raw UUID.
 */
export const programLabel = (course: Course, programs: Program[]): string => {
  const raw = course.program_id
  if (raw && typeof raw === 'object') {
    return text([raw.code, raw.name].filter(Boolean).join(' — '))
  }
  return programs.find((p) => p.id === raw)?.name ?? ''
}

/**
 * Flatten the five lists into inventory sections.
 *
 * Every list is flattened BEFORE the archive and search filters are applied, so
 * the summary can count the full dataset while the tables show what the
 * controls select.
 */
export function buildInventory(input: InventoryInput, options: InventoryOptions = {}): Inventory {
  const { programs, courses, pos, peos, clos, cmos } = input
  const includeArchived = options.includeArchived ?? false
  const needle = normalize(options.query ?? '')

  // ---- flatten ----
  const programRows: InventoryRow[] = [...programs]
    .sort((a, b) => byText(a.code, b.code) || byText(a.name, b.name))
    .map((p) => ({
      code: text(p.code),
      name: text(p.name) || '—',
      parent: '',
      note: text(p.description),
      status: p.status,
    }))

  const courseRows: InventoryRow[] = [...courses]
    .sort((a, b) => byText(a.code, b.code) || byText(a.title, b.title))
    .map((c) => ({
      code: text(c.code),
      name: text(c.title) || '—',
      parent: programLabel(c, programs),
      note: c.units ?? '',
      status: c.status,
    }))

  // Manager-authored outcomes keep their CMO category in `description`, so the
  // note column carries the alignment (via the shared cmoLabel rule) rather
  // than a description that is not one.
  const poRows: InventoryRow[] = [...pos]
    .sort(byPoNumber)
    .map((p) => ({
      code: text(p.code),
      name: text(p.title) || '—',
      parent: text(p.source) === 'manager' ? 'Manager' : 'Admin',
      note: cmoLabel(p, cmos),
      status: p.status,
    }))

  const peoRows: InventoryRow[] = [...peos]
    .sort((a, b) => byText(a.code, b.code))
    .map((p) => ({
      code: text(p.code),
      name: text(p.title) || '—',
      parent: '',
      note: text(p.description),
      status: p.status,
    }))

  // Learning outcomes belong to a subject, so they sort by subject first and by
  // code within it — the order the faculty reads them in on the CLO page.
  const cloRows: InventoryRow[] = [...clos]
    .sort((a, b) => byText(a.course, b.course) || byText(a.code, b.code))
    .map((c) => ({
      code: text(c.code),
      name: text(c.title) || text(c.description) || '—',
      parent: text(c.course),
      note: '',
      status: c.status,
    }))

  // ---- filter ----
  // Archived rows are dropped before the search runs, so the filter never has
  // to know about them.
  const keep = (row: InventoryRow) =>
    (includeArchived || isActive(row)) &&
    (needle === '' ||
      normalize(row.code).includes(needle) ||
      normalize(row.name).includes(needle) ||
      normalize(row.parent).includes(needle) ||
      normalize(row.note).includes(needle))

  const visible = <T extends { status?: string }>(rows: InventoryRow[]): InventoryRow[] =>
    rows.filter(keep)

  const built: Record<SectionKey, InventoryRow[]> = {
    programs: programRows,
    courses: courseRows,
    pos: poRows,
    peos: peoRows,
    clos: cloRows,
  }

  const sections = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_DEFS[key].title,
    columns: SECTION_DEFS[key].columns,
    rows: visible(built[key]),
  }))

  // The summary counts the flattened rows, before either filter.
  const summary = SECTION_ORDER.map((key) => {
    const rows = built[key]
    const archived = rows.filter((r) => !isActive(r)).length
    return {
      key,
      title: SECTION_DEFS[key].title,
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
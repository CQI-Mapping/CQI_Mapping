// Word (.docx) generator for the capstone "Gantt chart (Timeline)" sheet.
//
// It mirrors the printed sample the project uses: a centered school header,
// then one table per week — the columns are the week's days (Monday–Sunday),
// the rows are the activities, and every scheduled day is shaded green.
// A 'month' mode is also built in if a block-per-table layout is preferred.
//
// Usage:    npm run gantt   (or: node scripts/generate-gantt-chart.mjs)
// Output:   gantt-chart.docx in the project root.
//
// Everything is derived from the constants below — change START_DATE (the
// Monday of Week 1) or SHEET_MODE and re-run; every heading, column header
// and shaded cell recalculates on its own. Dates are placeholders by design;
// edit them to match the real semester before submitting.
//
// `docx` is a normal dependency here (a build-time script, not app code),
// so a static import is fine — only src/utils/syllabusDocx.ts needs the
// dynamic-import trick to keep the ~450 KB library out of the app bundle.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType, BorderStyle, Document, HeightRule, PageOrientation,
  Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  VerticalAlign, WidthType,
} from 'docx'

// ── Chart configuration ─────────────────────────────────────────────────────
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUTPUT = path.join(ROOT, 'gantt-chart.docx')

const SCHOOL_NAME = 'Northern Bukidnon State College' // header line on the sheet
const START_DATE = '2026-11-09' // Monday that starts Week 1 (placeholder)
const TOTAL_WEEKS = 16          // one semester

// SHEET_MODE picks the table layout:
//   'week'  — one table per week, columns Monday–Sunday (like the printed sample)
//   'month' — one table per 4-week block, columns "Week 1 (Nov 9–15)"...
const SHEET_MODE = 'week'
const WEEKS_PER_BLOCK = 4 // only used when SHEET_MODE = 'month'

const GREEN = '6FCF6F' // the green the sample sheet uses for scheduled cells
const FONT = 'Times New Roman'
const SZ = 20 // half-points -> 10pt body text

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// The plan: [label, first week, last week] — weeks are 1-based over the
// whole 16-week timeline. A sheet lists every activity that touches any
// of its weeks, shaded day by day.
const ACTIVITIES = [
  ['Revised Title', 1, 1],
  ['Identify the Research Problem and Objectives', 1, 3],
  ['Conduct Interviews / Gather Information', 2, 4],
  ['System Design (Database Schema, RLS Policies, Mockups)', 3, 5],
  ['Set Up Backend (Supabase Auth + RLS)', 5, 6],
  ['Develop Login & Role-Based Access', 6, 8],
  ['Develop Admin Module', 7, 9],
  ['Develop Manager Module', 8, 10],
  ['Develop Faculty Module (CLOs, TOS, Syllabus)', 9, 11],
  ['Develop Reports & Exports (PDF, Excel, Word)', 10, 12],
  ['Build Subject Graph (d3)', 12, 13],
  ['Write Documentation (Chapters 1–2)', 11, 14],
  ['Unit Testing + UAT & Bug Fixes', 13, 14],
  ['Write Documentation (Chapters 3–5)', 12, 15],
  ['Prepare PowerPoint Presentation', 15, 16],
  ['Final Presentation (Defense)', 16, 16],
]

// ── Dates ───────────────────────────────────────────────────────────────────
const start = new Date(`${START_DATE}T00:00:00`)
const weekStart = (n) => new Date(start.getTime() + (n - 1) * 7 * 86400000)
const daysFrom = (weekNo) => (weekNo - 1) * 7 // day 0 = Monday of Week 1

/** "Nov 9 – Dec 6" style short range. */
const short = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "Nov 9–15", collapsing the second date when the week stays in one month. */
function weekRange(n) {
  const a = weekStart(n)
  const b = new Date(a.getTime() + 6 * 86400000)
  const ma = a.toLocaleDateString('en-US', { month: 'short' })
  const mb = b.toLocaleDateString('en-US', { month: 'short' })
  return ma === mb
    ? `${ma} ${a.getDate()}–${b.getDate()}`
    : `${short(a)} – ${short(b)}`
}

/** "November 9 – December 6, 2026" for the sheet heading. */
function blockRange(n) {
  const a = weekStart(n)
  const b = new Date(a.getTime() + 6 * 86400000)
  const ma = a.toLocaleDateString('en-US', { month: 'long' })
  const mb = b.toLocaleDateString('en-US', { month: 'long' })
  const y = b.getFullYear()
  return ma === mb
    ? `${ma} ${a.getDate()} – ${b.getDate()}, ${y}`
    : `${ma} ${a.getDate()} – ${mb} ${b.getDate()}, ${y}`
}

// ── Building blocks ─────────────────────────────────────────────────────────
const LINE = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
const CELL_BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE }
const ACTIVITY_PCT = 30 // activities column; the rest is split across columns

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: SZ, ...opts })

const cell = (text, { widthPct, shaded = false, bold = false, center = false } = {}) =>
  new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: shaded ? { type: ShadingType.CLEAR, fill: GREEN, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(text, { bold })],
      }),
    ],
  })

/** Does the activity [firstWeek, lastWeek] cover one column of the sheet? */
function shadesColumn(activity, firstWeek, column) {
  const [, a, b] = activity
  if (SHEET_MODE === 'week') {
    // column is a single day of that week
    const day = daysFrom(firstWeek) + column.dayIndex
    return day >= daysFrom(a) && day <= daysFrom(b) + 6
  }
  return column.weekNo >= a && column.weekNo <= b
}

function sheetChildren(sheetIndex) {
  const first = SHEET_MODE === 'week'
    ? sheetIndex + 1
    : sheetIndex * WEEKS_PER_BLOCK + 1
  const last = Math.min(first + (SHEET_MODE === 'week' ? 0 : WEEKS_PER_BLOCK - 1), TOTAL_WEEKS)

  // Heading, e.g. "WEEK 1  November 9 – 15, 2026" — as on the printed sample
  const label = SHEET_MODE === 'week' ? `WEEK ${first}` : `MONTH ${sheetIndex + 1}`
  const heading = new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [
      run(`${label}  `, { bold: true, size: 22 }),
      run(SHEET_MODE === 'week' ? blockRange(first) : `Weeks ${first}–${last} (${blockRange(first)})`, { bold: true, size: 22 }),
    ],
  })

  const cols = SHEET_MODE === 'week'
    ? DAY_NAMES.map((name, dayIndex) => ({ name, dayIndex }))
    : Array.from({ length: last - first + 1 }, (_, i) => ({
        name: `Week ${first + i} (${weekRange(first + i)})`,
        weekNo: first + i,
      }))
  const COL_PCT = (100 - ACTIVITY_PCT) / cols.length

  // Week-mode column headers: the day name on top with its real calendar
  // date under it — "Monday" over "Nov 9" — so every column is recognisable
  // at a glance without reading the heading.
  const dayColHeader = (c) =>
    new TableCell({
      borders: CELL_BORDERS,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: COL_PCT, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run(DAY_NAMES[c.dayIndex], { bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run(short(new Date(weekStart(first).getTime() + c.dayIndex * 86400000)), { size: 18 })],
        }),
      ],
    })

  const headerRow = new TableRow({
    tableHeader: true,
    height: { value: 620, rule: HeightRule.ATLEAST },
    children: [
      cell('Activities', { widthPct: ACTIVITY_PCT, bold: true, center: true }),
      ...cols.map((c) =>
        SHEET_MODE === 'week'
          ? dayColHeader(c)
          : cell(c.name, { widthPct: COL_PCT, bold: true, center: true })),
    ],
  })

  // Build rows with per-column shading
  const rows = ACTIVITIES
    .filter(([, a, b]) => a <= last && b >= first)
    .map((activity) => new TableRow({
      height: { value: 560, rule: HeightRule.ATLEAST },
      children: [
        cell(activity[0], { widthPct: ACTIVITY_PCT }),
        ...cols.map((c) => cell('', {
          widthPct: COL_PCT,
          shaded: shadesColumn(activity, first, c),
        })),
      ],
    }))

  return [
    heading,
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...rows],
    }),
  ]
}

// ── Document ────────────────────────────────────────────────────────────────
const children = [
  // School header, like the printed sheet: name, thin rule, title
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(SCHOOL_NAME, { size: 28 })],
  }),
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
    children: [run('')],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 120 },
    children: [run('Gantt chart (Timeline)', { bold: true, size: 24 })],
  }),
  new Paragraph({ spacing: { after: 80 }, children: [run('Legend: shaded cell = activity scheduled that day.')] }),
  ...Array.from({ length: sheetCount() }, (_, i) => sheetChildren(i)).flat(),
]

function sheetCount() {
  return SHEET_MODE === 'week' ? TOTAL_WEEKS : Math.ceil(TOTAL_WEEKS / WEEKS_PER_BLOCK)
}

const doc = new Document({
  sections: [{
    properties: {
      page: {
        // A4 landscape, 0.5" margins — wide enough for the day columns
        size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      },
    },
    children,
  }],
})

const buffer = await Packer.toBuffer(doc)
writeFileSync(OUTPUT, buffer)
console.log(`Wrote ${OUTPUT} — ${sheetCount()} sheets (${SHEET_MODE} mode) from ${short(start)}`)

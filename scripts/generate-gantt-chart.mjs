// Word (.docx) generator for the capstone "Gantt chart (Timeline)" sheet.
//
// It mirrors the printed sample the project uses: a centered school header,
// then one table per week — columns are the week's days (day name with its
// calendar date under it), rows are the activities, every scheduled day is
// shaded green.
//
// WEEK 1 starts on the day the project itself started — 2026-08-05, the
// repo's first commit (a Wednesday) — so Week 1 is a short Wednesday–Sunday
// sheet, exactly the way the printed sample opens its timeline. Weeks 2-16
// are full Monday–Sunday sheets, ending Sunday 2026-11-22.
//
// Usage:    npm run gantt   (or: node scripts/generate-gantt-chart.mjs)
// Output:   gantt-chart.docx in the project root.
//
// The whole timeline is derived from the constants below — change
// START_DATE and re-run; every heading, column header and shaded cell
// recalculates on its own.
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
const START_DATE = '2026-08-05' // the day the project started (repo's first commit)
const TOTAL_WEEKS = 16          // one semester

const GREEN = '6FCF6F' // the green the sample sheet uses for scheduled days
const FONT = 'Times New Roman'
const SZ = 20          // half-points -> 10pt body text

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// The plan, in days: [label, first day, last day] — day 0 is the start
// date. A week's sheet lists every activity that touches any of its days,
// shaded day by day.
const ACTIVITIES = [
  ['Revised Title', 0, 2],
  ['Identify the Research Problem and Objectives', 0, 9],
  ['Conduct Interviews / Gather Information', 10, 22],
  ['System Design (Database Schema, RLS Policies, Mockups)', 21, 35],
  ['Set Up Backend (Supabase Auth + RLS)', 31, 43],
  ['Develop Login & Role-Based Access', 37, 49],
  ['Develop Admin Module', 44, 56],
  ['Develop Manager Module', 50, 62],
  ['Develop Faculty Module (CLOs, TOS, Syllabus)', 56, 69],
  ['Develop Reports & Exports (PDF, Excel, Word)', 63, 75],
  ['Build Subject Graph (d3)', 70, 80],
  ['Write Documentation (Chapters 1–2)', 47, 79],
  ['Unit Testing + UAT & Bug Fixes', 76, 88],
  ['Write Documentation (Chapters 3–5)', 80, 95],
  ['Prepare PowerPoint Presentation', 96, 104],
  ['Final Presentation (Defense)', 103, 109],
]

// ── Timeline maths ──────────────────────────────────────────────────────────
// Day 0 is START_DATE. Week 1 runs from START_DATE through the Sunday of
// that same calendar week (so its length depends on the start weekday);
// every later week is a full Monday–Sunday.
const start = new Date(`${START_DATE}T00:00:00`)
const DAY_MS = 86400000
const week1Len = start.getDay() === 0 ? 1 : 8 - start.getDay() // days incl. start through Sunday
const weekOffset = (n) => (n === 1 ? 0 : week1Len + (n - 2) * 7) // day index where week n begins
const weekLen = (n) => (n === 1 ? week1Len : 7)
const endDay = weekOffset(TOTAL_WEEKS) + weekLen(TOTAL_WEEKS) - 1

/** The calendar date of an absolute day on the timeline. */
const dayDate = (day) => new Date(start.getTime() + day * DAY_MS)

/** "Aug 5" / "Nov 22". */
const short = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "Nov 9–15", collapsing the second date when the week stays in one month. */
function weekDates(n) {
  const a = dayDate(weekOffset(n))
  const b = dayDate(weekOffset(n) + weekLen(n) - 1)
  const ma = a.toLocaleDateString('en-US', { month: 'short' })
  const mb = b.toLocaleDateString('en-US', { month: 'short' })
  return ma === mb
    ? `${ma} ${a.getDate()}–${b.getDate()}`
    : `${short(a)} – ${short(b)}`
}

/** "August 5 – 9, 2026" for the sheet heading. */
function headingDates(n) {
  const a = dayDate(weekOffset(n))
  const b = dayDate(weekOffset(n) + weekLen(n) - 1)
  const ma = a.toLocaleDateString('en-US', { month: 'long' })
  const mb = b.toLocaleDateString('en-US', { month: 'long' })
  return ma === mb
    ? `${ma} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
    : `${ma} ${a.getDate()} – ${mb} ${b.getDate()}, ${b.getFullYear()}`
}

// ── Building blocks ─────────────────────────────────────────────────────────
const LINE = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
const CELL_BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE }
const ACTIVITY_PCT = 30 // activities column; the rest is split across day columns

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: SZ, ...opts })

const cell = (text, { widthPct, shaded = false, bold = false, center = false, paras } = {}) =>
  new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: shaded ? { type: ShadingType.CLEAR, fill: GREEN, color: 'auto' } : undefined,
    children: paras ?? [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(text, { bold })],
      }),
    ],
  })

function weekSheet(weekNo) {
  const firstDay = weekOffset(weekNo)
  const days = Array.from({ length: weekLen(weekNo) }, (_, i) => firstDay + i)

  // Heading, e.g. "WEEK 1  August 5 – 9, 2026" — as on the printed sample
  const heading = new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [
      run(`WEEK ${weekNo}  `, { bold: true, size: 22 }),
      run(headingDates(weekNo), { bold: true, size: 22 }),
    ],
  })

  const COL_PCT = (100 - ACTIVITY_PCT) / days.length

  // Column headers: day name on top, its real calendar date under it,
  // e.g. "Monday" over "Nov 9" — recognisable at a glance.
  const headerRow = new TableRow({
    tableHeader: true,
    height: { value: 620, rule: HeightRule.ATLEAST },
    children: [
      cell('Activities', { widthPct: ACTIVITY_PCT, bold: true, center: true }),
      ...days.map((day) => cell('', {
        widthPct: COL_PCT,
        paras: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run(dayDate(day).toLocaleDateString('en-US', { weekday: 'long' }), { bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run(short(dayDate(day)), { size: 18 })],
          }),
        ],
      })),
    ],
  })

  const rows = ACTIVITIES
    // activities active in this week (touching any of its days)
    .filter(([, a, b]) => a <= firstDay + days.length - 1 && b >= firstDay)
    .map(([label, a, b]) => new TableRow({
      height: { value: 560, rule: HeightRule.ATLEAST },
      children: [
        cell(label, { widthPct: ACTIVITY_PCT }),
        ...days.map((day) => cell('', {
          widthPct: COL_PCT,
          shaded: day >= a && day <= b,
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
  ...Array.from({ length: TOTAL_WEEKS }, (_, i) => weekSheet(i + 1)).flat(),
]

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
console.log(`Wrote ${OUTPUT} — ${TOTAL_WEEKS} weekly sheets, ${headingDates(1)} to ${headingDates(TOTAL_WEEKS)}`)

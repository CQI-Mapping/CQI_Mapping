// Word (.docx) generator for the capstone "Gantt chart (Timeline)" sheets.
//
// It mirrors the printed sample the project uses: a centered school header,
// then Gantt tables — rows are the activities, scheduled cells shaded green.
// One run produces BOTH layouts so either can be handed in:
//
//   gantt-chart.docx            — one sheet per week, columns are the week's
//                                 days (day name + real date under it).
//   gantt-chart (by month).docx — one sheet per 4-week month block, columns
//                                 are "Week n (date range)".
//
// WEEK 1 starts on the day the project itself started — 2026-08-05, the
// repo's first commit (a Wednesday) — so Week 1 is a short Wednesday–Sunday
// sheet, exactly the way the printed sample opens its timeline. Weeks 2-16
// are full Monday–Sunday weeks, ending Sunday 2026-11-22.
//
// Usage:    npm run gantt   (or: node scripts/generate-gantt-chart.mjs)
//
// Everything is derived from the constants below — change START_DATE and
// re-run; every heading, column header and shaded cell recalculates.
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

const SCHOOL_NAME = 'Northern Bukidnon State College' // header line on the sheet
const START_DATE = '2026-08-05' // the day the project started (repo's first commit)
const TOTAL_WEEKS = 16          // one semester
const WEEKS_PER_BLOCK = 4       // weeks per sheet in the "by month" layout

const GREEN = '6FCF6F' // the green the sample sheet uses for scheduled days
const FONT = 'Times New Roman'
const SZ = 20          // half-points -> 10pt body text

// The plan, in days, focused purely on BUILDING the system — each row is a
// real module of the CQI app (day 0 is the start date).
const ACTIVITIES = [
  ['Set Up Project (Vite + React + Supabase)', 0, 6],
  ['Design Database Schema & RLS Policies', 5, 14],
  ['Build Authentication & Session Handling', 12, 23],
  ['Build Role-Based Navigation & Page Gating', 19, 29],
  ['Build Admin Module: User & Role Management', 28, 40],
  ['Build Admin Module: Programs, CMOs & Config Tables', 35, 47],
  ['Build Curriculum Records (Create/Edit/Archive/Delete)', 44, 56],
  ['Build CLO Pages & PO Suggestion Input', 51, 62],
  ['Build TOS Generator (Grid, Blueprint, Excel Export)', 57, 69],
  ['Build Syllabus / View Page & Word Export', 64, 75],
  ['Build Subject Graph (d3)', 68, 79],
  ['Build Reports (Map, PO Coverage, PDF/Excel Exports)', 70, 82],
  ['Build Profile, Security & Audit Logs', 75, 88],
  ['UI Polish & Error Handling', 82, 93],
  ['Unit Testing (Vitest) & Bug Fixes', 85, 96],
  ['Deploy to Supabase & Final Demo Prep', 98, 109],
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

/** The calendar date of an absolute day on the timeline. */
const dayDate = (day) => new Date(start.getTime() + day * DAY_MS)

/** "Aug 5" / "Nov 22". */
const short = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Week n's calendar span: "Aug 5–9" / "Aug 31 – Sep 6". */
function weekDates(n) {
  const a = dayDate(weekOffset(n))
  const b = dayDate(weekOffset(n) + weekLen(n) - 1)
  const ma = a.toLocaleDateString('en-US', { month: 'short' })
  const mb = b.toLocaleDateString('en-US', { month: 'short' })
  return ma === mb
    ? `${ma} ${a.getDate()}–${b.getDate()}`
    : `${short(a)} – ${short(b)}`
}

/** "August 5 – August 30, 2026" — a multi-week span for sheet headings. */
function spanDates(firstWeek, lastWeek) {
  const a = dayDate(weekOffset(firstWeek))
  const b = dayDate(weekOffset(lastWeek) + weekLen(lastWeek) - 1)
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

const cell = (paras, { widthPct, shaded = false } = {}) =>
  new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: shaded ? { type: ShadingType.CLEAR, fill: GREEN, color: 'auto' } : undefined,
    children: paras,
  })

/** Simple one-line cell paragraph list. */
const line = (text, { bold = false, center = false, size = SZ } = {}) => [
  new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: text ? [run(text, { bold, size })] : [],
  }),
]

/** One sheet (one table with its heading) of either layout. */
function sheet(mode, sheetIndex) {
  if (mode === 'week') {
    const weekNo = sheetIndex + 1
    const firstDay = weekOffset(weekNo)
    const days = Array.from({ length: weekLen(weekNo) }, (_, i) => firstDay + i)
    const COL_PCT = (100 - ACTIVITY_PCT) / days.length

    return [
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [
          run(`WEEK ${weekNo}  `, { bold: true, size: 22 }),
          run(spanDates(weekNo, weekNo), { bold: true, size: 22 }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            height: { value: 620, rule: HeightRule.ATLEAST },
            children: [
              cell(line('Activities', { bold: true, center: true }), { widthPct: ACTIVITY_PCT }),
              ...days.map((day) => cell([
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(dayDate(day).toLocaleDateString('en-US', { weekday: 'long' }), { bold: true })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(short(dayDate(day)), { size: 18 })] }),
              ], { widthPct: COL_PCT })),
            ],
          }),
          ...ACTIVITIES
            // tasks active this week (touching any of its days)
            .filter(([, a, b]) => a <= firstDay + days.length - 1 && b >= firstDay)
            .map(([label, a, b]) => new TableRow({
              height: { value: 560, rule: HeightRule.ATLEAST },
              children: [
                cell(line(label), { widthPct: ACTIVITY_PCT }),
                ...days.map((day) => cell(line(''), { widthPct: COL_PCT, shaded: day >= a && day <= b })),
              ],
            })),
        ],
      }),
    ]
  }

  // Month mode: one sheet per 4-week block, columns are "Week n" cells
  const firstWeek = sheetIndex * WEEKS_PER_BLOCK + 1
  const lastWeek = Math.min(sheetIndex * WEEKS_PER_BLOCK + WEEKS_PER_BLOCK, TOTAL_WEEKS)
  const blockStart = weekOffset(firstWeek)
  const blockEnd = weekOffset(lastWeek) + weekLen(lastWeek) - 1
  const weeks = Array.from({ length: lastWeek - firstWeek + 1 }, (_, i) => firstWeek + i)
  const COL_PCT = (100 - ACTIVITY_PCT) / weeks.length

  return [
    new Paragraph({
      spacing: { before: 280, after: 120 },
      children: [
        run(`MONTH ${sheetIndex + 1}  `, { bold: true, size: 22 }),
        run(`Weeks ${firstWeek}–${lastWeek} (${spanDates(firstWeek, lastWeek)})`, { bold: true, size: 22 }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          height: { value: 620, rule: HeightRule.ATLEAST },
          children: [
            cell(line('Activities', { bold: true, center: true }), { widthPct: ACTIVITY_PCT }),
            ...weeks.map((w) => cell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`Week ${w}`, { bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(weekDates(w), { size: 18 })] }),
            ], { widthPct: COL_PCT })),
          ],
        }),
        ...ACTIVITIES
          // tasks active anywhere in this block
          .filter(([, a, b]) => a <= blockEnd && b >= blockStart)
          .map(([label, a, b]) => new TableRow({
            height: { value: 560, rule: HeightRule.ATLEAST },
            children: [
              cell(line(label), { widthPct: ACTIVITY_PCT }),
              ...weeks.map((w) => {
                const ws = weekOffset(w)
                const we = ws + weekLen(w) - 1
                // shaded when the task runs on any day of that week
                return cell(line(''), { widthPct: COL_PCT, shaded: ws <= b && we >= a })
              }),
            ],
          })),
      ],
    }),
  ]
}

// ── Document assembly ───────────────────────────────────────────────────────
function buildDocument(mode) {
  const sheetCount = mode === 'week' ? TOTAL_WEEKS : Math.ceil(TOTAL_WEEKS / WEEKS_PER_BLOCK)
  const legend = mode === 'week'
    ? 'Legend: shaded cell = activity scheduled that day.'
    : 'Legend: shaded cell = activity scheduled that week.'

  return new Document({
    sections: [{
      properties: {
        page: {
          // A4 landscape, 0.5" margins — wide enough for the columns
          size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
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
        new Paragraph({ spacing: { after: 80 }, children: [run(legend)] }),
        ...Array.from({ length: sheetCount }, (_, i) => sheet(mode, i)).flat(),
      ],
    }],
  })
}

// ── Write both layouts ──────────────────────────────────────────────────────
const outputs = [
  ['gantt-chart.docx', 'week'],
  ['gantt-chart (by month).docx', 'month'],
]

for (const [name, mode] of outputs) {
  const buffer = await Packer.toBuffer(buildDocument(mode))
  writeFileSync(path.join(ROOT, name), buffer)
  console.log(`Wrote ${name} — ${TOTAL_WEEKS} weeks from ${spanDates(1, 1).split(' ').slice(0, 2).join(' ') || START_DATE}, ${mode} layout`)
}

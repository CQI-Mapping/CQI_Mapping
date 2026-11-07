// Word (.docx) generator for the capstone Gantt sheets.
//
// One run produces THREE layouts from the same task plan, all mirroring
// printed samples the project uses:
//
//   gantt-chart.docx                 — one sheet per week, columns are the
//                                      week's days (day name + real date).
//   gantt-chart (by month).docx      — one sheet per 4-week month block,
//                                      columns are "Week n (date range)".
//   gantt-chart (task tracker).docx  — the NBSC appendix "DAILY TASK TRACKER"
//                                      style: TASK | START | DAYS | END, a
//                                      month timeline ("1st 2nd 3rd 4th"
//                                      quarters per month), tasks grouped
//                                      under teal phase banners, blue cells
//                                      shaded day-by-day.
//
// DAY 0 is the day the project itself started — 2026-08-05, the repo's
// first commit (a Wednesday), so Week 1 is a short Wednesday–Sunday sheet
// and the tracker's AUGUST column starts mid-month. Weeks 2-16 are full
// Monday–Sunday weeks, ending Sunday 2026-11-22.
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
const PROJECT_TITLE = 'Design and Development of a Data-Driven CQI Monitoring System for Curriculum Mapping and Outcomes Alignment' // banner line on the tracker
const START_DATE = '2026-08-05' // the day the project started (repo's first commit)
const TOTAL_WEEKS = 16          // one semester
const WEEKS_PER_BLOCK = 4       // weeks per sheet in the "by month" layout

const GREEN = '6FCF6F' // green the weekly/monthly sheets use for scheduled days
const TEAL = '31859C'  // tracker phase/header banners, as in the printed sample
const BLUE = 'A9D3E5'  // tracker shaded task cells, as in the printed sample
const FONT = 'Times New Roman'
const SZ = 20          // half-points -> 10pt body text

// The plan, in days [first, last], focused purely on BUILDING the system —
// each row is a real module of the CQI app, grouped by build phase
// (day 0 is the start date). banner/shade stay uniform (TEAL/BLUE) to
// match the printed appendix sample's monochrome look.
const PHASES = [
  { title: 'PLANNING PHASE', banner: TEAL, shade: BLUE, tasks: [
    ['Set Up Project (Vite + React + Supabase)', 0, 6],
  ]},
  { title: 'DESIGN AND DEVELOPMENT PHASE', banner: TEAL, shade: BLUE, tasks: [
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
  ]},
  { title: 'TESTING PHASE', banner: TEAL, shade: BLUE, tasks: [
    ['UI Polish & Error Handling', 82, 93],
    ['Unit Testing (Vitest) & Bug Fixes', 85, 96],
  ]},
  { title: 'DEPLOYMENT PHASE', banner: TEAL, shade: BLUE, tasks: [
    ['Deploy to Supabase & Final Demo Prep', 98, 109],
  ]},
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

/** "8/5/2026" — the START/END cell format on the tracker. */
const mdy = (d) => d.toLocaleDateString('en-US')

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

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: SZ, ...opts })

/** Simple one-line cell paragraph list. */
const line = (text, { bold = false, center = false, size = SZ, color, italic = false } = {}) => [
  new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: text ? [run(text, { bold, size, italic, ...(color ? { color } : {}) })] : [],
  }),
]

const cell = (paras, { widthPct, shaded, fill, columnSpan, rowSpan } = {}) =>
  new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: shaded ? { type: ShadingType.CLEAR, fill: shaded, color: 'auto' } : undefined,
    columnSpan,
    rowSpan,
    children: paras,
  })

// ── Week columns layout — one sheet per week, day name + date headers ───────
function weekSheetChildren(sheetIndex) {
  const weekNo = sheetIndex + 1
  const firstDay = weekOffset(weekNo)
  const days = Array.from({ length: weekLen(weekNo) }, (_, i) => firstDay + i)
  const COL_PCT = (100 - 30) / days.length
  const tasksInSheet = PHASES.flatMap((p) => p.tasks)

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
            cell(line('Activities', { bold: true, center: true }), { widthPct: 30 }),
            ...days.map((day) => cell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(dayDate(day).toLocaleDateString('en-US', { weekday: 'long' }), { bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(short(dayDate(day)), { size: 18 })] }),
            ], { widthPct: COL_PCT })),
          ],
        }),
        ...tasksInSheet
          // tasks active this week (touching any of its days)
          .filter(([, a, b]) => a <= firstDay + days.length - 1 && b >= firstDay)
          .map(([label, a, b]) => new TableRow({
            height: { value: 560, rule: HeightRule.ATLEAST },
            children: [
              cell(line(label), { widthPct: 30 }),
              ...days.map((day) => cell(line(''), { widthPct: COL_PCT, shaded: day >= a && day <= b ? GREEN : undefined })),
            ],
          })),
      ],
    }),
  ]
}

// ── Month columns layout — one sheet per 4-week block ───────────────────────
function monthSheetChildren(sheetIndex) {
  const firstWeek = sheetIndex * WEEKS_PER_BLOCK + 1
  const lastWeek = Math.min(sheetIndex * WEEKS_PER_BLOCK + WEEKS_PER_BLOCK, TOTAL_WEEKS)
  const blockStart = weekOffset(firstWeek)
  const blockEnd = weekOffset(lastWeek) + weekLen(lastWeek) - 1
  const weeks = Array.from({ length: lastWeek - firstWeek + 1 }, (_, i) => firstWeek + i)
  const COL_PCT = (100 - 30) / weeks.length
  const tasksInSheet = PHASES.flatMap((p) => p.tasks)

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
            cell(line('Activities', { bold: true, center: true }), { widthPct: 30 }),
            ...weeks.map((w) => cell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`Week ${w}`, { bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(weekDates(w), { size: 18 })] }),
            ], { widthPct: COL_PCT })),
          ],
        }),
        ...tasksInSheet
          // tasks active anywhere in this block
          .filter(([, a, b]) => a <= blockEnd && b >= blockStart)
          .map(([label, a, b]) => new TableRow({
            height: { value: 560, rule: HeightRule.ATLEAST },
            children: [
              cell(line(label), { widthPct: 30 }),
              ...weeks.map((w) => {
                const ws = weekOffset(w)
                const we = ws + weekLen(w) - 1
                // shaded when the task runs on any day of that week
                return cell(line(''), { widthPct: COL_PCT, shaded: ws <= b && we >= a ? GREEN : undefined })
              }),
            ],
          })),
      ],
    }),
  ]
}

// ── Task tracker layout — NBSC appendix style ───────────────────────────────
// Columns: TASK | START | DAYS | END | a month timeline where every month is
// quartered into "1st 2nd 3rd 4th" 7-day blocks; a task shades every quarter
// column its day range touches, giving the diagonal staircase of the sample.
const TASK_PCT = 30, START_PCT = 8, DAYS_PCT = 5, END_PCT = 8

function trackerChildren() {
  // Calendar months the timeline touches, in order: AUGUST … NOVEMBER 2026
  const months = []
  for (let d = 0; d <= endDay; d++) {
    const dt = dayDate(d)
    const key = `${dt.getFullYear()}-${dt.getMonth()}`
    if (!months.some((m) => m.key === key)) {
      months.push({ key, year: dt.getFullYear(), month: dt.getMonth() })
    }
  }
  const COLS = months.length * 4

  /** Quarter column (0..COLS-1) of a calendar date. */
  const colOf = (dt) => {
    const key = `${dt.getFullYear()}-${dt.getMonth()}`
    const mi = months.findIndex((m) => m.key === key)
    const quarter = Math.min(4, Math.ceil(dt.getDate() / 7))
    return mi * 4 + quarter - 1
  }

  const TOTAL_COLS = 4 + COLS
  const QUARTER_PCT = (100 - TASK_PCT - START_PCT - DAYS_PCT - END_PCT) / COLS

  const rows = [
    // Banner: project title, then a teal "DAILY TASK TRACKER" band
    new TableRow({
      height: { value: 420, rule: HeightRule.ATLEAST },
      children: [cell(
        line(PROJECT_TITLE, { bold: true, center: true, italic: true }),
        { columnSpan: TOTAL_COLS, widthPct: 100 },
      )],
    }),
    new TableRow({
      height: { value: 440, rule: HeightRule.ATLEAST },
      children: [cell(
        line('DAILY TASK TRACKER', { bold: true, center: true, italic: true }),
        { columnSpan: TOTAL_COLS, widthPct: 100 },
      )],
    }),
    // Header band: TASK/START/DAYS/END then the year over the month columns
    new TableRow({
      tableHeader: true,
      height: { value: 460, rule: HeightRule.ATLEAST },
      children: [
        cell(line('Task', { bold: true, color: 'FFFFFF', italic: true }), { fill: TEAL, rowSpan: 3, widthPct: TASK_PCT }),
        cell(line('Start', { bold: true, center: true, color: 'FFFFFF', italic: true }), { fill: TEAL, rowSpan: 3, widthPct: START_PCT }),
        cell(line('Days', { bold: true, center: true, color: 'FFFFFF', italic: true }), { fill: TEAL, rowSpan: 3, widthPct: DAYS_PCT }),
        cell(line('End', { bold: true, center: true, color: 'FFFFFF', italic: true }), { fill: TEAL, rowSpan: 3, widthPct: END_PCT }),
        cell(line(String(dayDate(endDay).getFullYear()), { bold: true, size: 16, center: true }), { columnSpan: COLS }),
      ],
    }),
    // Month names, teal band
    new TableRow({
      height: { value: 420, rule: HeightRule.ATLEAST },
      children: months.map((m) =>
        cell(line(
          new Date(m.year, m.month, 1)
            .toLocaleDateString('en-US', { month: 'long' })
            .toUpperCase(),
          { bold: true, center: true, size: 18, color: 'FFFFFF', italic: true },
        ), { columnSpan: 4, fill: TEAL, widthPct: QUARTER_PCT * 4 })),
    }),
    // Quarter cells 1st 2nd 3rd 4th
    new TableRow({
      tableHeader: true,
      height: { value: 380, rule: HeightRule.ATLEAST },
      children: months.map((m) =>
        Array.from({ length: 4 }, (_, q) =>
          cell(line(['1st', '2nd', '3rd', '4th'][q], { bold: true, size: 16, center: true, color: 'FFFFFF' }), {
            fill: TEAL,
            widthPct: QUARTER_PCT,
          }))).flat(),
    }),
  ]

  for (const phase of PHASES) {
    // Colored phase banner across the TASK/START/DAYS/END columns
    rows.push(new TableRow({
      height: { value: 420, rule: HeightRule.ATLEAST },
      children: [
        cell(line(phase.title, { bold: true, color: 'FFFFFF', italic: true, center: true }), { fill: phase.banner, columnSpan: 4 }),
        ...Array.from({ length: COLS }, () => cell(line(''))),
      ],
    }))
    for (const [label, a, b] of phase.tasks) {
      const startCol = colOf(dayDate(a))
      const endCol = colOf(dayDate(b))
      rows.push(new TableRow({
        height: { value: 480, rule: HeightRule.ATLEAST },
        children: [
          cell(line(label)),
          cell(line(mdy(dayDate(a)), { size: 18, center: true })),
          cell(line(String(b - a + 1), { center: true })),
          cell(line(mdy(dayDate(b)), { size: 18, center: true })),
          ...Array.from({ length: COLS }, (_, col) =>
            cell(line(''), {
              fill: col >= startCol && col <= endCol ? phase.shade : undefined,
              widthPct: QUARTER_PCT,
            })),
        ],
      }))
    }
  }

  return [
    // School header, like the printed sheet: name, thin rule, title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(SCHOOL_NAME, { size: 28 })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
      children: [run('')],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
  ]
}

// ── Document assembly ───────────────────────────────────────────────────────
function buildDocument(mode) {
  const banner = (title) => [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(SCHOOL_NAME, { size: 28 })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
      children: [run('')],
    }),
    ...(title ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 120 },
        children: [run(title, { bold: true, size: 24 })],
      }),
    ] : []),
  ]

  const LEGEND = {
    week: 'Legend: shaded cell = activity scheduled that day.',
    month: 'Legend: shaded cell = activity scheduled that week.',
    tracker: 'Legend: shaded cell = activity scheduled that day.', // quarter-7-day blocks, day-precise
  }

  const SHEETS = {
    week: TOTAL_WEEKS,
    month: Math.ceil(TOTAL_WEEKS / WEEKS_PER_BLOCK),
    tracker: 1,
  }
  const SHEET_BUILDERS = { week: weekSheetChildren, month: monthSheetChildren }

  const body = mode === 'tracker' ? trackerChildren() : [
    ...banner(mode === 'week' ? 'Gantt chart (Timeline)' : 'Gantt chart (Timeline)'),
    new Paragraph({ spacing: { after: 80 }, children: [run(LEGEND[mode])] }),
    ...Array.from({ length: SHEETS[mode] }, (_, i) => SHEET_BUILDERS[mode](i)).flat(),
  ]

  return new Document({
    sections: [{
      properties: {
        page: {
          // A4 landscape, 0.5" margins — wide enough for the columns.
          // NOTE: docx swaps width/height itself when orientation is
          // LANDSCAPE, so portrait dimensions are passed here on purpose;
          // giving pre-swapped numbers produces a portrait page by mistake.
          size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: body,
    }],
  })
}

// ── Write all three layouts ─────────────────────────────────────────────────
const outputs = [
  ['gantt-chart.docx', 'week'],
  ['gantt-chart (by month).docx', 'month'],
  ['gantt-chart (task tracker).docx', 'tracker'],
]

for (const [name, mode] of outputs) {
  const buffer = await Packer.toBuffer(buildDocument(mode))
  writeFileSync(path.join(ROOT, name), buffer)
  console.log(`Wrote ${name} — ${mode} layout (${PHASES.reduce((n, p) => n + p.tasks.length, 0)} tasks), ${short(dayDate(0))} to ${short(dayDate(endDay))}`)
}

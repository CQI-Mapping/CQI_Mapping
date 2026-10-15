// Word (.docx) export for the Curriculum Report.
//
// The PDF path rasterises the DOM, which makes it faithful to the screen but
// not editable. Word rebuilds the same document from the same data as real
// Word constructs — paragraphs, tables, borders — so faculty can edit the file
// they hand in. The structure below deliberately mirrors
// components/SyllabusReport.tsx one-for-one; if a section changes there, it
// needs to change here too.
//
// Metrics are taken from the official signed syllabus: Arial 10pt, navy #002060
// for headings, 8.5 x 13in paper, 0.5in margins, letterhead on every page.
//
// `docx` is ~450 KB, so it is imported dynamically below. A static import here
// would drag it into the main bundle and ship it on first paint, to everyone
// who never opens the View page.

import type {
  Paragraph as DocxParagraph,
  Table as DocxTable,
  TableRow as DocxTableRow,
} from 'docx'
import type {
  Course,
  CourseLearningOutcomeStandalone,
  ProgramEducationalObjective,
  StrategicGoal,
} from '../services/database'
import { SCHOOL, DOC_VISION, DOC_MISSION, poLabel, poListItem, goalLine } from './report'
import type { PoGroup } from './report'
import { uniqueResolvedRefs, courseCreditLabel, courseHoursSentence } from './courseCodes'
import { saveBlob, reportFileName } from './download'
import {
  LETTERHEAD_URL,
  LETTERHEAD_ASPECT,
  LETTERHEAD_WIDTH_RATIO,
  headerBandIn,
  pageWidthIn,
} from './letterhead'
import type { ReportOrientation } from './syllabusPdf'

const FONT = 'Arial'
const NAVY = '002060'
const SZ = 20 // half-points -> 10pt, matching the source document

export interface SyllabusDocxData {
  course: Course | null
  courses: Course[]
  goals: StrategicGoal[]
  peos: ProgramEducationalObjective[]
  adminGroups: PoGroup[]
  managerGroups: PoGroup[]
  subjectClos: CourseLearningOutcomeStandalone[]
}

/** "PLO 3, & PLO 10" -> one entry per comma-separated PO. */
const poLines = (v?: string | null) =>
  (v || '').split(',').map((s) => s.trim()).filter(Boolean)

async function fetchLetterhead(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LETTERHEAD_URL)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    // A missing letterhead degrades the document but must not fail the export.
    return null
  }
}

export async function downloadSyllabusDocx(
  data: SyllabusDocxData,
  orientation: ReportOrientation = 'landscape',
): Promise<void> {
  const {
    AlignmentType, BorderStyle, Document, Header, ImageRun, Packer,
    PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun,
    VerticalAlign, WidthType, convertInchesToTwip,
  } = await import('docx')

  type Align = (typeof AlignmentType)[keyof typeof AlignmentType]
  type RunOpts = { bold?: boolean; italics?: boolean; color?: string; align?: Align }

  const run = (text: string, o: RunOpts = {}) =>
    new TextRun({ text, bold: o.bold, italics: o.italics, color: o.color, font: FONT, size: SZ })

  const para = (text: string, o: RunOpts = {}) =>
    new Paragraph({ alignment: o.align ?? AlignmentType.LEFT, spacing: { after: 0 }, children: [run(text, o)] })

  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

  /**
   * docx's WidthType.PERCENTAGE takes a plain 0-100 percentage and scales it
   * internally. Do NOT pre-multiply by 50 — doing so emits w:w="250000" (5000%)
   * and blows every column off the page.
   */
  const pct = (v: number) => ({ size: Math.round(v), type: WidthType.PERCENTAGE })

  const cell = (children: DocxParagraph[], widthPct?: number) =>
    new TableCell({
      borders: CELL_BORDERS,
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      ...(widthPct === undefined ? {} : { width: pct(widthPct) }),
      children,
    })

  const CENTER = AlignmentType.CENTER

  const { course, courses, goals, peos, adminGroups, managerGroups, subjectClos } = data
  const isLandscape = orientation === 'landscape'
  const inch = (v: number) => convertInchesToTwip(v)

  const MARGIN_TWIP = inch(0.5)

  // docx swaps width/height for landscape, so both orientations are declared
  // from the same 8.5 x 13in pair and only the flag differs.
  const pageSize = {
    width: inch(8.5),
    height: inch(13),
    orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
  }

  const children: (DocxParagraph | DocxTable)[] = []

  // The letterhead sits in a real page header (word/header1.xml) so Word
  // repeats it. Its width and the band it occupies come from utils/letterhead.ts
  // so the Word and PDF exports place the artwork identically.
  const pageWIn = pageWidthIn(orientation)
  const bandTwip = Math.round(headerBandIn(pageWIn) * 1440)
  const HEADER_DIST_TWIP = Math.round(0.14 * 1440) // LETTERHEAD_TOP_IN

  const letterhead = await fetchLetterhead()
  const headerChildren: DocxParagraph[] = []
  if (letterhead) {
    // 61% of page width, expressed in the px docx's ImageRun expects.
    const widthPx = Math.round(pageWIn * LETTERHEAD_WIDTH_RATIO * 96)
    headerChildren.push(
      new Paragraph({
        alignment: CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: letterhead,
            transformation: { width: widthPx, height: Math.round(widthPx / LETTERHEAD_ASPECT) },
          }),
        ],
      }),
    )
  }

  // ---- Title block ------------------------------------------------------
  const programText = (c: Course) =>
    typeof c.program_id === 'object' && c.program_id ? c.program_id.name : SCHOOL.program

  children.push(
    para(SCHOOL.title, { bold: true, color: NAVY, align: CENTER }),
    para(SCHOOL.institute, { bold: true, align: CENTER }),
    para(course ? programText(course) : SCHOOL.program, { bold: true, align: CENTER }),
    para(course ? `${course.code} - ${course.title}` : 'No courses yet', {
      bold: true, italics: true, align: CENTER,
    }),
    para(SCHOOL.term, { bold: true, align: CENTER }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  )

  // ---- Vision | Mission | Strategic Goals | PEOs -------------------------
  // Column widths mirror the CSS: 19.5 / 16 / 21 / 43.5.
  children.push(
    new Table({
      width: pct(100),
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell([para('VISION', { bold: true, color: NAVY, align: CENTER })], 19.5),
            cell([para('MISSION', { bold: true, color: NAVY, align: CENTER })], 16),
            cell([para('STRATEGIC GOALS', { bold: true, color: NAVY, align: CENTER })], 21),
            cell([para('PROGRAM EDUCATIONAL OBJECTIVES', { bold: true, color: NAVY, align: CENTER })], 43.5),
          ],
        }),
        new TableRow({
          children: [
            cell([para(DOC_VISION, { align: AlignmentType.JUSTIFIED })], 19.5),
            cell([para(DOC_MISSION, { align: AlignmentType.JUSTIFIED })], 16),
            cell(
              goals.length
                ? goals.map((g) => para(goalLine(g.code, g.description), { italics: true }))
                : [para('No strategic goals.')],
              21,
            ),
            cell(
              peos.length
                ? peos.flatMap((p) =>
                    p.description
                      ? [
                          para(`${p.code.replace(/-/, ' ')}: ${p.title}`, { italics: true }),
                          para(p.description, { italics: true }),
                        ]
                      : [para(`${p.code.replace(/-/, ' ')}: ${p.title}`, { italics: true })],
                  )
                : [para('No PEOs.')],
              43.5,
            ),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  )

  // ---- Program Outcomes (admin, grouped by CMO category) -----------------
  const poRows = [
    new TableRow({
      tableHeader: true,
      children: [cell([para('PROGRAM OUTCOMES', { bold: true, align: CENTER })])],
    }),
    ...(adminGroups.length
      ? adminGroups.map((group, gi) =>
          new TableRow({
            children: [
              cell([
                para(group.heading, { bold: true }),
                ...(gi === 0 ? [para('The NBSC graduates have the ability to:')] : []),
                ...group.items.map((p, i, arr) =>
                  para(poListItem(p.code, p.title, i === arr.length - 1)),
                ),
              ]),
            ],
          }),
        )
      : [new TableRow({ children: [cell([para('No admin program outcomes yet.')])] })]),
  ]
  children.push(new Table({ width: pct(100), rows: poRows }), new Paragraph({ spacing: { after: 120 }, children: [] }))

  // ---- Curriculum Mapping (manager outcomes x PEO / SG alignment) ---------
  if (managerGroups.length > 0) {
    children.push(para('CURRICULUM MAPPING', { bold: true, align: CENTER }))
    const mapRows: DocxTableRow[] = []
    for (const group of managerGroups) {
      mapRows.push(
        new TableRow({
          tableHeader: true,
          children: [
            cell([para(group.heading, { bold: true })]),
            cell([para('Program Educational Objectives', { bold: true, align: CENTER })]),
            cell([para('Strategic Goals', { bold: true, align: CENTER })]),
          ],
        }),
      )
      for (const p of group.items) {
        mapRows.push(
          new TableRow({
            children: [
              // Left blank when unaligned — the source document leaves those
              // cells empty rather than showing a dash.
              cell([para(`${poLabel(p.code)}. ${p.title.replace(/\.$/, '')}`)]),
              cell([para(p.peo_text?.trim() || '')]),
              cell([para(p.sg_text?.trim() || '')]),
            ],
          }),
        )
      }
    }
    children.push(new Table({ width: pct(100), rows: mapRows }), new Paragraph({ spacing: { after: 120 }, children: [] }))
  }

  // ---- Course Learning Outcomes -> Program Outcomes -----------------------
  if (course) {
    const cloRows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell([para('Course Learning Outcomes', { bold: true })]),
          cell([para('Program Outcomes', { bold: true })]),
        ],
      }),
      ...(subjectClos.length
        ? subjectClos.map((c) =>
            new TableRow({
              children: [
                cell([para(`${c.code}: ${c.description}`)]),
                cell(
                  poLines(c.title).length ? poLines(c.title).map((p) => para(p)) : [para('—', { align: CENTER })],
                ),
              ],
            }),
          )
        : [new TableRow({ children: [cell([para('No course learning outcomes for this subject.')]), cell([para('')])] })]),
    ]
    children.push(new Table({ width: pct(100), rows: cloRows }), new Paragraph({ spacing: { after: 120 }, children: [] }))
  }

  // ---- Course Details (I..VIII, mirroring components/CourseDetails.tsx) ----
  children.push(para('COURSE DETAILS', { bold: true, align: CENTER }))
  if (!course) {
    children.push(para('No courses yet — add one on the Course page.'))
  } else {
    const prereqItems = uniqueResolvedRefs(course.prerequisite, courses)
    const coreqItems = uniqueResolvedRefs(course.corequisite, courses)
    const clos = subjectClos.map((c) => ({ id: c.id, code: c.code, text: c.description || '' }))

    const detail = (label: string, value: string) => para(`${label} ${value}`)
    children.push(
      detail('I. Course Code:', course.code),
      detail('II. Course Title:', course.title),
      detail('III. Pre-requisite:', prereqItems.join('; ') || ' '),
      detail('IV. Co-requisite:', coreqItems.join('; ') || ' '),
      detail('V. Credit:', courseCreditLabel(course)),
      para('VI. COURSE DESCRIPTION'),
      para(course.description || 'No description provided for this subject.'),
      para('VII. COURSE LEARNING OUTCOMES'),
      ...(clos.length
        ? clos.map((c) => para(`${c.code}: ${c.text}`))
        : [para('No course learning outcomes for this subject.')]),
      para(`VIII. NUMBER OF HOURS: ${courseHoursSentence(course)}`),
    )
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: SZ } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: pageSize,
            margin: {
              top: bandTwip,
              right: MARGIN_TWIP,
              bottom: MARGIN_TWIP,
              left: MARGIN_TWIP,
              header: HEADER_DIST_TWIP,
            },
          },
        },
        // Word repeats this on every page, matching the signed syllabus.
        ...(headerChildren.length ? { headers: { default: new Header({ children: headerChildren }) } } : {}),
        children,
      },
    ],
  })

  saveBlob(await Packer.toBlob(doc), reportFileName(course?.code ?? 'report', 'docx'))
}
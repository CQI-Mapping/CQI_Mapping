import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { buildReport, COLUMNS } from './reports'
import type { ReportInput } from './reports'
import { buildReportsWorkbook, reportsFileName } from './reportsXlsx'
import type {
  Course,
  CourseLearningOutcomeStandalone,
  Program,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../services/database'

// Serialise the workbook and read it back through SheetJS, so these assertions
// see real cells in a real file rather than the in-memory object. SheetJS is
// still a fine *reader* -- it is only writing styles it cannot do.

const program: Program = {
  id: 'p1',
  code: 'BSIT',
  name: 'Bachelor of Science in Information Technology',
  description: 'The IT program',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
}

const course: Course = {
  id: 'c1',
  code: 'IT21',
  title: 'Object Oriented Programming',
  units: 3,
  credit_lecture: 2,
  credit_laboratory: 1,
  description: null,
  program_id: { id: 'p1', code: 'BSIT', name: 'Information Technology' },
  curriculum_id: null,
  instructor_id: null,
  prerequisite: '',
  corequisite: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const po: ProgramOutcomeStandalone = {
  id: 'o1',
  code: 'PO-1',
  title: 'Articulate and discuss the latest in the field',
  description: null,
  cmo_id: null,
  cmo_text: null,
  peo_id: null,
  peo_text: null,
  sg_id: null,
  sg_text: null,
  source: 'admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const peo: ProgramEducationalObjective = {
  id: 'e1',
  code: 'PEO-1',
  title: 'Produce competent graduates',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const clo: CourseLearningOutcomeStandalone = {
  id: 'l1',
  code: 'CLO-1',
  course: 'IT21',
  title: 'Explain classes and objects',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  programs: [program],
  courses: [course],
  pos: [po],
  peos: [peo],
  clos: [clo],
  ...over,
})

const roundTrip = async (inv: ReturnType<typeof buildReport>) => {
  const wb = await buildReportsWorkbook(inv, 'admin@cqi.test')
  const buf = await wb.xlsx.writeBuffer()
  return XLSX.read(new Uint8Array(buf), { type: 'array' })
}

const HEADER_ROW = 4

const cellAt = (out: XLSX.WorkBook, sheet: string, row: number, col: number) =>
  (out.Sheets[sheet] as XLSX.WorkSheet)[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })]?.v

/** The heading row, read left to right and trimmed of the empty tail. */
const headings = (out: XLSX.WorkBook, sheet: string) => {
  const cells: string[] = []
  for (let c = 0; c < 12; c++) {
    const v = cellAt(out, sheet, HEADER_ROW, c + 1)
    if (v === undefined || v === null || v === '') break
    cells.push(String(v))
  }
  return cells
}

describe('the workbook carries the summary and one worksheet per section', () => {
  it('opens with the summary, then a tab per record type', async () => {
    const out = await roundTrip(buildReport(input()))
    expect(Object.keys(out.Sheets)).toEqual([
      'Summary',
      'Programs',
      'PEOs',
      'Program Outcomes',
      'Courses',
      'Learning Outcomes',
    ])
  })

  // Every section title would fit Excel's 31-character tab limit, so the map is
  // about readable tabs rather than a limit being hit. These assertions pin
  // that down so a future title lengthened past the limit fails here rather
  // than throwing at export time.
  it('uses short tab names, and every one is legal', async () => {
    const out = await roundTrip(buildReport(input()))
    expect(Object.keys(out.Sheets)).toContain('PEOs')
    for (const name of Object.keys(out.Sheets)) {
      expect(name.length).toBeLessThanOrEqual(31)
      expect(name).not.toMatch(/[\\/*?:[\]]/)
    }
  })

  it('records who generated the file', async () => {
    const out = await roundTrip(buildReport(input()))
    expect(String(cellAt(out, 'Programs', 3, 1))).toContain('admin@cqi.test')
  })

  it('names the section on the sheet it belongs to', async () => {
    const out = await roundTrip(buildReport(input()))
    expect(cellAt(out, 'PEOs', 2, 1)).toBe('REPORTS — Program Educational Objectives')
  })
})

describe('the summary sheet counts each record type', () => {
  it('lists a row per section with its active, archived and total', async () => {
    const out = await roundTrip(
      buildReport(
        input({
          peos: [peo, { ...peo, id: 'e2', code: 'PEO-2', status: 'archived' }],
        }),
      ),
    )
    expect(headings(out, 'Summary')).toEqual(['Record Type', 'Active', 'Archived', 'Total'])

    expect(cellAt(out, 'Summary', HEADER_ROW + 1, 1)).toBe('Programs')
    expect(cellAt(out, 'Summary', HEADER_ROW + 1, 4)).toBe(1)

    // Peos is the second section in the summary's order.
    expect(cellAt(out, 'Summary', HEADER_ROW + 2, 1)).toBe('Program Educational Objectives')
    expect(cellAt(out, 'Summary', HEADER_ROW + 2, 2)).toBe(1)
    expect(cellAt(out, 'Summary', HEADER_ROW + 2, 3)).toBe(1)
    expect(cellAt(out, 'Summary', HEADER_ROW + 2, 4)).toBe(2)
  })
})

describe('each worksheet holds a code-and-name list', () => {
  it('writes the same three headings on every sheet', async () => {
    const out = await roundTrip(buildReport(input()))
    for (const sheet of ['Programs', 'PEOs', 'Program Outcomes', 'Courses', 'Learning Outcomes']) {
      expect(headings(out, sheet)).toEqual(['No.', ...COLUMNS])
    }
  })

  // The regression guard for the shared column list. The first version gave
  // each section its own headings, and programs (five columns) rendered under
  // a courses-style body — shifting every cell and leaving an empty bordered
  // column behind.
  it('puts every value under the heading that describes it, on every sheet', async () => {
    const out = await roundTrip(buildReport(input()))

    expect(headings(out, 'Programs')).toHaveLength(3)
    expect(cellAt(out, 'Programs', HEADER_ROW + 1, 1)).toBe(1)
    expect(cellAt(out, 'Programs', HEADER_ROW + 1, 2)).toBe('BSIT')
    expect(cellAt(out, 'Programs', HEADER_ROW + 1, 3)).toBe(program.name)
    // Nothing spilled past the last real column.
    expect(cellAt(out, 'Programs', HEADER_ROW + 1, 4)).toBeUndefined()

    expect(headings(out, 'Courses')).toHaveLength(3)
    expect(cellAt(out, 'Courses', HEADER_ROW + 1, 2)).toBe('IT21')
    expect(cellAt(out, 'Courses', HEADER_ROW + 1, 3)).toBe('Object Oriented Programming')
    expect(cellAt(out, 'Courses', HEADER_ROW + 1, 4)).toBeUndefined()
  })

  // The detail columns are gone by design: the unit count and the resolved
  // program belonged to the Curriculum Report, not to a name list.
  it('does not carry the columns the report dropped', async () => {
    const out = await roundTrip(buildReport(input()))
    const names = ['No.', ...COLUMNS]
    expect(headings(out, 'Courses')).not.toContain('Units')
    expect(headings(out, 'Courses')).not.toContain('Program')
    expect(headings(out, 'Program Outcomes')).not.toContain('CMO Alignment')
    expect(headings(out, 'Courses')).toEqual(names)
  })

  it('numbers rows from 1 as numbers', async () => {
    const out = await roundTrip(
      buildReport(
        input({
          courses: [
            course,
            { ...course, id: 'c2', code: 'IT22', title: 'Systems Integration' },
            { ...course, id: 'c3', code: 'IT23', title: 'Networking 1' },
          ],
        }),
      ),
    )
    expect(cellAt(out, 'Courses', HEADER_ROW + 1, 1)).toBe(1)
    expect(cellAt(out, 'Courses', HEADER_ROW + 3, 1)).toBe(3)
    expect(typeof cellAt(out, 'Courses', HEADER_ROW + 2, 1)).toBe('number')
  })
})

describe('the export matches what the page is showing', () => {
  it('omits archived records, like the on-screen report does', async () => {
    const inv = buildReport(
      input({ peos: [peo, { ...peo, id: 'e2', code: 'PEO-2', status: 'archived' }] }),
    )
    const out = await roundTrip(inv)
    expect(cellAt(out, 'PEOs', HEADER_ROW + 1, 2)).toBe('PEO-1')
    expect(cellAt(out, 'PEOs', HEADER_ROW + 2, 2)).toBeUndefined()
  })

  it('includes them once the include-archived control is on', async () => {
    const inv = buildReport(
      input({ peos: [peo, { ...peo, id: 'e2', code: 'PEO-2', status: 'archived' }] }),
      { includeArchived: true },
    )
    const out = await roundTrip(inv)
    expect(cellAt(out, 'PEOs', HEADER_ROW + 2, 2)).toBe('PEO-2')
  })

  it('honours the search box', async () => {
    const out = await roundTrip(buildReport(input(), { query: 'object oriented' }))
    expect(cellAt(out, 'Courses', HEADER_ROW + 1, 2)).toBe('IT21')
    expect(cellAt(out, 'Programs', HEADER_ROW + 1, 2)).toBeUndefined()
  })
})

describe('an empty section still exports safely', () => {
  it('writes the headings and no rows, and adds no autofilter', async () => {
    const out = await roundTrip(buildReport(input({ pos: [] })))
    expect(headings(out, 'Program Outcomes')).toEqual(['No.', ...COLUMNS])
    expect(cellAt(out, 'Program Outcomes', HEADER_ROW + 1, 1)).toBeUndefined()
    // A stray dropdown on a heading with nothing under it reads as a broken
    // filter control rather than an empty section.
    expect((out.Sheets['Program Outcomes'] as XLSX.WorkSheet)['!autofilter']).toBeUndefined()
  })

  it('adds an autofilter once there are rows to filter', async () => {
    const out = await roundTrip(buildReport(input()))
    const filter = (out.Sheets['Courses'] as XLSX.WorkSheet)['!autofilter']
    expect(filter).toBeDefined()
    // Spans the header row and every data row, across all three columns.
    expect(filter?.ref).toBe('A4:C5')
  })

  it('exports an entirely empty database without throwing', async () => {
    const out = await roundTrip(
      buildReport({ programs: [], courses: [], pos: [], peos: [], clos: [] }),
    )
    expect(Object.keys(out.Sheets)).toHaveLength(6)
  })
})

describe('reportsFileName', () => {
  it('stamps the export date', () => {
    expect(reportsFileName(new Date(2026, 9, 14))).toBe('reports-2026-10-14.xlsx')
  })
})
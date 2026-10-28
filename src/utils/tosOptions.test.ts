import { describe, it, expect } from 'vitest'
import {
  buildProgramOptions,
  buildCourseOptions,
  buildSemesterOptions,
  buildSchoolYearOptions,
  composeTerm,
  splitTerm,
  programIdForLabel,
  programLabel,
  courseLabel,
  relId,
  SEMESTERS,
  SCHOOL_YEAR,
} from './tosOptions'
import type { Course, Program } from '../services/database'

const program = (over: Partial<Program> = {}): Program => ({
  id: 'p1',
  code: 'BSIT',
  name: 'Bachelor of Science in Information Technology',
  description: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  code: 'IT20',
  title: 'Data Structures and Algorithm',
  units: 3,
  credit_lecture: 2,
  credit_laboratory: 1,
  description: null,
  program_id: 'p1',
  curriculum_id: null,
  instructor_id: null,
  prerequisite: '',
  corequisite: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('labels', () => {
  it('joins code and name with a dash, the shape the workbook prints', () => {
    expect(programLabel(program())).toBe('BSIT - Bachelor of Science in Information Technology')
    expect(courseLabel(course())).toBe('IT20 - Data Structures and Algorithm')
  })
})

describe('relId', () => {
  // fetchCourses() embeds the program join, so the same column arrives as an
  // object on a course that came through that select and as a bare uuid on one
  // that did not.
  it('reads a bare uuid', () => {
    expect(relId('p1')).toBe('p1')
  })

  it('reads a resolved join', () => {
    expect(relId({ id: 'p1' })).toBe('p1')
  })

  it('maps null and undefined to empty rather than a literal "null"', () => {
    expect(relId(null)).toBe('')
    expect(relId(undefined)).toBe('')
  })
})

describe('buildProgramOptions', () => {
  it('lists every program', () => {
    const options = buildProgramOptions([program()], '')
    expect(options.map((o) => o.value)).toEqual([
      'BSIT - Bachelor of Science in Information Technology',
    ])
  })

  // The <select> is bound to the stored string. A saved program with no
  // matching option would leave the control on the placeholder and then
  // overwrite the saved value on the next unrelated edit — an archived program,
  // a deleted one, or a value typed before the picker existed.
  it('keeps a saved program that is not listed', () => {
    const options = buildProgramOptions([program()], 'OLD - Retired Program')
    expect(options[0].value).toBe('OLD - Retired Program')
    expect(options).toHaveLength(2)
  })

  it('does not duplicate a saved program that is listed', () => {
    const saved = programLabel(program())
    const options = buildProgramOptions([program()], saved)
    expect(options).toHaveLength(1)
    expect(options[0].value).toBe(saved)
  })

  it('adds nothing for a blank value', () => {
    expect(buildProgramOptions([], '')).toEqual([])
  })
})

describe('buildCourseOptions', () => {
  const bsit = course()
  // A different program, so scoping has something to exclude.
  const bsis = course({
    id: 'c2',
    code: 'IS1',
    title: 'Systems Analysis',
    program_id: 'p2',
  })

  it('scopes courses to the chosen program', () => {
    const options = buildCourseOptions([bsit, bsis], 'p1', '')
    expect(options.map((o) => o.value)).toEqual(['IT20 - Data Structures and Algorithm'])
  })

  it('scopes to the other program just as correctly', () => {
    const options = buildCourseOptions([bsit, bsis], 'p2', '')
    expect(options.map((o) => o.value)).toEqual(['IS1 - Systems Analysis'])
  })

  it('scopes by a resolved join too', () => {
    const joined = course({ program_id: { id: 'p1', code: 'BSIT', name: 'IT' } })
    expect(buildCourseOptions([joined], 'p1', '')).toHaveLength(1)
  })

  // An exam saved before the picker existed has no program to scope by. Listing
  // nothing would make its course unreachable.
  it('lists every course when there is no program to scope by', () => {
    const options = buildCourseOptions([bsit, bsis], '', '')
    expect(options).toHaveLength(2)
  })

  // Changing Program must not silently discard a course the user already
  // picked, so an off-list value survives as its own option.
  it('keeps a saved course that the current program does not offer', () => {
    const options = buildCourseOptions([bsit], 'p1', 'IT99 - Other Program Course')
    expect(options[0].value).toBe('IT99 - Other Program Course')
    expect(options).toHaveLength(2)
  })

  it('does not duplicate a saved course that is listed', () => {
    const saved = courseLabel(bsit)
    expect(buildCourseOptions([bsit], 'p1', saved)).toHaveLength(1)
  })
})

describe('buildSemesterOptions', () => {
  it('offers both semesters', () => {
    expect(buildSemesterOptions('')).toEqual(SEMESTERS)
  })

  it('keeps a saved semester that matches neither', () => {
    const options = buildSemesterOptions('Summer')
    expect(options[0]).toBe('Summer')
    expect(options).toHaveLength(3)
  })

  it('does not duplicate a listed semester', () => {
    expect(buildSemesterOptions(SEMESTERS[0])).toHaveLength(2)
  })
})

describe('buildSchoolYearOptions', () => {
  it('offers the current school year and neighbours', () => {
    const options = buildSchoolYearOptions('')
    expect(options).toContain(SCHOOL_YEAR)
    expect(options.length).toBeGreaterThan(1)
  })

  it('keeps a saved school year that matches none', () => {
    const options = buildSchoolYearOptions('1999-2000')
    expect(options[0]).toBe('1999-2000')
    expect(options.length).toBeGreaterThan(1)
  })

  it('does not duplicate a listed school year', () => {
    expect(buildSchoolYearOptions(SCHOOL_YEAR).filter((y) => y === SCHOOL_YEAR)).toHaveLength(1)
  })
})

describe('composeTerm', () => {
  it('joins semester and school year the way the workbook prints', () => {
    expect(composeTerm('1st Semester', '2026-2027')).toBe('1st Semester, 2026-2027')
    expect(composeTerm('2nd Semester', '2026-2027')).toBe('2nd Semester, 2026-2027')
  })
})

describe('splitTerm', () => {
  it('splits a stored term back into semester and school year', () => {
    expect(splitTerm('1st Semester, 2026-2027')).toEqual({
      semester: '1st Semester',
      schoolYear: '2026-2027',
    })
    expect(splitTerm('2nd Semester, 2026-2027')).toEqual({
      semester: '2nd Semester',
      schoolYear: '2026-2027',
    })
  })

  it('treats a value with no comma as the semester alone', () => {
    expect(splitTerm('Summer')).toEqual({ semester: 'Summer', schoolYear: '' })
  })
})

describe('programIdForLabel', () => {
  it('resolves a label back to its program', () => {
    expect(programIdForLabel([program()], programLabel(program()))).toBe('p1')
  })

  it('returns empty for a label no program matches', () => {
    expect(programIdForLabel([program()], 'OLD - Retired')).toBe('')
  })

  it('returns empty when there are no programs at all', () => {
    expect(programIdForLabel([], 'BSIT - something')).toBe('')
  })
})
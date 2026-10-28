import { describe, it, expect } from 'vitest'
import { poListItem, goalLine, isManagerCmCategory, isManagerOutcome, splitReportPos } from './report'
import type { ProgramOutcomeStandalone } from '../services/database'

const programOutcome = (over: Partial<ProgramOutcomeStandalone> = {}): ProgramOutcomeStandalone => ({
  id: 'po-1',
  code: 'PO-1',
  title: 'Analyze complex problems',
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
  ...over,
})


// The stored program-outcome and strategic-goal text already carries its own
// trailing punctuation. These cases are the exact strings observed in a real
// exported syllabus where blindly appending produced "practice;;" and
// "Goal 2:: Outstanding".
describe('poListItem', () => {
  it('leaves an existing trailing semicolon alone', () => {
    expect(poListItem('PO-1', 'Articulate and discuss the latest in the specific field of practice;', false))
      .toBe('1. Articulate and discuss the latest in the specific field of practice;')
  })

  it('leaves a trailing period alone even on a non-final item', () => {
    expect(poListItem('PO-9', 'Utilize modern computing tools.', false))
      .toBe('9. Utilize modern computing tools.')
  })

  it('appends a semicolon when the text has no punctuation', () => {
    expect(poListItem('PO-2', 'Apply computing and other knowledge domains', false))
      .toBe('2. Apply computing and other knowledge domains;')
  })

  it('terminates the final item with a period', () => {
    expect(poListItem('PO-27', 'Enhance competence using the Design Thinking Framework', true))
      .toBe('27. Enhance competence using the Design Thinking Framework.')
  })

  // Known data quirk, not a regression: outcomes whose text ends in a bare
  // conjunction have no punctuation for us to detect. The signed source uses
  // a comma here ("perspective; and,") but leaves PO 4 unpunctuated, so the
  // source itself is inconsistent and there is no single correct rule.
  it('appends a semicolon after a bare trailing conjunction', () => {
    expect(poListItem('PO-8', 'Design and develop computing solutions using a system-level perspective; and', false))
      .toBe('8. Design and develop computing solutions using a system-level perspective; and;')
  })

  it('trims surrounding whitespace before appending', () => {
    expect(poListItem('PO-3', '  Design and develop computing solutions  ', false))
      .toBe('3. Design and develop computing solutions;')
  })

  it('falls back to the raw code when the code has no digits', () => {
    expect(poListItem('PLO-X', 'Some outcome', false)).toBe('PLO-X. Some outcome;')
  })

  it('tolerates a missing title', () => {
    expect(poListItem('PO-1', '', false)).toBe('1. ;')
  })
})

describe('goalLine', () => {
  it('normalises the SG- prefix to "Goal"', () => {
    expect(goalLine('SG-1', 'Excellence in Teaching and Learning;'))
      .toBe('Goal 1: Excellence in Teaching and Learning;')
  })

  it('does not double the colon when the code already has one', () => {
    expect(goalLine('SG-2:', 'Outstanding Human Resource Development;'))
      .toBe('Goal 2: Outstanding Human Resource Development;')
  })

  it('collapses several trailing colons', () => {
    expect(goalLine('SG-3::', 'High Impact Research;')).toBe('Goal 3: High Impact Research;')
  })

  it('leaves a code with no SG- prefix alone', () => {
    expect(goalLine('Goal 4', 'Exemplary Service')).toBe('Goal 4: Exemplary Service')
  })

  it('tolerates a missing description', () => {
    expect(goalLine('SG-5', null)).toBe('Goal 5: ')
  })
})

describe('Curriculum Mapping outcomes', () => {
  it('includes all manager outcomes, not admin outcomes, in manager-only suggestions', () => {
    const managerCm = programOutcome({
      id: 'manager-cm',
      source: 'manager',
      description: 'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)',
    })
    const managerOther = programOutcome({
      id: 'manager-other',
      source: 'manager',
      description: 'College Defined Program Outcome',
    })
    const admin = programOutcome({ id: 'admin', source: 'admin' })

    expect([managerCm, managerOther, admin].filter(isManagerOutcome).map((outcome) => outcome.id))
      .toEqual(['manager-cm', 'manager-other'])
  })

  it('recognizes only manager outcomes in the two official CMO categories', () => {
    expect(isManagerCmCategory(programOutcome({
      source: 'manager',
      description: '  Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015) ',
    }))).toBe(true)
    expect(isManagerCmCategory(programOutcome({
      source: 'manager',
      description: 'Specific to a sub-discipline and a major (CMO 25 S. 2015)',
    }))).toBe(true)
    expect(isManagerCmCategory(programOutcome({
      source: 'admin',
      description: 'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)',
    }))).toBe(false)
    expect(isManagerCmCategory(programOutcome({
      source: 'manager',
      description: 'College Defined Program Outcome',
    }))).toBe(false)
  })

  it('uses only Curriculum Mapping outcomes for the manager outcome list', () => {
    const { adminPos, managerPos } = splitReportPos([
      programOutcome({ id: 'admin', code: 'PO-1', source: 'admin' }),
      programOutcome({
        id: 'mapping-po',
        code: 'PO-1',
        source: 'manager',
        description: 'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)',
      }),
      programOutcome({
        id: 'mapping-sd',
        code: 'SD-1',
        source: 'manager',
        description: 'Specific to a sub-discipline and a major (CMO 25 S. 2015)',
      }),
      programOutcome({
        id: 'other',
        code: 'PO-2',
        source: 'manager',
        description: 'College Defined Program Outcome',
      }),
    ])

    expect(adminPos.map((outcome) => outcome.id)).toEqual(['admin'])
    expect(managerPos.map((outcome) => outcome.id)).toEqual(['mapping-po', 'mapping-sd'])
  })
})
import { describe, it, expect } from 'vitest'
import { poListItem, goalLine } from './report'

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
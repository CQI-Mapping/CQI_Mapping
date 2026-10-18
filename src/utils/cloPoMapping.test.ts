import { describe, it, expect } from 'vitest'
import {
  anchorKeysOf,
  buildMappingReport,
  chartableOutcomes,
  extractPoCodes,
  matrixRows,
  poLabel,
} from './cloPoMapping'
import type { CourseLearningOutcomeStandalone } from '../services/database'
import type { PoOutcome } from './alignment'

// The fixtures are the real records: the mapping is a list of PO codes typed
// into a learning outcome's title, because nothing writes to clo_po_matrix.

const clo = (
  over: Partial<CourseLearningOutcomeStandalone> = {},
): CourseLearningOutcomeStandalone => ({
  id: 'l1',
  code: 'CLO1',
  course: 'IT21',
  title: 'PO-12, PO-6',
  description: null,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...over,
})

const outcome = (over: Partial<PoOutcome> = {}): PoOutcome => ({
  key: 'PO1',
  code: 'PO 1',
  spellings: ['PO 1'],
  title: 'Apply knowledge of computing',
  status: 'active',
  rowCount: 1,
  cmo: [],
  peo: [],
  sg: [],
  ...over,
})

const outcomes = [
  outcome(),
  outcome({ key: 'PO6', code: 'PO-6', title: 'Second' }),
  outcome({ key: 'PO8', code: 'PO 8', title: 'Third' }),
  outcome({ key: 'PO12', code: 'PO-12', title: 'Fourth' }),
  outcome({ key: 'PO14', code: 'PO 14', title: 'Fifth' }),
]

describe('extractPoCodes', () => {
  it('reads the comma-separated list out of a title', () => {
    expect(extractPoCodes('PO-12, PO-6')).toEqual(['PO12', 'PO6'])
  })

  it('folds the spellings together, so PO-12 and PO 12 are one', () => {
    expect(extractPoCodes('PO-12')).toEqual(extractPoCodes('PO 12'))
  })

  it('deduplicates a code named twice', () => {
    expect(extractPoCodes('PO-1 and again PO 1')).toEqual(['PO1'])
  })

  // The point of matching PO<number> and nothing else: ordinary prose about a
  // course or a document must not manufacture a mapping.
  it('ignores anything that is not a PO followed by a number', () => {
    expect(extractPoCodes('Introduced in PO Box theory, see P.O. Box')).toEqual([])
    expect(extractPoCodes(null)).toEqual([])
    expect(extractPoCodes('')).toEqual([])
  })
})

describe('buildMappingReport', () => {
  it('resolves a title list to outcomes, across code spellings', () => {
    const report = buildMappingReport([clo()], outcomes)
    expect(report.links[0].poKeys).toEqual(['PO12', 'PO6'])
    expect(report.unresolvedCodes).toEqual([])
  })

  it('counts a learning outcome once no matter how many outcomes it names', () => {
    const report = buildMappingReport([clo()], outcomes)
    expect(report.totalClos).toBe(1)
    expect(report.mappedClos).toBe(1)
    expect(report.coveragePercent).toBe(100)
  })

  it('reports a code that names no outcome separately, rather than counting it', () => {
    const report = buildMappingReport([clo({ title: 'PO-12, PO-99' })], outcomes)
    expect(report.links[0].poKeys).toEqual(['PO12'])
    expect(report.unresolvedCodes).toEqual(['PO99'])
    // The unresolved code still counts as mapped -- something was claimed -- but
    // it is named in the report rather than silently dropped.
    expect(report.mappedClos).toBe(1)
  })

  it('measures each outcome against all the learning outcomes', () => {
    const report = buildMappingReport(
      [clo(), clo({ id: 'l2', code: 'CLO2', title: 'PO-8, PO-14' }), clo({ id: 'l3', code: 'CLO3', title: '' })],
      outcomes,
    )
    // PO-12 and PO-6 are named by one of three outcomes.
    expect(report.coverage.find((r) => r.outcome.key === 'PO12')?.percent).toBe(33)
    expect(report.coverage.find((r) => r.outcome.key === 'PO14')?.percent).toBe(33)
    expect(report.coverage.find((r) => r.outcome.key === 'PO1')?.percent).toBe(0)
    expect(report.coveragePercent).toBe(66.7)
  })

  it('also reads a description that names outcomes', () => {
    const report = buildMappingReport([clo({ title: '', description: 'Supports PO-6' })], outcomes)
    expect(report.links[0].poKeys).toEqual(['PO6'])
  })

  it('lists the learning outcomes that name nothing as gaps', () => {
    const report = buildMappingReport([clo(), clo({ id: 'l2', title: 'Not mapped yet' })], outcomes)
    expect(report.gaps.map((g) => g.clo.id)).toEqual(['l2'])
  })

  it('handles an empty system without dividing by zero', () => {
    const report = buildMappingReport([], [])
    expect(report.coveragePercent).toBe(0)
    expect(report.coverage).toEqual([])
    expect(report.gaps).toEqual([])
  })
})

describe('chartableOutcomes', () => {
  it('charts the covered outcomes and counts the ones nothing reaches', () => {
    const report = buildMappingReport([clo()], outcomes)
    const { rows, uncovered } = chartableOutcomes(report)
    // In outcome order, which is parsed-number order: PO 6 before PO 12.
    expect(rows.map((r) => r.outcome.key)).toEqual(['PO6', 'PO12'])
    expect(uncovered).toBe(3)
  })

  it('caps the bars and says how many it left out', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      outcome({ key: `PO${i + 1}`, code: `PO-${i + 1}` }),
    )
    const clos = many.map((o) => clo({ id: o.key, title: o.code }))
    const { rows, hidden } = chartableOutcomes(buildMappingReport(clos, many), 8)
    expect(rows).toHaveLength(8)
    expect(hidden).toBe(12)
  })
})

describe('poLabel', () => {
  it('presents both spellings one way, so a family reads under a single name', () => {
    expect(poLabel('PO 12')).toBe('PO 12')
    expect(poLabel('PO-14')).toBe('PO 14')
  })
})

describe('matrixRows', () => {
  it('gives a learning outcome naming nothing a row of dashes, not a missing row', () => {
    const report = buildMappingReport([clo(), clo({ id: 'l2', title: 'Not mapped' })], outcomes)
    const rows = matrixRows(report, () => 'IT21')
    expect(rows).toHaveLength(2)
    expect(rows[0].poKeys).toEqual(['PO12', 'PO6'])
    expect(rows[1].poKeys).toEqual([])
    expect(rows[0].courseCode).toBe('IT21')
  })
})

describe('anchorKeysOf', () => {
  it('lists only the outcomes that are actually mapped, in code order', () => {
    const report = buildMappingReport([clo()], outcomes)
    // Parsed-number order, so PO 6 comes before PO 12 rather than after it.
    expect(anchorKeysOf(report)).toEqual(['PO6', 'PO12'])
  })

  it('is empty when nothing is mapped', () => {
    expect(anchorKeysOf(buildMappingReport([clo({ title: '' })], outcomes))).toEqual([])
  })
})

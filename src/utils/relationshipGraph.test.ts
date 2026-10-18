import { describe, expect, it } from 'vitest'
import { buildRelationshipGraph, familyCounts, isolatedNodes } from './relationshipGraph'
import { poOutcomes } from './alignment'
import type {
  CourseLearningOutcomeStandalone,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
  StrategicGoal,
} from '../services/database'
import { buildMappingReport } from './cloPoMapping'

// The same shapes the live data holds: 44 program outcome rows collapse to a
// handful of outcomes, learning outcomes carry their mapping in the title,
// and document alignment is free text.
const outRow = (id: string, code: string, peo = '', sg = ''): ProgramOutcomeStandalone => ({
  id,
  code,
  title: `${code} outcome`,
  status: 'active',
  peo_text: peo,
  sg_text: sg,
  cmo_id: null,
  cmo_text: null,
} as unknown as ProgramOutcomeStandalone)

const cloRow = (id: string, code: string, title: string): CourseLearningOutcomeStandalone => ({
  id,
  code,
  title,
  description: null,
  course: 'IT21',
} as unknown as CourseLearningOutcomeStandalone)

const peos: ProgramEducationalObjective[] = [
  { id: 'p1', code: 'PEO 1', title: 'Professional competence' },
  { id: 'p2', code: 'PEO 2', title: 'Communication' },
] as unknown as ProgramEducationalObjective[]

const goals: StrategicGoal[] = [
  { id: 'g1', code: 'Goal 1', title: 'Quality education' },
  { id: 'g2', code: 'Goal 2', title: 'Industry linkage' },
] as unknown as StrategicGoal[]

// Two outcomes, both aligned: "PO 1" -> PEO 1 +Goal 1, "PO-2" -> PEO 2 only.
const rows = [
  outRow('r1', 'PO 1', 'PEO 1', 'Goal 1'),
  outRow('r2', 'PO-2', 'PEO 2', ''),
]
const outcomes = poOutcomes(rows, [
  { family: 'peo', id: 'p1', code: 'PEO 1', title: null },
  { family: 'peo', id: 'p2', code: 'PEO 2', title: null },
  { family: 'sg', id: 'g1', code: 'Goal 1', title: null },
  { family: 'sg', id: 'g2', code: 'Goal 2', title: null },
])

describe('buildRelationshipGraph', () => {
  const graph = buildRelationshipGraph({
    clos: [cloRow('c1', 'CLO1', 'PO 1'), cloRow('c2', 'CLO2', 'PO-1, PO-2')],
    outcomes,
    peos,
    goals,
    mapping: buildMappingReport(
      [cloRow('c1', 'CLO1', 'PO 1'), cloRow('c2', 'CLO2', 'PO-1, PO-2')],
      outcomes,
    ),
  })

  it('one node per family member, folding spellings and stray punctuation', () => {
    expect(familyCounts(graph)).toEqual({ clo: 2, po: 2, peo: 2, sg: 2 })
    // "Goal 1" and "Goal 2" are entered with the same key the anchors use,
    // whatever the title rendering does with the interval-variant spelling.
    expect(graph.nodes.find((n) => n.family === 'sg')?.code).toBe('Goal 1')
  })

  it('joins a learning outcome straight to the program outcomes it names', () => {
    expect(graph.edges.filter((e) => e.source === 'clo:c1')).toEqual([
      { source: 'clo:c1', target: 'po:PO1' },
    ])
    expect(graph.edges.filter((e) => e.source === 'clo:c2')).toHaveLength(2)
  })

  it('joins a program outcome to the documents its alignment records', () => {
    expect(
      graph.edges.filter((e) => e.target === 'peo:PEO1'),
    ).toEqual([{ source: 'po:PO1', target: 'peo:PEO1' }])
    expect(graph.edges.filter((e) => e.target === 'sg:GOAL1')).toEqual([
      { source: 'po:PO1', target: 'sg:GOAL1' },
    ])
    // PO-2 has no goal alignment and so must not invent a line into it.
    expect(graph.edges.filter((e) => e.source === 'po:PO2' && e.target.startsWith('sg:'))).toHaveLength(0)
  })

  it('keeps an unlinked learning outcome as an isolated node, not a hole', () => {
    const lonely = buildRelationshipGraph({
      ...({
        clos: [cloRow('c3', 'CLO3', 'No mapping here')],
        outcomes,
        peos,
        goals,
        mapping: buildMappingReport([cloRow('c3', 'CLO3', 'No mapping here')], outcomes),
      }),
    })
    expect(lonely.edges.filter((e) => e.source === 'clo:c3')).toHaveLength(0)
    expect(isolatedNodes(lonely).has('clo:c3')).toBe(true)
  })

  it('does not draw duplicated lines for repeated pairs', () => {
    // The same CLO linked from two spellings still resolves to one edge: the
    // mapping already deduplicates by key, and the graph deduplicates the pairs.
    const dupes = graph.edges.filter((e) => e.source === 'clo:c2' && e.target === 'po:PO1')
    expect(dupes).toHaveLength(1)
  })
})

describe('isolatedNodes', () => {
  // Outcomes that name no document and no learning outcome: the whole graph
  // stands unconnected and every node is its own island.
  const bare = poOutcomes([outRow('r1', 'PO 1'), outRow('r2', 'PO-2')], [])
  const graph = buildRelationshipGraph({
    clos: [],
    outcomes: bare,
    peos,
    goals,
    mapping: buildMappingReport([], bare),
  })

  it('is everything when nothing connects anything', () => {
    expect(familyCounts(graph)).toEqual({ clo: 0, po: 2, peo: 2, sg: 2 })
    expect(isolatedNodes(graph).size).toBe(graph.nodes.length)
  })
})

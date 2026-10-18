// The outcomes relationship network: everything the report connects.
//
// The matrix showed one slice of this -- which learning outcome names which
// program outcome -- as a table of ticks. The network panel needs the whole
// shape instead: nodes for the four outcome families, edges for the
// relationships actually recorded, in whatever combination the data holds.
//
// Node families:
//
//   - CLO, from the standalone learning outcome records. A learning outcome
//     that names no program outcome keeps its node: a report that hid the
//     unmapped would be a report that lied.
//
//   - PO, one node per deduplicated outcome (the same anchor-key fold the
//     matrix uses), so "PO-12"/"PO 12" is one node however many spellings
//     entered it into the database.
//
//   - PEO and Strategic Goal, one node per record, keyed by the same
//     punctuation-insensitive fold -- which is why "Goal 2:" (the stray
//     colon in the database) reaches the same node as "Goal 2".
//
// Edges, all of them real entries read out of the database, nothing invented:
//
//   - CLO -> PO, from the learning outcome's own title text, already
//     resolved and deduplicated by the mapping report. A code that names no
//     outcome on file has no node to point at, so it produces no line here
//     (the unresolved list reports those books elsewhere).
//
//   - PO -> PEO and PO -> Strategic Goal, from the alignment rows: a free
//     text list that poOutcomes() has already parsed and matched against the
//     institutional documents on file, so a token that names nothing was
//     dropped before this function was ever called.
//
// Pure, like the rest of the report's data layer: plain arrays in, nodes and
// edges out, ordered consistently so the layout isn't reshuffled between
// screens.

import type {
  CourseLearningOutcomeStandalone,
  ProgramEducationalObjective,
  StrategicGoal,
} from '../services/database'
import type { PoOutcome } from './alignment'
import { anchorKey } from './alignment'
import type { MappingReport } from './cloPoMapping'

/** The four families of outcomes the network draws. */
export type NetworkFamily = 'clo' | 'po' | 'peo' | 'sg'

/** One outcome in the graph, labelled by its code and named by its title. */
export interface GraphNode {
  id: string
  family: NetworkFamily
  /** The label the graph draws: a code, kept short on purpose. */
  code: string
  /** What the code stands for, shown on hover. */
  title: string
}

/** One relationship between two nodes, in real ids not node references. */
export interface GraphEdge {
  source: string
  target: string
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Every node and every recorded relationship the report's data can reach.
 *
 * Nodes stay complete -- unmapped outcomes included -- while edges only run
 * between entries that actually exist, because a line into nothing would be
 * worse than the gap it papers over. Edges are deduplicated by pair, since
 * two outcome rows written as two spellings collapse to one node and would
 * otherwise repeat this graph's lines.
 */
export function buildRelationshipGraph(input: {
  clos: CourseLearningOutcomeStandalone[]
  outcomes: PoOutcome[]
  peos: ProgramEducationalObjective[]
  goals: StrategicGoal[]
  mapping: MappingReport
}): RelationshipGraph {
  const nodes: GraphNode[] = []
  const byId = new Set<string>()
  const push = (id: string, family: NetworkFamily, code: string, title: string) => {
    if (byId.has(id)) return
    byId.add(id)
    nodes.push({ id, family, code, title })
  }

  for (const clo of input.clos) {
    push(
      `clo:${clo.id}`,
      'clo',
      (clo.code || '').trim() || '—',
      (clo.title || clo.description || '').trim(),
    )
  }
  for (const o of input.outcomes) {
    push(`po:${o.key}`, 'po', o.code, o.title)
  }
  for (const p of input.peos) {
    const key = anchorKey(p.code)
    if (key) push(`peo:${key}`, 'peo', (p.code || '').trim(), (p.title || '').trim())
  }
  for (const g of input.goals) {
    const key = anchorKey(g.code)
    if (key) push(`sg:${key}`, 'sg', (g.code || '').trim(), (g.title || '').trim())
  }

  // CLO -> PO, the mapping as entered on the learning outcome itself.
  const edges: GraphEdge[] = []
  for (const link of input.mapping.links) {
    for (const key of link.poKeys) {
      if (byId.has(`po:${key}`)) {
        edges.push({ source: `clo:${link.clo.id}`, target: `po:${key}` })
      }
    }
  }

  // PO -> PEO and PO -> Strategic Goal, the anchors each outcome records.
  // The tokens were matched against the documents on file upstream, so every
  // surviving one has a node here; the has() check only guards the identity
  // rule, which a blank document code would otherwise break.
  for (const o of input.outcomes) {
    for (const code of o.peo) {
      const id = `peo:${anchorKey(code)}`
      if (byId.has(id)) edges.push({ source: `po:${o.key}`, target: id })
    }
    for (const code of o.sg) {
      const id = `sg:${anchorKey(code)}`
      if (byId.has(id)) edges.push({ source: `po:${o.key}`, target: id })
    }
  }

  const seen = new Set<string>()
  return {
    nodes,
    edges: edges.filter((e) => {
      const pair = `${e.source}|${e.target}`
      if (seen.has(pair)) return false
      seen.add(pair)
      return true
    }),
  }
}

/** How full each family's corner of the graph is, for the legend. */
export function familyCounts(graph: RelationshipGraph): Record<NetworkFamily, number> {
  const counts: Record<NetworkFamily, number> = { clo: 0, po: 0, peo: 0, sg: 0 }
  for (const node of graph.nodes) counts[node.family] += 1
  return counts
}

/** Nodes nothing links to -- the graph's own "unmapped" finding. */
export function isolatedNodes(graph: RelationshipGraph): Set<string> {
  const connected = new Set<string>()
  for (const edge of graph.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  return new Set(graph.nodes.filter((n) => !connected.has(n.id)).map((n) => n.id))
}

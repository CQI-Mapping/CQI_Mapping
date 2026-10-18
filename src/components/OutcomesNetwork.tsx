// The outcomes relationship network: a force-directed graph of how the
// program's outcome families are actually connected.
//
// d3-force works out the positions -- things that are linked pull together --
// and the panel renders the settled result. The simulation runs to rest
// synchronously rather than animating tick by tick, because this is a report,
// not a toy: reload the page and you get the same graph, not a fresh physics
// experiment.
//
// Families anchor to their own corners -- learning outcomes left, program
// outcomes centre, PEOs upper right, strategic goals lower right -- with a
// gentle pull that keeps the families legible without overriding the links,
// which are the real layout engine here: nodes travel where their
// relationships pull them, and only fall back to their corner when nothing
// ties them.
//
// A node nothing connects to is drawn hollow: the matrix's "no mapping" row
// translated into a picture. Dropping it would make the network look fuller
// than the curriculum is.

import { useMemo } from 'react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3'
import type { SimulationNodeDatum } from 'd3'
import { familyCounts, isolatedNodes } from '../utils/relationshipGraph'
import type { GraphNode, NetworkFamily, RelationshipGraph } from '../utils/relationshipGraph'

const W = 560
const H = 330

/**
 * Per family: colour (shared with the donut's, so the two chart panels read
 * as one system), dot radius, and the corner its nodes start from. Initial
 * positions matter for more than looks: the simulation starts there, so a
 * deterministic corner is part of the deterministic layout.
 */
const FAMILIES: Record<NetworkFamily, { color: string; label: string; legend: string; r: number; anchor: [number, number] }> = {
  clo: { color: '#0891b2', label: 'Learning outcome', legend: 'Learning outcomes', r: 9, anchor: [72, 168] },
  po: { color: '#15803d', label: 'Program outcome', legend: 'Program outcomes', r: 6.5, anchor: [286, 168] },
  peo: { color: '#4d9a2f', label: 'PEO', legend: 'PEOs', r: 8, anchor: [484, 84] },
  sg: { color: '#3b82f6', label: 'Strategic goal', legend: 'Strategic goals', r: 8, anchor: [484, 254] },
}

/** Deterministic scatter inside a family's corner -- index-based, never random. */
const JITTER: Array<[number, number]> = [
  [0, 0],
  [4, -9],
  [-7, 6],
  [10, 5],
  [-4, -12],
  [7, 13],
  [-11, -4],
  [13, -7],
]

type SimNode = GraphNode & SimulationNodeDatum

/** Solved position of one node, rounded so the DOM holds steady numbers. */
interface Place {
  x: number
  y: number
}

/**
 * The reach a link settles at: learning outcomes reach across the layout to
 * their program outcomes, while the anchors on the right sit nearer one
 * another. Distance is decided per family pair, up front, so the accessors
 * never have to inspect the raw edge mid-layout.
 */
function edgeDistance(sourceId: string, targetId: string): number {
  const family = (id: string) => (id.split(':')[0] ?? 'po') as NetworkFamily
  const crossed = family(sourceId) === 'clo' || family(targetId) === 'clo'
  return crossed ? 74 : 54
}

function OutcomesNetwork({ graph }: { graph: RelationshipGraph }) {
  const isolated = useMemo(() => isolatedNodes(graph), [graph])
  const counts = useMemo(() => familyCounts(graph), [graph])

  const solved = useMemo<Array<GraphNode & Place>>(() => {
    if (graph.nodes.length === 0) return []

    // Start each node at its family's corner with the fixed scatter, so both
    // the starting frame and the run that follows are reproducible.
    const nodes: SimNode[] = graph.nodes.map((n, i) => ({
      ...n,
      x: FAMILIES[n.family].anchor[0] + JITTER[i % JITTER.length][0],
      y: FAMILIES[n.family].anchor[1] + JITTER[i % JITTER.length][1],
    }))

    const simEdges = graph.edges.map((e) => ({
      ...e,
      d: edgeDistance(e.source, e.target),
    }))

    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, { source: string; target: string; d: number }>()
          .id((n) => n.id)
          .links(simEdges)
          .distance((e) => e.d)
          .strength(0.35),
      )
      .force('charge', forceManyBody<SimNode>().strength(-170))
      .force('x', forceX<SimNode>((n) => FAMILIES[n.family].anchor[0]).strength(0.05))
      .force('y', forceY<SimNode>((n) => FAMILIES[n.family].anchor[1]).strength(0.09))
      .force('collide', forceCollide<SimNode>((n) => FAMILIES[n.family].r + 8).iterations(2))
      .stop()

    // Run to rest. 320 ticks is enough for 560x330 to stop moving; the
    // positions after that are the picture, taken once.
    for (let i = 0; i < 320; i++) sim.tick()

    return graph.nodes.map((n) => {
      const l = nodes.find((s) => s.id === n.id)
      return {
        ...n,
        x: Math.round(l?.x ?? FAMILIES[n.family].anchor[0]),
        y: Math.round(l?.y ?? FAMILIES[n.family].anchor[1]),
      }
    })
  }, [graph])

  const at = useMemo(() => new Map(solved.map((n) => [n.id, n])), [solved])

  if (solved.length === 0) return null

  return (
    <div className="onet">
      <svg
        className="onet__chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Outcome relationship network: ${solved.length} nodes joined by ${graph.edges.length} lines`}
      >
        {graph.edges.map((e) => {
          const source = at.get(e.source)
          const target = at.get(e.target)
          if (!source || !target) return null
          return (
            <line
              key={`${e.source}|${e.target}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              className="onet__edge"
            />
          )
        })}
        {solved.map((n) => {
          const meta = FAMILIES[n.family]
          return (
            <g
              key={n.id}
              className={isolated.has(n.id) ? 'onet__node onet__node--isolated' : 'onet__node'}
              transform={`translate(${n.x} ${n.y})`}
            >
              <circle r={meta.r}>
                <title>{`${meta.label}: ${n.title || n.code}`}</title>
              </circle>
              <text className="onet__label" y={meta.r + 11} textAnchor="middle">
                {n.code}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="onet__legend">
        {(Object.keys(FAMILIES) as NetworkFamily[]).map((family) => (
          <li className="onet__item" key={family}>
            <span className="onet__dot" style={{ background: FAMILIES[family].color }} />
            <span className="onet__name">{FAMILIES[family].legend}</span>
            <span className="onet__count">{counts[family]}</span>
          </li>
        ))}
        {isolated.size > 0 && (
          <li className="onet__item">
            <span className="onet__dot onet__dot--isolated" />
            <span className="onet__name">Not connected</span>
            <span className="onet__count">{isolated.size}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

export default OutcomesNetwork

// How many program outcomes reach each institutional document.
//
// Hand-rolled SVG: a dozen rects and some gridlines do not justify a chart
// library, and a bar chart has no layout to simulate. The one d3 chart in the
// app is the Subject Graph, which needs d3 because it simulates a force layout.
//
// The bars deliberately do not sum to 100. An outcome aligned to two CHED
// memoranda is aligned to both, and forcing the set to total would mean either
// dropping one alignment or inventing a share per alignment that does not exist.
// The caption under the chart says so, because a reader who assumes a part-to-
// whole will misread the whole chart.

import type { AnchorTally } from '../utils/alignment'
import { FAMILY_LABELS } from '../utils/alignment'

/** Chart box, in viewBox units. */
const WIDTH = 560
const HEIGHT = 250
const LEFT = 40
const RIGHT = 8
const TOP = 26
const BOTTOM = 34
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

const GRID = [0, 25, 50, 75, 100]
const BAR_RX = 5

interface OutcomeBarsProps {
  data: AnchorTally[]
  /** Outcomes in the denominator, so the caption can name it. */
  outcomes: number
}

/** A short label that still tells two memoranda apart: "CMO 46 s. 2012" fits. */
const label = (code: string) => (code.length > 14 ? `${code.slice(0, 13)}…` : code)

function OutcomeBars({ data, outcomes }: OutcomeBarsProps) {
  const n = data.length
  const slot = n === 0 ? PLOT_W : PLOT_W / n
  const barW = Math.min(slot * 0.55, 44)
  const y = (percent: number) => TOP + PLOT_H - (PLOT_H * percent) / 100

  // Family colour: each family keeps one tone so the groups read apart without
  // needing thirteen different greens.
  const FAMILY_FILL: Record<string, string> = {
    cmo: '#15803d',
    peo: '#4d7c0f',
    sg: '#0d9488',
  }

  return (
    <div className="anchors">
      <svg
        className="anchors__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          data.length === 0
            ? 'No institutional documents to chart'
            : `Program outcomes aligned to each document: ${data
                .map((d) => `${d.anchor.code} ${d.count}`)
                .join(', ')}`
        }
      >
        {GRID.map((g) => (
          <g key={g}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(g)} y2={y(g)} className="anchors__grid" />
            <text x={LEFT - 8} y={y(g) + 4} textAnchor="end" className="anchors__axis">
              {g}%
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = LEFT + slot * i + (slot - barW) / 2
          const top = y(d.percent)
          return (
            <g key={d.anchor.id}>
              <title>{`${d.anchor.code}: ${d.count} of ${outcomes} outcomes aligned`}</title>
              {/* 0% draws a 2px stub so an empty slot reads as an empty slot
                  rather than a missing bar. */}
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(PLOT_H + TOP - top, 2)}
                rx={BAR_RX}
                fill={FAMILY_FILL[d.anchor.family]}
              />
              <text x={x + barW / 2} y={top - 8} textAnchor="middle" className="anchors__value">
                {d.percent}%
              </text>
              <text x={x + barW / 2} y={HEIGHT - 16} textAnchor="middle" className="anchors__axis">
                {label(d.anchor.code)}
              </text>
              <text x={x + barW / 2} y={HEIGHT - 4} textAnchor="middle" className="anchors__family">
                {FAMILY_LABELS[d.anchor.family]}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="anchors__note">
        Share of the {outcomes} program outcomes. An outcome aligned to more than one
        document is counted under each, so the bars need not total 100%.
      </p>
    </div>
  )
}

export default OutcomeBars

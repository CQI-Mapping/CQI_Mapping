// The PO Coverage Chart: what share of the program's learning outcomes reaches
// each program outcome.
//
// Hand-rolled SVG: a handful of rects and some gridlines do not justify a chart
// library, and a bar chart has no layout to simulate.
//
// Bars are upright and labelled under the axis, because this chart has a
// handful of bars and a rotated label on five bars is a workaround for a
// problem the data does not have. The outcome codes are short ("PO 6"), so they
// fit. When there are enough bars to crowd, the labels shorten to their number.
//
// Outcomes no learning outcome reaches are NOT plotted as 27 stubs: the chart
// shows the covered outcomes plus one bar for the rest, which is the finding
// and matches the "No Mapping" entry in the matrix legend beside it.

import { poLabel } from '../utils/cloPoMapping'

interface PoCoverageBar {
  code: string
  percent: number
  count: number
}

interface PoCoverageBarsProps {
  rows: PoCoverageBar[]
  /** Program outcomes nothing maps to. */
  uncovered: number
  /** Covered outcomes left out of the chart for width. */
  hidden: number
  totalClos: number
}

const WIDTH = 520
const HEIGHT = 240
const LEFT = 40
const RIGHT = 8
const TOP = 24
const BOTTOM = 34
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

const GRID = [0, 25, 50, 75, 100]

/** "PO 12" -> "12", once the axis needs it for width. */
const shortLabel = (code: string) => code.replace(/^PO[\s-]?/i, '') || code

function PoCoverageBars({ rows, uncovered, hidden, totalClos }: PoCoverageBarsProps) {
  const bars: { label: string; percent: number; title: string; muted?: boolean }[] = rows.map(
    (r) => ({
      label: poLabel(r.code),
      percent: r.percent,
      title: `${poLabel(r.code)}: ${r.count} of ${totalClos} CLOs`,
    }),
  )
  if (uncovered > 0) {
    bars.push({
      label: 'None',
      percent: 0,
      title: `${uncovered} program outcomes no learning outcome reaches`,
      muted: true,
    })
  }

  const n = bars.length
  const slot = n === 0 ? PLOT_W : PLOT_W / n
  const barW = Math.min(slot * 0.5, 44)
  // Five bars and their labels fit upright; past that the axis shortens them.
  const shorten = n > 8
  const y = (percent: number) => TOP + PLOT_H - (PLOT_H * percent) / 100

  return (
    <div className="pocov">
      <svg
        className="pocov__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          bars.length === 0
            ? 'No program outcomes to chart'
            : `Percentage of CLOs mapped to each program outcome: ${bars
                .map((b) => `${b.label} ${b.percent}%`)
                .join(', ')}`
        }
      >
        {GRID.map((g) => (
          <g key={g}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(g)} y2={y(g)} className="pocov__grid" />
            <text x={LEFT - 8} y={y(g) + 4} textAnchor="end" className="pocov__axis">
              {g}%
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const x = LEFT + slot * i + (slot - barW) / 2
          const top = y(b.percent)
          return (
            <g key={`${b.label}-${i}`}>
              <title>{b.title}</title>
              {/* 0% draws a stub so an empty slot reads as an empty slot. */}
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(PLOT_H + TOP - top, 2)}
                rx={3}
                className={b.muted ? 'pocov__bar pocov__bar--muted' : 'pocov__bar'}
              />
              <text x={x + barW / 2} y={top - 7} textAnchor="middle" className="pocov__value">
                {b.percent}%
              </text>
              <text x={x + barW / 2} y={HEIGHT - 12} textAnchor="middle" className="pocov__axis">
                {shorten ? shortLabel(b.label) : b.label}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="pocov__note">
        Of {totalClos} learning outcomes
        {hidden > 0 && ` · ${hidden} more covered outcomes not charted`}
        {uncovered > 0 && ` · ${uncovered} outcomes no CLO reaches`}.
      </p>
    </div>
  )
}

export default PoCoverageBars

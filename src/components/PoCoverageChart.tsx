// The PO coverage bar chart: what share of a program's CLOs reaches each
// Program Outcome.
//
// Hand-rolled SVG, not d3: this is seven rects and some gridlines, and the one
// d3 chart in the app (the Subject Graph) needs d3 because it simulates a
// layout. A bar chart has no layout to simulate. No chart library is added for
// a thing that is arithmetic.
//
// A PO that nothing maps to stays in the chart at 0% rather than being dropped:
// the hole in the bars is the finding, the same reason the coverage table keeps
// unmapped courses.

import type { PoCoverage } from '../utils/coverage'

/** Chart box, in viewBox units. */
const WIDTH = 560
const HEIGHT = 250
/** Plot area, leaving room for the % axis on the left and labels on top. */
const LEFT = 44
const RIGHT = 8
const TOP = 26
const BOTTOM = 30
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

const GRID = [0, 25, 50, 75, 100]
/** Rounded bar ends, in viewBox units. */
const BAR_RX = 5

interface PoCoverageChartProps {
  data: PoCoverage[]
}

function PoCoverageChart({ data }: PoCoverageChartProps) {
  const n = data.length
  // Slot width is fixed per bar so a program with two outcomes does not get
  // two chart-wide slabs; the bars stay readable no matter how many there are.
  const slot = n === 0 ? PLOT_W : PLOT_W / n
  const barW = Math.min(slot * 0.55, 64)

  const y = (percent: number) => TOP + PLOT_H - (PLOT_H * percent) / 100

  return (
    <div className="pocover">
      <svg
        className="pocover__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          data.length === 0
            ? 'No program outcomes to chart'
            : `Percentage of learning outcomes mapped to each program outcome: ${data
                .map((d) => `${d.po.code} ${d.percent}%`)
                .join(', ')}`
        }
      >
        {GRID.map((g) => (
          <g key={g}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(g)} y2={y(g)} className="pocover__grid" />
            <text x={LEFT - 8} y={y(g) + 4} textAnchor="end" className="pocover__axis">
              {g}%
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = LEFT + slot * i + (slot - barW) / 2
          const top = y(d.percent)
          return (
            <g key={d.po.id}>
              <title>{`${d.po.code}: ${d.mappedCloCount} of the program's learning outcomes mapped (${d.percent}%)`}</title>
              {/* 0% draws a 2px stub rather than nothing, so an empty slot is
                  visibly an empty slot and not a missing bar. */}
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(PLOT_H + TOP - top, 2)}
                rx={BAR_RX}
                className="pocover__bar"
              />
              <text
                x={x + barW / 2}
                y={top - 8}
                textAnchor="middle"
                className="pocover__value"
              >
                {d.percent}%
              </text>
              <text
                x={x + barW / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="pocover__axis"
              >
                {d.po.code}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default PoCoverageChart

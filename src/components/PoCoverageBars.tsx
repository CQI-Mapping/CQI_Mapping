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

import { useState } from 'react'
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
  /** Their codes, so the folded bar can say which outcomes it holds —
   *  a count alone leaves "where is PO 2?" unanswered. */
  uncoveredCodes?: string[]
  /** Covered outcomes left out of the chart for width. */
  hidden: number
  totalClos: number
}

// 320 tall: the panel's row height is set by the 33-row summary beside it,
// and a chart drawn short floats at the top of a stretched panel with dead
// white below -- the height reads where that row lands and fills it instead.
const WIDTH = 520
const HEIGHT = 320
const LEFT = 40
const RIGHT = 8
const TOP = 24
const BOTTOM = 34
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

const GRID = [0, 25, 50, 75, 100]

/** "PO 12" -> "12", once the axis needs it for width. */
const shortLabel = (code: string) => code.replace(/^PO[\s-]?/i, '') || code

function PoCoverageBars({ rows, uncovered, uncoveredCodes, hidden, totalClos }: PoCoverageBarsProps) {
  // The chart's one control: read the bars in code order, or let the tallest
  // speak first. The folded "None" bar always closes the row — it is the
  // finding, not a competitor for first place.
  const [order, setOrder] = useState<'code' | 'height'>('code')
  // The folded bar names its outcomes — eight codes read fine in a tooltip;
  // past that the note under the chart still answers the count question.
  const uncoveredNames = uncoveredCodes ?? []
  const listing =
    uncoveredNames.length === 0
      ? ''
      : ` — ${uncoveredNames.slice(0, 8).join(', ')}${
          uncoveredNames.length > 8 ? ` … +${uncoveredNames.length - 8} more` : ''
        }`
  const bars: { label: string; percent: number; title: string; muted?: boolean }[] = (
    // Order is a reading, not a fact: by code is the system's list; by height
    // drops the insight first — which outcome the curriculum leans on hardest.
    order === 'height'
      ? [...rows].sort(
          (a, b) => b.percent - a.percent || a.code.localeCompare(b.code, undefined, { numeric: true }),
        )
      : rows
  ).map((r) => ({
    label: poLabel(r.code),
    percent: r.percent,
    title: `${poLabel(r.code)}: ${r.count} of ${totalClos} CLOs`,
  }))
  if (uncovered > 0) {
    bars.push({
      label: 'None',
      percent: 0,
      title: `${uncovered} program outcome${uncovered === 1 ? '' : 's'} no learning outcome reaches${listing}`,
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
      <div className="pocov__sort" role="group" aria-label="Bar order">
        <button
          type="button"
          className={order === 'code' ? 'pocov__sortbtn pocov__sortbtn--on' : 'pocov__sortbtn'}
          onClick={() => setOrder('code')}
        >
          A–Z
        </button>
        <button
          type="button"
          className={order === 'height' ? 'pocov__sortbtn pocov__sortbtn--on' : 'pocov__sortbtn'}
          onClick={() => setOrder('height')}
        >
          Tallest first
        </button>
      </div>
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
        {uncovered > 0 &&
          ` · ${uncovered} outcome${uncovered === 1 ? '' : 's'} no CLO reaches${
            uncoveredNames.length > 0 && uncoveredNames.length <= 8 ? `: ${uncoveredNames.join(', ')}` : ''
          }`}
        .
      </p>
    </div>
  )
}

export default PoCoverageBars

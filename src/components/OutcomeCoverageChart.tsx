// The outcome coverage bar chart: one row per program outcome, the share of
// the program's learning outcomes that name it, and a status chip that reads
// at a glance.
//
// Where the PO coverage chart beside it shows the mapped outcomes and folds
// the rest away, this chart draws every outcome -- because the question it
// answers is exactly "which of our outcomes has nothing reaching it?", and
// folding the unanswerable rows into one bar would hide the answer the panel
// exists to give. Rows with zero coverage are grey-stone: nothing invented,
// and nothing celebrated.
//
// Percent and count both travel on a row: the percentage is the share of the
// program's learning outcomes (the same denominator the coverage chart uses),
// and the count states the actual number, so a 50% bar on two outcomes reads
// as the one outcome it is rather than a lonely fraction.
//
// Bars take their status colour -- green full, amber partial, grey none --
// which is what makes row-scanning fast: the eye lands on amber and grey
// without reading a single number.

import type { PoCoverageRow } from '../utils/cloPoMapping'

const W = 560
const ROW_H = 19
const STRIDE = ROW_H + 5
const TOP = 6

// Column geometry, one per row: code column left, then the track the bar
// fills (scaled to 100%), then the percentage, the bare count and the chip.
const CODE_X = 66
const TRACK_X = 72
const TRACK_W = 308
const PCT_X = 388
const COUNT_X = 420
const CHIP_X = 464
const CHIP_W = 84
const CHIP_H = 15

/** The three states one outcome's coverage can be in. */
type Status = 'full' | 'partial' | 'none'

function statusOf(row: PoCoverageRow, totalClos: number): { label: string; bar: string; chip: string; text: string } {
  if (row.cloCount === 0)
    return { label: 'None', bar: '#e2e8f0', chip: '#f1f5f9', text: '#64748b' }
  if (totalClos > 0 && row.cloCount >= totalClos)
    return { label: 'Full', bar: '#15803d', chip: '#15803d', text: '#ffffff' }
  return { label: 'Partial', bar: '#d97706', chip: '#d97706', text: '#ffffff' }
}

function OutcomeCoverageChart({ rows, totalClos }: { rows: PoCoverageRow[]; totalClos: number }) {
  // Outcome order, not entry order: the codes sort numerically so the chart
  // reads PO 1 through PO 27 however the rows arrived.
  const sorted = [...rows].sort((a, b) =>
    a.outcome.code.localeCompare(b.outcome.code, undefined, { numeric: true }),
  )
  const height = TOP + sorted.length * STRIDE

  return (
    <div className="ovb">
      <div className="table-wrap ovb-scroll">
        <svg
          className="ovb__chart"
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label={`Coverage of every program outcome by ${totalClos} learning outcomes`}
        >
          {sorted.map((row, i) => {
            const y = TOP + i * STRIDE
            const meta = statusOf(row, totalClos)
            const barW = Math.max((row.percent / 100) * TRACK_W, row.cloCount > 0 ? 3 : 0)
            const status = row.cloCount === 0
              ? 'none'
              : totalClos > 0 && row.cloCount >= totalClos ? 'full' : 'partial'
            const even = i % 2 === 1
            return (
              <g
                key={row.outcome.key}
                className={
                  status === 'none'
                    ? 'ovb__row ovb__row--none'
                    : status === 'full' ? 'ovb__row ovb__row--full' : 'ovb__row ovb__row--partial'
                }
              >
                {even && <rect x={0} y={y} width={W} height={STRIDE - 1} className="ovb__band" />}
                <text className="ovb__code" x={CODE_X} y={y + ROW_H - 5} textAnchor="end">
                  {row.outcome.code}
                </text>
                <rect
                  className="ovb__track"
                  x={TRACK_X}
                  y={y + 1}
                  width={TRACK_W}
                  height={ROW_H}
                  rx={3}
                />
                <rect
                  className="ovb__bar"
                  x={TRACK_X}
                  y={y + 1}
                  width={barW}
                  height={ROW_H}
                  rx={3}
                  fill={meta.bar}
                />
                <text className="ovb__pct" x={PCT_X} y={y + ROW_H - 5} textAnchor="end">
                  {row.percent}%
                </text>
                <text className="ovb__count" x={COUNT_X} y={y + ROW_H - 5} textAnchor="end">
                  {row.cloCount} of {totalClos}
                </text>
                <rect
                  className="ovb__chip"
                  x={CHIP_X}
                  y={y + 1.5}
                  width={CHIP_W}
                  height={CHIP_H}
                  rx={7}
                  fill={meta.chip}
                />
                <text
                  className="ovb__chiptext"
                  x={CHIP_X + CHIP_W / 2}
                  y={y + 12}
                  textAnchor="middle"
                  fill={meta.text}
                >
                  {meta.label}
                </text>
                <title>{`${row.outcome.code}: ${row.outcome.title} — ${row.cloCount} of ${totalClos} learning outcomes`}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <ul className="ovb__legend">
        <li className="ovb__item">
          <span className="ovb__dot" style={{ background: '#15803d' }} />Full
        </li>
        <li className="ovb__item">
          <span className="ovb__dot" style={{ background: '#d97706' }} />Partial
        </li>
        <li className="ovb__item">
          <span className="ovb__dot" style={{ background: '#e2e8f0' }} />None
        </li>
        <li className="ovb__item ovb__note">
          {totalClos} learning outcome{totalClos === 1 ? '' : 's'} mapped against
        </li>
      </ul>
    </div>
  )
}

export default OutcomeCoverageChart

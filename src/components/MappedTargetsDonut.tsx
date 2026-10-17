// The mapped-targets donut: of the learning outcomes that ARE mapped, which kind
// of document do they reach?
//
// Slices are the four families a mapping can name -- PO, PEO, strategic goal and
// CHED memorandum -- with the grand total in the hole. Families nothing reaches
// stay in the legend at 0%: dropping them would make the donut look fuller than
// the data is, and the legend is where a reader checks whether a family is
// absent or merely unused.
//
// The four slices do NOT sum to 100 when an outcome names more than one family,
// and there is no way to make them: a learning outcome mapped to a PO and a goal
// counts under both. Counts are shown beside every slice so the reader can see
// which it is, and the caption says so.

import { pie, arc } from 'd3'

const SIZE = 210
const CENTER = SIZE / 2
const OUTER = 96
const INNER = 54

export interface TargetSlice {
  key: string
  label: string
  count: number
}

/** Family order and colours, matching the legend order of the report brief. */
const FAMILIES: { key: string; label: string; color: string }[] = [
  { key: 'po', label: 'PO', color: '#15803d' },
  { key: 'peo', label: 'PEO', color: '#4d9a2f' },
  { key: 'sg', label: 'Strategic Goal', color: '#3b82f6' },
  { key: 'ched', label: 'CHED', color: '#8b5cf6' },
]

interface MappedTargetsDonutProps {
  slices: TargetSlice[]
  /** Learning outcomes mapped to at least one document. */
  mapped: number
  /** Every learning outcome, mapped or not -- the hole's denominator. */
  total: number
}

function MappedTargetsDonut({ slices, mapped, total }: MappedTargetsDonutProps) {
  // Every family present, so a family nothing reaches still holds its place in
  // the legend rather than vanishing between renders.
  const rows = FAMILIES.map((f) => ({
    ...f,
    count: slices.find((s) => s.key === f.key)?.count ?? 0,
  }))
  const live = rows.filter((r) => r.count > 0)

  const wedges = pie<{ key: string; label: string; count: number; color: string }>()
    .value((d) => d.count)
    .sort(null)
    .padAngle(0.02)(live)

  const shape = arc<d3.PieArcDatum<{ key: string; label: string; count: number; color: string }>>()
    .innerRadius(INNER)
    .outerRadius(OUTER)
    .cornerRadius(3)

  return (
    <div className="mixdonut">
      <svg
        className="mixdonut__chart"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          mapped === 0
            ? 'No learning outcomes are mapped yet'
            : `Mapped learning outcomes by target: ${rows
                .filter((r) => r.count > 0)
                .map((r) => `${r.label} ${r.count}`)
                .join(', ')}`
        }
      >
        {mapped === 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={(OUTER + INNER) / 2}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={OUTER - INNER}
          />
        )}

        {wedges.map((w) => (
          // d3.arc() centres wedges on the origin, so the ring is translated
          // rather than each path being offset by hand.
          <path
            key={w.data.key}
            transform={`translate(${CENTER} ${CENTER})`}
            d={shape(w) ?? undefined}
            fill={w.data.color}
          >
            <title>{`${w.data.label}: ${w.data.count}`}</title>
          </path>
        ))}

        <text className="mixdonut__count" x={CENTER} y={CENTER - 2} textAnchor="middle">
          {mapped}
        </text>
        <text className="mixdonut__unit" x={CENTER} y={CENTER + 18} textAnchor="middle">
          Mapped CLOs
        </text>
      </svg>

      <ul className="mixdonut__legend">
        {rows.map((r) => (
          <li className={r.count === 0 ? 'mixdonut__item mixdonut__item--zero' : 'mixdonut__item'} key={r.key}>
            <span className="mixdonut__dot" style={{ background: r.color }} />
            <span className="mixdonut__name">
              {r.label} ({r.count})
            </span>
            <span className="mixdonut__pct">
              {total === 0 ? 0 : Math.round((r.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MappedTargetsDonut

// The mapped-targets donut: of the learning outcomes that ARE mapped, which
// kind of document do they reach?
//
// Slices are the four families a mapping can name -- PO, PEO, strategic goal
// and CHED memorandum -- with the grand total in the hole. Families nothing
// reaches stay in the legend at 0%: dropping them would make the donut look
// fuller than the data is, and the legend is where a reader checks whether a
// family is absent or merely unused.
//
// The four slices do NOT sum to 100 when an outcome names more than one
// family, and there is no way to make them: a learning outcome mapped to a PO
// and a goal counts under both. Counts are shown beside every slice so the
// reader can see which it is, and the caption says so.
//
// Beneath the ring, the panel names the chains themselves: one row per
// mapped learning outcome, each chip a document the chain reaches -- program
// outcomes from the CLO's own mapping, then the PEOs and strategic goals
// those outcomes anchor to. The ring says "all mapped CLOs reach a goal";
// this list says which goal, per outcome, so the reader is never asked to
// take the percentage on faith.
//
// A family that sits at zero earns its own line: the CHED leg of the chain
// reads empty only because nothing anchors a memorandum, and a report meant
// to be evidence states that rather than letting a grey 0% say it.

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

/** One document a mapped learning outcome's chain reaches, chip-ready. */
export interface ReachChip {
  label: string
  color: string
}

export interface ReachRow {
  code: string
  targets: ReachChip[]
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
  /** Per mapped learning outcome, the documents its chain reaches. */
  reaches?: ReachRow[]
}

function MappedTargetsDonut({ slices, mapped, total, reaches = [] }: MappedTargetsDonutProps) {
  // Every family present, so a family nothing reaches still holds its place
  // in the legend rather than vanishing between renders.
  const rows = FAMILIES.map((f) => ({
    ...f,
    count: slices.find((s) => s.key === f.key)?.count ?? 0,
  }))

  const wedges = pie<{ key: string; label: string; count: number; color: string }>()
    .value((d) => d.count)
    .sort(null)
    .padAngle(0.02)(rows.filter((r) => r.count > 0))

  const shape = arc<d3.PieArcDatum<{ key: string; label: string; count: number; color: string }>>()
    .innerRadius(INNER)
    .outerRadius(OUTER)
    .cornerRadius(3)

  const chedEmpty = (rows.find((r) => r.key === 'ched')?.count ?? 0) === 0

  return (
    <div className="mixdonut">
      <div className="mixdonut__grid">
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
            <li
              key={r.key}
              className={r.count === 0 ? 'mixdonut__item mixdonut__item--zero' : 'mixdonut__item'}
            >
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

      {chedEmpty && mapped > 0 && (
        <p className="mixdonut__callout">
          No mapped outcome anchors a CHED memorandum — the CHED leg of the chain is empty.
        </p>
      )}

      {reaches.length > 0 && (
        <div className="mixdonut__reaches">
          <p className="mixdonut__reachhead">What each mapped outcome reaches</p>
          <ul className="mixdonut__reachlist">
            {reaches.map((r) => (
              <li className="mixdonut__reachrow" key={r.code}>
                <span className="mixdonut__clo">{r.code}</span>
                <span className="mixdonut__chain">
                  {r.targets.length === 0 ? (
                    <em className="mixdonut__dnf">nothing resolved</em>
                  ) : (
                    r.targets.map((t, i) => (
                      <span className="mixdonut__target" key={`${r.code}-${t.label}-${i}`}>
                        <span className="mixdonut__tdot" style={{ background: t.color }} />
                        {t.label}
                      </span>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default MappedTargetsDonut

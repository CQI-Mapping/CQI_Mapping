// The record-mix donut: what share of everything in the system each kind of
// record is.
//
// Draws from buildRecordMix() rather than the raw lists, so the percentages are
// the same numbers the Totals table above it is showing — a chart that
// recomputed its own totals is a chart that eventually disagrees with the page.
//
// d3 is used for the arc geometry only (pie for the angles, arc for the path),
// computed during render and handed to React as plain <path> elements. There is
// no effect, no ref and no DOM mutation: the same declarative shape as every
// other component here, which is why the Subject Graph — the one page that does
// need d3.select — is the only place in the app that reaches for it that way.
//
// The wedges are decorative. The numbers a sighted reader takes from the arcs
// are also in the legend beside them, as text, so the chart is not the only way
// to get the data.

import { arc, pie } from 'd3'
import type { MixSlice, RecordMix, SectionKey } from '../utils/reports'

/**
 * Green-to-slate, matching the stat cards on the dashboards. Deliberately not
 * d3.schemeCategory10: those are red, blue and orange, which read as warnings
 * next to this app's green chrome, and red here would imply a problem with a
 * perfectly healthy record type.
 */
const SLICE_COLORS: Record<SectionKey, string> = {
  programs: '#15803d',
  peos: '#22c55e',
  pos: '#4d7c0f',
  courses: '#0d9488',
  clos: '#94a3b8',
}

const SIZE = 220
const CENTER = SIZE / 2
const OUTER = 96
const INNER = 58

interface RecordMixDonutProps {
  mix: RecordMix
}

function RecordMixDonut({ mix }: RecordMixDonutProps) {
  const { total, slices } = mix

  // sort(null) keeps SECTION_ORDER, so the wedge sequence matches the Totals
  // table and the legend; d3's default would reorder by size and the reader
  // would have to hunt for a colour twice.
  //
  // The empty sections are dropped here rather than in buildRecordMix(), which
  // keeps them for the legend: a wedge with no records still gets an angle from
  // padAngle, which paints a hairline sliver across the ring.
  const wedges = pie<MixSlice>()
    .value((d) => d.total)
    .sort(null)
    .padAngle(0.015)(slices.filter((s) => s.total > 0))

  const shape = arc<d3.PieArcDatum<MixSlice>>()
    .innerRadius(INNER)
    .outerRadius(OUTER)
    .cornerRadius(3)

  const label =
    total === 0
      ? 'No records to chart'
      : `Record mix: ${slices
          .filter((s) => s.total > 0)
          .map((s) => `${s.title} ${s.percent}%`)
          .join(', ')}`

  return (
    <figure className="reports-mix">
      <figcaption className="reports-mix__title">What the system is made of</figcaption>

      <svg
        className="reports-mix__chart"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={label}
      >
        {/* A zero-total dataset has no angles to draw, so it gets an empty ring
            rather than an SVG that renders as a blank square. */}
        {total === 0 && (
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
          // d3.arc() centres every wedge on the origin, so the whole ring is
          // translated into the middle of the viewBox rather than each path
          // being offset by hand.
          <path
            key={w.data.key}
            transform={`translate(${CENTER} ${CENTER})`}
            d={shape(w) ?? undefined}
            fill={SLICE_COLORS[w.data.key]}
          >
            <title>{`${w.data.title}: ${w.data.total} (${w.data.percent}%)`}</title>
          </path>
        ))}

        <text className="reports-mix__count" x={CENTER} y={CENTER - 2} textAnchor="middle">
          {total}
        </text>
        <text className="reports-mix__unit" x={CENTER} y={CENTER + 18} textAnchor="middle">
          records
        </text>
      </svg>

      <ul className="reports-mix__legend">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className={slice.total === 0 ? 'reports-mix__item reports-mix__item--empty' : 'reports-mix__item'}
          >
            <span className="reports-mix__swatch" style={{ background: SLICE_COLORS[slice.key] }} />
            <span className="reports-mix__name">{slice.title}</span>
            <span className="reports-mix__value">{slice.percent}%</span>
            <span className="reports-mix__count">{slice.total}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export default RecordMixDonut

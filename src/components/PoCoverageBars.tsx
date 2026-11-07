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
//
// Hovering a bar opens a Messenger-style bubble naming the learning outcomes
// behind it — code, subject and description — so the chart is not just a
// percentage but a pointer to the work.

import { useState, useRef } from 'react'
import { poLabel } from '../utils/cloPoMapping'

interface PoCoverageBar {
  code: string
  percent: number
  count: number
}

/** One learning outcome behind a bar — code, subject and description. */
export interface PoCoverageDetail {
  code: string
  course: string
  /** The subject's full name (resolved from the program's course list). */
  courseTitle: string | null
  title: string | null
  description: string | null
}

interface PoCoverageBarsProps {
  rows: PoCoverageBar[]
  /** Program outcomes nothing maps to. */
  uncovered: number
  /** Their codes, so the folded bar can say which outcomes it holds. */
  uncoveredCodes?: string[]
  /** Covered outcomes left out of the chart for width. */
  hidden: number
  totalClos: number
  /** Learning outcomes behind each bar, keyed by the outcome's code. */
  details?: Record<string, PoCoverageDetail[]>
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

/** Trim a description to a readable preview. */
const preview = (text: string | null, max = 110) => {
  if (!text) return ''
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, max).trimEnd() + '…'
}

function PoCoverageBars({
  rows,
  uncovered,
  uncoveredCodes,
  hidden,
  totalClos,
  details,
}: PoCoverageBarsProps) {
  // The chart's one control: read the bars in code order, or let the tallest
  // speak first. The folded "None" bar always closes the row — it is the
  // finding, not a competitor for first place.
  const [order, setOrder] = useState<'code' | 'height'>('code')
  // Hover state: which bar and where the cursor sits, so the bubble can follow.
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)
  // A clicked bar stays open so the reader can copy a code or read a long
  // description without keeping the mouse perfectly still.
  const [pinned, setPinned] = useState<{ index: number; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const uncoveredNames = uncoveredCodes ?? []
  const listing =
    uncoveredNames.length === 0
      ? ''
      : ` — ${uncoveredNames.slice(0, 8).join(', ')}${
          uncoveredNames.length > 8 ? ` … +${uncoveredNames.length - 8} more` : ''
        }`

  const view =
    order === 'height'
      ? [...rows].sort(
          (a, b) => b.percent - a.percent || a.code.localeCompare(b.code, undefined, { numeric: true }),
        )
      : rows

  const bars: { label: string; percent: number; title: string; muted?: boolean; key: string }[] = view.map(
    (r) => ({
      label: poLabel(r.code),
      percent: r.percent,
      title: `${poLabel(r.code)}: ${r.count} of ${totalClos} CLOs`,
      key: r.code,
    }),
  )
  if (uncovered > 0) {
    bars.push({
      label: 'None',
      percent: 0,
      title: `${uncovered} program outcome${uncovered === 1 ? '' : 's'} no learning outcome reaches${listing}`,
      muted: true,
      key: '__none__',
    })
  }

  const n = bars.length
  const slot = n === 0 ? PLOT_W : PLOT_W / n
  const barW = Math.min(slot * 0.5, 44)
  const shorten = n > 8
  const y = (percent: number) => TOP + PLOT_H - (PLOT_H * percent) / 100

  const active = pinned ?? hover
  const hovered = active !== null ? bars[active.index] : null
  const hoveredDetails = hovered && !hovered.muted ? details?.[hovered.key] ?? [] : []
  const hoveredUncovered = hovered?.muted ? uncoveredNames : []

  // Keep the bubble inside the container horizontally.
  const containerW = containerRef.current?.clientWidth ?? WIDTH
  const bubbleLeft =
    active === null
      ? 0
      : Math.min(Math.max(active.x + 14, 8), Math.max(containerW - 300, 8))
  const bubbleTop = active === null ? 0 : Math.max(active.y - 10, 8)

  return (
    <div className="pocov" ref={containerRef} onClick={() => setPinned(null)}>
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
            <g
              key={`${b.label}-${i}`}
              onMouseEnter={(e) => {
                if (pinned) return
                const cRect = containerRef.current?.getBoundingClientRect()
                setHover({
                  index: i,
                  x: e.clientX - (cRect?.left ?? 0),
                  y: e.clientY - (cRect?.top ?? 0),
                })
              }}
              onMouseMove={(e) => {
                if (pinned) return
                const cRect = containerRef.current?.getBoundingClientRect()
                setHover((h) =>
                  h && h.index === i
                    ? { index: i, x: e.clientX - (cRect?.left ?? 0), y: e.clientY - (cRect?.top ?? 0) }
                    : h,
                )
              }}
              onMouseLeave={() => {
                if (pinned) return
                setHover((h) => (h && h.index === i ? null : h))
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (pinned && pinned.index === i) {
                  setPinned(null)
                } else {
                  const rect = (e.currentTarget as SVGGElement).getBoundingClientRect()
                  const cRect = containerRef.current?.getBoundingClientRect()
                  setPinned({
                    index: i,
                    x: rect.left + rect.width / 2 - (cRect?.left ?? 0),
                    y: rect.top - (cRect?.top ?? 0),
                  })
                  setHover(null)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{b.title}</title>
              {/* 0% draws a stub so an empty slot reads as an empty slot. */}
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(PLOT_H + TOP - top, 2)}
                rx={3}
                className={[b.muted ? 'pocov__bar pocov__bar--muted' : 'pocov__bar', pinned && pinned.index === i ? 'pocov__bar--pinned' : ''].filter(Boolean).join(' ')}
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

      {active !== null && hovered && (
        <div
          className={`pocov__popover${hovered.muted ? ' pocov__popover--muted' : ''}`}
          style={{
            left: bubbleLeft,
            top: bubbleTop,
            transform: 'translate(0, -100%)',
            pointerEvents: pinned ? 'auto' : 'none',
          }}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pocov__popover__head">
            {hovered.label === 'None'
              ? `${uncovered} outcome${uncovered === 1 ? '' : 's'} no CLO reaches`
              : `${hovered.label} — ${hovered.percent}% of ${totalClos} CLOs`}
            {pinned && (
              <button
                type="button"
                className="pocov__popover__close"
                onClick={() => setPinned(null)}
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
          {hovered.muted ? (
            <ul className="pocov__popover__list">
              {hoveredUncovered.length === 0 ? (
                <li className="pocov__popover__none">No outcome codes recorded.</li>
              ) : (
                hoveredUncovered.map((code) => (
                  <li key={code} className="pocov__popover__item">
                    <strong>{code}</strong>
                    <span className="pocov__popover__desc">No learning outcome names this outcome.</span>
                  </li>
                ))
              )}
            </ul>
          ) : hoveredDetails.length === 0 ? (
            <p className="pocov__popover__none">No learning outcome names this outcome yet.</p>
          ) : (
            <ul className="pocov__popover__list">
              {hoveredDetails.map((d, i) => (
                <li key={`${d.code}-${i}`} className="pocov__popover__item">
                  <strong>{d.code}</strong>
                  <span className="pocov__popover__subj"> · {d.course}</span>
                  {d.courseTitle && d.courseTitle.trim() !== "" && d.courseTitle.trim().toLowerCase() !== d.course.trim().toLowerCase() && (
                    <span className="pocov__popover__subject"> — {d.courseTitle}</span>
                  )}
                  {(d.description || d.title) && (
                    <span className="pocov__popover__desc">{preview(d.description || d.title)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!hovered.muted && hoveredDetails.length > 0 && (
            <div className="pocov__popover__sub">
              {hoveredDetails.length} learning outcome{hoveredDetails.length === 1 ? '' : 's'} behind this bar
            </div>
          )}
        </div>
      )}

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
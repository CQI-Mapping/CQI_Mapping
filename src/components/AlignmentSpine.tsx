// The alignment spine: the one number this page exists to report.
//
// The record inventory below says what exists; this says how much of it is
// anchored. It is a single full-width band rather than one more card in the KPI
// row, because a headline you have to scan a row of equal tiles to find is not
// a headline.
//
// It renders alignmentSummary() without doing arithmetic of its own, so it
// cannot drift from the KPI cards beside it.

import type { AlignmentSummary } from '../utils/alignment'

interface AlignmentSpineProps {
  programCode: string
  summary: AlignmentSummary
  /** Courses that carry at least one learning outcome. */
  coursesWithOutcomes: number
  coursesTotal: number
}

function AlignmentSpine({
  programCode,
  summary,
  coursesWithOutcomes,
  coursesTotal,
}: AlignmentSpineProps) {
  const { outcomes, aligned, unaligned, percent, withCmo, withPeo, withGoal } = summary
  const empty = outcomes === 0

  return (
    <section className="spine" aria-labelledby="spine-title">
      <div className="spine__figure">
        <span className="spine__label" id="spine-title">
          Outcome alignment · {programCode}
        </span>
        <span className="spine__value">{empty ? '—' : `${percent}%`}</span>
        <span className="spine__of">
          {empty
            ? 'No program outcomes recorded for this program yet'
            : `${aligned} of ${outcomes} program outcomes are anchored to a CMO, PEO or goal`}
        </span>
      </div>

      <div
        className="spine__bar"
        role="img"
        aria-label={
          empty
            ? 'No program outcomes to align'
            : `${percent}% of program outcomes anchored, ${unaligned} unaligned`
        }
      >
        <span
          className="spine__seg spine__seg--mapped"
          style={{ width: empty ? '100%' : `${percent}%` }}
        />
        <span
          className="spine__seg spine__seg--gap"
          style={{ width: empty ? '0%' : `${100 - percent}%` }}
        />
      </div>

      <ul className="spine__facts">
        <li>
          <span className="spine__fact spine__fact--mapped">{withCmo}</span> aligned to a CMO
        </li>
        <li>
          <span className="spine__fact">{withPeo}</span> to a PEO · {withGoal} to a goal
        </li>
        <li>
          <span className="spine__fact">
            {coursesWithOutcomes}/{coursesTotal}
          </span>{' '}
          courses carry outcomes
        </li>
      </ul>
    </section>
  )
}

export default AlignmentSpine

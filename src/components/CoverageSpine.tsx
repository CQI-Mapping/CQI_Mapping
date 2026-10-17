// The coverage spine: the one number this page exists to report.
//
// The record inventory below says what exists; this says how much of it is
// wired up. It is deliberately a single full-width band rather than one more
// card in the KPI row: mapping coverage is the headline finding, and a headline
// that has to be found by scanning seven equal cards is not a headline.
//
// Presentational on purpose -- coverageSummary() already computes the numbers,
// and this renders them without doing arithmetic of its own, so the spine and
// the KPI card it sits under cannot drift apart.

import type { CoverageSummary } from '../utils/coverage'

interface CoverageSpineProps {
  programCode: string
  coverage: CoverageSummary
  /** Courses of this program whose every CLO is mapped. */
  coursesFullyMapped: number
  coursesTotal: number
}

function CoverageSpine({ programCode, coverage, coursesFullyMapped, coursesTotal }: CoverageSpineProps) {
  const { totalClos, mappedClos, unmappedClos, coveragePercent } = coverage
  const empty = totalClos === 0

  return (
    <section className="spine" aria-labelledby="spine-title">
      <div className="spine__figure">
        <span className="spine__label" id="spine-title">
          Mapping coverage · {programCode}
        </span>
        <span className="spine__value">{empty ? '—' : `${coveragePercent}%`}</span>
        <span className="spine__of">
          {empty
            ? 'No learning outcomes recorded for this program yet'
            : `${mappedClos} of ${totalClos} learning outcomes reach at least one Program Outcome`}
        </span>
      </div>

      {/* One bar, two segments. The mapped segment leads with the same green as
          the panels, so the eye ties the number to the fill without a legend. */}
      <div
        className="spine__bar"
        role="img"
        aria-label={
          empty
            ? 'No learning outcomes to map'
            : `${coveragePercent}% mapped, ${unmappedClos} learning outcomes unmapped`
        }
      >
        <span
          className="spine__seg spine__seg--mapped"
          style={{ width: empty ? '100%' : `${coveragePercent}%` }}
        />
        <span
          className="spine__seg spine__seg--gap"
          style={{ width: empty ? '0%' : `${100 - coveragePercent}%` }}
        />
      </div>

      <ul className="spine__facts">
        <li>
          <span className="spine__fact spine__fact--mapped">{mappedClos}</span> mapped
        </li>
        <li>
          <span className="spine__fact spine__fact--gap">{unmappedClos}</span> unmapped
        </li>
        <li>
          <span className="spine__fact">{coursesFullyMapped}</span> of {coursesTotal} courses
          fully mapped
        </li>
      </ul>
    </section>
  )
}

export default CoverageSpine

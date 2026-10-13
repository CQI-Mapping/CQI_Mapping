// One sheet of a Table of Specification, laid out as a printable document.
//
// Pure props -> JSX, no state, no fetching. It reads the same .sd-* report
// classes the Curriculum Report and the Subject Graph About cards already use,
// so it inherits their paper look and their @media print rules for free.
//
// Column layout matches the faculty workbook: Topic/SLO, hours, the derived
// weighted column, then one column per Bloom level.

import {
  BLOOM_LEVELS,
  BLOOM_LABELS,
  BLOOM_SHORT,
  bloomTotals,
  fmt,
  shares,
  totalHours,
  weightedFor,
  type TosExam,
  type TosSheet,
} from '../utils/tosMath'

interface TosSheetGridProps {
  exam: TosExam
  sheet: TosSheet
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

export default function TosSheetGrid({ exam, sheet }: TosSheetGridProps) {
  const totals = bloomTotals(sheet.topics)
  const share = shares(sheet.topics, sheet.total)
  const hours = totalHours(sheet.topics)
  const unit = sheet.kind === 'points' ? 'Points' : 'Items'

  return (
    <div className="syllabus-doc__page">
      <header className="sd-letterhead tos-letterhead">
        <div className="sd-letterhead__text">
          <div>Republic of the Philippines</div>
          <div className="sd-letterhead__school">{exam.school}</div>
          <div>{exam.institute}</div>
          <div className="sd-letterhead__motto">
            Creando futura, Transformationis vitae, Ductae a Deo
          </div>
        </div>
      </header>

      <div className="sd-titleblock">
        <div className="sd-titleblock__title">TABLE OF SPECIFICATION</div>
        <div>{exam.examType}</div>
        <div>{exam.institute}</div>
        <div>
          {exam.code} &mdash; {exam.title}
        </div>
        <div className="sd-titleblock__course">{exam.term}</div>
      </div>

      {exam.coverage && (
        <div className="sd-band">
          <strong>Coverage: </strong>
          {exam.coverage}
        </div>
      )}

      <div className="sd-band sd-band--center">
        BLOOM&rsquo;S REVISED TAXONOMY
      </div>

      <table className="sd-table tos-table">
        <thead>
          <tr>
            <th>Topic with SLO</th>
            <th className="tos-num">Hrs</th>
            <th className="tos-num">No. of {unit}</th>
            {BLOOM_LEVELS.map((level) => (
              <th key={level} className="tos-num" title={BLOOM_LABELS[level]}>
                {BLOOM_SHORT[level]}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Row 12 of the workbook: each Bloom level as a share of the exam. */}
          <tr className="tos-row--target">
            <td>Target percentage</td>
            <td className="tos-num">&mdash;</td>
            <td className="tos-num">100%</td>
            {BLOOM_LEVELS.map((level) => (
              <td key={level} className="tos-num">
                {pct(share[level])}
              </td>
            ))}
          </tr>

          {sheet.topics.map((topic) => (
            <tr key={topic.id}>
              <td>
                <strong>
                  {topic.position}. {topic.title}
                </strong>
                {topic.slo && <div className="tos-slo">SLO: {topic.slo}</div>}
              </td>
              <td className="tos-num">{fmt(topic.hours)}</td>
              <td className="tos-num">{fmt(weightedFor(sheet, topic))}</td>
              {BLOOM_LEVELS.map((level) => {
                const n = topic.bloom[level] ?? 0
                return (
                  <td key={level} className={`tos-num${n ? ' tos-num--set' : ''}`}>
                    {n || ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td>Total</td>
            <td className="tos-num">{fmt(hours)}</td>
            <td className="tos-num">{fmt(sheet.total)}</td>
            {BLOOM_LEVELS.map((level) => (
              <td key={level} className="tos-num">
                {totals[level] || ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      <div className="sd-details">
        <div className="sd-details__section">
          <strong>Bloom&rsquo;s Revised Taxonomy key</strong>
          <div className="tos-legend">
            {BLOOM_LEVELS.filter((level) => totals[level] > 0).map((level) => (
              <span key={level} className="tos-legend__item">
                <strong>{BLOOM_SHORT[level]}</strong> &mdash; {BLOOM_LABELS[level]}
              </span>
            ))}
            {BLOOM_LEVELS.every((level) => totals[level] === 0) && (
              <span className="tos-legend__item">No Bloom levels assigned yet.</span>
            )}
          </div>
        </div>
      </div>

      {exam.preparedBy && (
        <div className="sd-details__block">
          <strong>Prepared by: </strong>
          <p>{exam.preparedBy}</p>
        </div>
      )}
    </div>
  )
}
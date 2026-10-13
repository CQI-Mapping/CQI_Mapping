// ProgramOutcomeReport: the report-style document the Subject Graph shows in
// its About card when the graph is rooted at a single Program Outcome. It reuses
// the Curriculum Report's page chrome (letterhead, title block, bands, tables)
// so the PO view reads like another page of the same document — the way the
// subject root renders components/SyllabusReport.
import type {
  CourseLearningOutcomeStandalone,
  ProgramOutcomeStandalone,
} from '../services/database'
import { SCHOOL } from '../utils/report'

interface ProgramOutcomeReportProps {
  po: ProgramOutcomeStandalone
  /** Uppercased CMO-alignment label for this outcome (see utils/report). */
  cmoLabel: string
  /** CLOs whose PO mapping references this outcome. */
  clos: CourseLearningOutcomeStandalone[]
}

export default function ProgramOutcomeReport({ po, cmoLabel, clos }: ProgramOutcomeReportProps) {
  const text = po.title || po.description
  return (
    <div className="syllabus-doc__page">
      {/* Letterhead */}
      <header className="sd-letterhead">
        <img className="sd-letterhead__img" src="/nbsc-letterhead.jpg" alt="Northern Bukidnon State College" />
        <div className="sd-letterhead__text">
          <div>{SCHOOL.republic}</div>
          <div className="sd-letterhead__school">{SCHOOL.school}</div>
          <div>{SCHOOL.address}</div>
          <div className="sd-letterhead__motto">{SCHOOL.motto}</div>
        </div>
      </header>

      {/* Title block */}
      <div className="sd-titleblock">
        <div className="sd-titleblock__title">PROGRAM OUTCOME</div>
        <div>{SCHOOL.institute}</div>
        <div>{SCHOOL.program}</div>
        <div className="sd-titleblock__course">{po.code} — {text}</div>
        <div>{SCHOOL.term}</div>
      </div>

      {/* Downstream alignment: PEO / Strategic Goal / CMO */}
      <div className="sd-mapping">
        <div className="sd-band sd-band--center">CURRICULUM MAPPING</div>
        <table className="sd-table sd-table--mapping">
          <tbody>
            <tr>
              <th className="sd-mapping__col-align">Program Educational Objectives</th>
              <th className="sd-mapping__col-align">Strategic Goals</th>
              <th className="sd-mapping__col-align">CMO Alignment</th>
            </tr>
            <tr>
              {/* Blank when unaligned — matches the report's empty cells. */}
              <td>{po.peo_text?.trim()}</td>
              <td>{po.sg_text?.trim()}</td>
              <td>{cmoLabel}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Upstream: the course learning outcomes that map to this outcome */}
      <table className="sd-table sd-table--clo">
        <thead>
          <tr>
            <th>Course Learning Outcomes</th>
            <th className="sd-map-col">Course</th>
          </tr>
        </thead>
        <tbody>
          {clos.length === 0 && (
            <tr>
              <td colSpan={2}>No course learning outcomes reference this program outcome yet.</td>
            </tr>
          )}
          {clos.map((c) => (
            <tr key={c.id}>
              <td>{c.code}: {c.description || c.title}</td>
              <td>{c.course}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

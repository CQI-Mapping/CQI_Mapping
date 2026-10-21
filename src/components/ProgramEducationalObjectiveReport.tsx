// ProgramEducationalObjectiveReport: the report-style document the Subject
// Graph shows in its About card when the graph is rooted at a Program
// Educational Objective. It mirrors components/ProgramOutcomeReport — the same
// letterhead, title block, bands and tables — so the PEO view reads like
// another page of the Curriculum Report document.
import type {
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../services/database'
import { SCHOOL } from '../utils/report'

interface ProgramEducationalObjectiveReportProps {
  peo: ProgramEducationalObjective
  /** POs aligned to this PEO (by peo_id or a PEO token in peo_text). */
  pos: ProgramOutcomeStandalone[]
}

export default function ProgramEducationalObjectiveReport({ peo, pos }: ProgramEducationalObjectiveReportProps) {
  return (
    <div className="syllabus-doc__page">
      {/* Letterhead */}
      <header className="sd-letterhead">
        <img className="sd-letterhead__img" src="/nbsc-letterhead.png" alt="Northern Bukidnon State College" />
        <div className="sd-letterhead__text">
          <div>{SCHOOL.republic}</div>
          <div className="sd-letterhead__school">{SCHOOL.school}</div>
          <div>{SCHOOL.address}</div>
          <div className="sd-letterhead__motto">{SCHOOL.motto}</div>
        </div>
      </header>

      {/* Title block */}
      <div className="sd-titleblock">
        <div className="sd-titleblock__title">PROGRAM EDUCATIONAL OBJECTIVE</div>
        <div>{SCHOOL.institute}</div>
        <div>{SCHOOL.program}</div>
        <div className="sd-titleblock__course">{peo.code} — {peo.title || peo.code}</div>
        <div>{SCHOOL.term}</div>
      </div>

      {/* The PEO statement itself */}
      <div className="sd-band sd-band--center">PROGRAM EDUCATIONAL OBJECTIVES</div>
      <table className="sd-table">
        <tbody>
          <tr>
            <td>{peo.description || peo.title || peo.code}</td>
          </tr>
        </tbody>
      </table>

      {/* The POs that cascade down from this PEO */}
      <table className="sd-table sd-table--clo">
        <thead>
          <tr>
            <th>Program Outcomes</th>
            <th className="sd-map-col">Code</th>
          </tr>
        </thead>
        <tbody>
          {pos.length === 0 && (
            <tr>
              <td colSpan={2}>No program outcome aligns to this PEO yet.</td>
            </tr>
          )}
          {pos.map((p) => (
            <tr key={p.id}>
              <td>{p.title || p.description || p.code}</td>
              <td>{p.code}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
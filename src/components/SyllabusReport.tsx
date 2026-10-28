// SyllabusReport: the printable report document — letterhead, title block,
// Vision/Mission/Strategic Goals/PEO table, Program Outcomes list, Curriculum
// Mapping matrix, CLO-to-PO table, then Course Details — exactly as it renders
// on the Curriculum Report page (View.tsx).
//
// Extracted so the Subject Graph's About card can show the same document. The
// inline-edit controls are optional: pass `editMode` + `rowActions` +
// `editableListRow` + `onEditChange` for an editing copy, or omit them for a
// read-only one. Both current readers read read-only -- the Curriculum Report
// dropped its Edit toggle and owns records on their own pages.
import type { ReactNode, Ref } from 'react'
import type {
  Course,
  CourseLearningOutcomeStandalone,
  ProgramEducationalObjective,
  StrategicGoal,
} from '../services/database'
import { uniqueResolvedRefs } from '../utils/courseCodes'
import { SCHOOL, DOC_VISION, DOC_MISSION, poListItem, goalLine, isActive } from '../utils/report'
import type { EditableItem, EditableKind, EditState, PoGroup } from '../utils/report'
import CourseDetails from './CourseDetails'

interface SyllabusReportProps {
  course: Course | null
  /** All courses — used to resolve pre-/co-requisite references. */
  courses: Course[]
  /** Active strategic goals. */
  goals: StrategicGoal[]
  /** Active program educational objectives. */
  peos: ProgramEducationalObjective[]
  /** Active program outcomes grouped for the Program Outcomes table. */
  adminGroups: PoGroup[]
  /** Active program outcomes grouped for the Curriculum Mapping matrix. */
  managerGroups: PoGroup[]
  /** Active CLOs belonging to `course`. */
  subjectClos: CourseLearningOutcomeStandalone[]

  /**
   * Points at the document root — the element the PDF export snapshots.
   * The toolbar lives outside this node, so the exported file carries the
   * document only. See utils/syllabusPdf.ts.
   */
  rootRef?: Ref<HTMLDivElement>

  /** Screen-only extras rendered at the foot of the page, inside its padding
   * (e.g. SubjectView's download control). Never exported: the PDF snapshot
   * strips .no-print nodes, the Word export rebuilds from data alone. */
  footer?: ReactNode

  // ── Optional inline-editing hooks (admin only) ────────────────────────────
  editMode?: boolean
  edit?: EditState | null
  busy?: boolean
  onEditChange?: (next: EditState) => void
  rowActions?: (kind: EditableKind, id: string) => ReactNode
  editableListRow?: (kind: EditableKind, item: EditableItem, display: ReactNode) => ReactNode
}

// Program Outcomes codes, one per line — the PDF lists each PLO group on
// its own centered row inside the cell ("PLO1" then "PLO3, & PLO10").
const poLines = (v?: string | null) =>
  (v || '').split(',').map((s) => s.trim()).filter(Boolean)

export default function SyllabusReport({
  course: selectedCourse,
  courses,
  goals: visibleGoals,
  peos: visiblePeos,
  adminGroups,
  managerGroups,
  subjectClos,
  rootRef,
  footer,
  editMode,
  edit,
  busy,
  onEditChange,
  rowActions,
  editableListRow,
}: SyllabusReportProps) {
  const programText = (c: Course) =>
    typeof c.program_id === 'object' && c.program_id ? c.program_id.name : SCHOOL.program

  // Read-only fallback for the Vision/Goals/PEO table rows.
  const listRow =
    editableListRow ??
    ((_kind: EditableKind, item: EditableItem, display: ReactNode) => (
      <div key={item.id} className="sd-edit-row">
        <span className="sd-edit-row__text">{display}</span>
      </div>
    ))

  return (
    <div className="syllabus-doc__page" ref={rootRef}>
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
        <div className="sd-titleblock__title">{SCHOOL.title}</div>
        <div>{SCHOOL.institute}</div>
        <div>{selectedCourse ? programText(selectedCourse) : SCHOOL.program}</div>
        {selectedCourse ? (
          <div className="sd-titleblock__course">{selectedCourse.code} - {selectedCourse.title}</div>
        ) : (
          <div className="sd-titleblock__course">No courses yet</div>
        )}
        <div>{SCHOOL.term}</div>
      </div>

      {/* Vision | Mission | Strategic Goals | PEOs */}
      <table className="sd-table sd-table--vmgp">
        <thead>
          <tr>
            <th className="sd-col-head">VISION</th>
            <th className="sd-col-head">MISSION</th>
            <th className="sd-col-head">STRATEGIC GOALS</th>
            <th className="sd-col-head">PROGRAM EDUCATIONAL OBJECTIVES</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="sd-cell--justify">{DOC_VISION}</td>
            <td className="sd-cell--justify">{DOC_MISSION}</td>
            <td>
              {visibleGoals.map((g) =>
                listRow(
                  'goal',
                  g,
                  <span className="sd-goal">{goalLine(g.code, g.description)}</span>,
                ),
              )}
              {visibleGoals.length === 0 && <span>No strategic goals.</span>}
            </td>
            <td>
              {visiblePeos.map((p) =>
                listRow(
                  'peo',
                  p,
                  <>
                    <span>{p.code.replace(/-/, ' ')}: {p.title}</span>
                    {p.description && <div className="sd-peo__desc">{p.description}</div>}
                  </>,
                ),
              )}
              {visiblePeos.length === 0 && <span>No PEOs.</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Program Outcomes (ADMIN) — grouped by CMO category */}
      <table className="sd-table sd-table--po-single">
        <thead>
          <tr>
            <th className="sd-po-single-title">PROGRAM OUTCOMES</th>
          </tr>
        </thead>
        <tbody>
          {adminGroups.length === 0 && (
            <tr>
              <td className="sd-po-single-section">No admin program outcomes yet.</td>
            </tr>
          )}
          {adminGroups.map((group, gi) => (
            <tr key={group.heading}>
              <td className="sd-po-single-section">
                <div className="sd-po-single-section__head">{group.heading}</div>
                {gi === 0 && (
                  <div className="sd-po-single-section__sub">
                    The NBSC graduates have the ability to:
                  </div>
                )}
                {group.items.map((p, i, arr) => {
                  const editingThis = !!edit && edit.kind === 'po' && edit.id === p.id
                  return (
                    <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                      {poListItem(p.code, p.title, i === arr.length - 1)}
                      {editMode && rowActions && (
                        <span className="sd-po-single-item__actions">
                          {rowActions('po', p.id)}
                        </span>
                      )}
                      {editingThis && edit && (
                        <span className="sd-po-single-edit">
                          <input
                            className="input input--sm"
                            value={edit.title}
                            onChange={(e) => onEditChange?.({ ...edit, title: e.target.value })}
                            disabled={busy}
                          />
                        </span>
                      )}
                    </div>
                  )
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Curriculum Mapping — MANAGER outcomes with PEO/SG alignment matrix */}
      {managerGroups.length > 0 && (
        <div className="sd-mapping">
          <div className="sd-band sd-band--center">CURRICULUM MAPPING</div>
          {/* Single continuous table (like the source PDF): each CMO group
              is a <tbody> whose repeated header row carries the CMO title. */}
          <table className="sd-table sd-table--mapping">
            {managerGroups.map((group, groupIndex) => {
              // Rows number continuously from 1 across every CMO group —
              // the source document runs 1…17 over both sections. Never
              // from the stored code, which carries whatever the data
              // does (a duplicated "PO 5" printed as two 5s and skipped 4).
              const rowBase = managerGroups
                .slice(0, groupIndex)
                .reduce((count, prior) => count + prior.items.length, 0)
              return (
                <tbody key={group.heading}>
                  <tr>
                    <th className="sd-mapping__col-po">{group.heading}</th>
                    <th className="sd-mapping__col-align">Program Educational Objectives</th>
                    <th className="sd-mapping__col-align">Strategic Goals</th>
                  </tr>
                  {group.items.map((p, rowNumber) => (
                    <tr key={p.id}>
                      <td>{rowBase + rowNumber + 1}. {p.title.replace(/\.$/, '')}</td>
                      <td>{p.peo_text?.trim()}</td>
                      <td>{p.sg_text?.trim()}</td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
      )}

      {/* Course Learning Outcomes */}
      {selectedCourse && (
        <table className="sd-table sd-table--clo">
          <thead>
            <tr>
              <th>Course Learning Outcomes</th>
              <th className="sd-map-col">Program Outcomes</th>
            </tr>
          </thead>
          <tbody>
            {subjectClos.length === 0 && (
              <tr>
                <td colSpan={2}>No course learning outcomes for this subject.</td>
              </tr>
            )}
            {subjectClos.map((c) => (
              <tr key={c.id}>
                <td>{c.code}: {c.description}</td>
                <td>
                  {poLines(c.title).length > 0 ? (
                    poLines(c.title).map((p, i) => <div key={i}>{p}</div>)
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Course Details */}
      <CourseDetails
        course={selectedCourse}
        prereqItems={selectedCourse ? uniqueResolvedRefs(selectedCourse.prerequisite, courses) : []}
        coreqItems={selectedCourse ? uniqueResolvedRefs(selectedCourse.corequisite, courses) : []}
        clos={subjectClos.map((c) => ({ id: c.id, code: c.code, text: c.description || '' }))}
      />
      {footer}
    </div>
  )
}

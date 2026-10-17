// Overall Report: the program's curriculum at a glance.
//
// Shared by all three roles (admin, manager, faculty), like the record list it
// grew out of. A header with the export actions, the alignment spine, a row of
// KPI cards, then panels: outcomes by anchor, the alignment matrix, course
// outcomes, the record mix and the gaps. The searchable record inventory stays
// below as the appendix the Excel export is built from.
//
// The first version built its coverage panels on program_outcomes,
// course_learning_outcomes and clo_po_matrix. All three are empty and nothing
// in the app writes to them, so the dashboard read zero against a system holding
// 33 courses and 44 program outcome rows. This reads the tables the data is
// actually entered in -- the standalone admin lists, the CHED memoranda, the
// goals and the PEOs -- and reports what those hold:
//
//   - 44 outcome ROWS are 27 outcomes, because the same code is written both
//     "PO-11" and "PO 11" and stored once per alignment. utils/alignment.ts
//     collapses them; counting rows would overstate the curriculum by 63%.
//
//   - CMO alignment is a foreign key. PEO and strategic goal alignment is free
//     text in peo_text / sg_text holding comma-separated lists, with a "Goal 2:"
//     in the data that still has to match "Goal 2".
//
// Program outcomes carry no program_id -- they are institutional. With one
// program on file they belong to it; with several they are shared, and the page
// says so rather than attributing them to whichever program is selected.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  addActivityLog,
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomesStandalone,
  fetchProgramEducationalObjectives,
  fetchCourseLearningOutcomesStandalone,
  fetchStrategicGoals,
  fetchChedMemoOrders,
} from '../../services/database'
import type {
  Program,
  Course,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  CourseLearningOutcomeStandalone,
  StrategicGoal,
  ChedMemoOrder,
} from '../../services/database'
import { buildReport, buildRecordMix } from '../../utils/reports'
import { SCHOOL } from '../../utils/report'
import {
  alignmentSummary,
  anchorTallies,
  buildAnchors,
  courseOutcomes,
  poOutcomes,
  spellingIssues,
} from '../../utils/alignment'
import type { PoOutcome } from '../../utils/alignment'
import { normalizeCode } from '../../utils/courseCodes'
import RecordMixDonut from '../../components/RecordMixDonut'
import AlignmentSpine from '../../components/AlignmentSpine'
import OutcomeBars from '../../components/OutcomeBars'
import OutcomeAnchorMatrix from '../../components/OutcomeAnchorMatrix'
import Icon from '../../components/icons'

interface ReportsProps {
  profile: { email?: string | null }
}

function Reports({ profile }: ReportsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
  const [goals, setGoals] = useState<StrategicGoal[]>([])
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c, po, peo, clo, sg, cmo] = await Promise.all([
        fetchPrograms(),
        fetchCourses(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchCourseLearningOutcomesStandalone(),
        fetchStrategicGoals(),
        fetchChedMemoOrders(),
      ])
      setPrograms(p)
      setCourses(c)
      setPos(po)
      setPeos(peo)
      setClos(clo)
      setGoals(sg)
      setCmos(cmo)
      // Default to the first program; the selector below lets any role change it.
      setProgramId((current) => current ?? p[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the report.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const program = programs.find((p) => p.id === programId) ?? null

  // ---- the dashboard, derived from the selected program ----
  const singleProgram = programs.length === 1
  const anchors = useMemo(() => buildAnchors({ cmos, peos, goals }), [cmos, peos, goals])
  const outcomes: PoOutcome[] = useMemo(
    () => (singleProgram ? poOutcomes(pos, anchors) : []),
    [pos, anchors, singleProgram],
  )
  const summary = alignmentSummary(outcomes)
  const tallies = anchorTallies(outcomes, anchors)
  const issues = spellingIssues(outcomes)

  const programCourseList = useMemo(
    () =>
      program
        ? courses
            .filter((c) => c.program_id === program.id)
            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        : [],
    [courses, program],
  )
  const courseOutcomeRows = useMemo(
    () => courseOutcomes(programCourseList, clos),
    [programCourseList, clos],
  )
  const coursesWithOutcomes = courseOutcomeRows.filter((r) => r.outcomeCount > 0).length
  const unalignedOutcomes = outcomes.filter(
    (o) => o.cmo.length + o.peo.length + o.sg.length === 0,
  )
  const coursesWithoutOutcomes = courseOutcomeRows.filter((r) => r.outcomeCount === 0)
  const coursesWithoutInstructor = programCourseList.filter((c) => !c.instructor_id)

  // A learning outcome whose `course` text spells the code differently from the
  // course it matched. The match is lenient by design, so a wrong spelling can
  // still find the right course -- but it is worth knowing, because the next
  // person to edit that row will not get the same match for free.
  const looseMatches = courseOutcomeRows.filter((r) =>
    r.matched.some((raw) => normalizeCode(raw) !== normalizeCode(r.course.code)),
  )

  // ---- the export's source ----
  //
  // There is no on-screen inventory any more: the page is a report about the
  // program, not a listing of the database. The Excel export still carries
  // every record, built the same way -- the whole dataset, nothing filtered --
  // because that is the one artifact that has to leave the app complete.
  const report = buildReport({ programs, courses, pos, peos, clos })

  // The record mix stays global: the standalone PO list cannot be attributed to
  // a program, and a per-program donut that quietly includes or excludes whole
  // record families would misstate the mix.
  const mix = buildRecordMix(report.summary)

  /**
   * Opening the page is the event worth recording — it has no other action of
   * its own. Logged once per load, not per render, and deliberately not keyed
   * on `report` (a fresh object every render, which would log on every
   * keystroke in the search box).
   */
  const loggedOpen = useRef(false)
  useEffect(() => {
    if (loading || loggedOpen.current) return
    loggedOpen.current = true
    addActivityLog('report.viewed', {
      entity: 'report',
      label: program ? `Overall report — ${program.code}` : 'Overall report',
    }).catch(() => {})
  }, [loading, program])

  const download = async () => {
    setDownloading(true)
    setError(null)
    setNotice(null)
    try {
      // Lazy: exceljs is ~1MB and only needed once someone exports.
      const { downloadReportsExcel } = await import('../../utils/reportsXlsx')
      await downloadReportsExcel(report, profile.email ?? '')
      setNotice('Excel workbook downloaded.')
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not create the workbook: ${e.message}`
          : 'Could not create the workbook.',
      )
    } finally {
      setDownloading(false)
    }
  }

  // Captured once per mount. Computing it inline would re-stamp on every
  // render -- typing in the search box would scroll the timestamp forward.
  const generated = useMemo(() => new Date().toLocaleString(), [])

  return (
    <div className="reports">
      <div className="reports-header">
        <div className="page-heading">
          <h2>Overall Report</h2>
          <p>
            Outcome alignment, curriculum coverage and the record inventory —
            read-only; edit records on their own pages.
          </p>
          {program && (
            <p className="reports-header__crumb">
              {SCHOOL.institute} · {program.code} Program
            </p>
          )}
        </div>
        <div className="reports-header__side">
          <label className="field reports-header__select">
            <span>Program</span>
            <select
              className="input"
              value={programId ?? ''}
              disabled={loading || programs.length === 0}
              onChange={(e) => setProgramId(e.target.value)}
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
          </label>
          <span className="reports-header__stamp">Report Generated {generated}</span>
          <div className="reports-header__actions">
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => window.print()}
              title="Print the report as it is on screen"
            >
              <Icon name="print" />
              Print Report
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={download}
              disabled={downloading || loading}
              title="Save every section to one Excel workbook"
            >
              <Icon name="download" />
              {downloading ? 'Preparing…' : 'Export Excel'}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {notice && <p className="msg msg--success" role="status">{notice}</p>}

      {loading ? (
        <p>Loading report…</p>
      ) : !program ? (
        <div className="panel">
          <p className="msg">No programs yet. Create one on the Programs page to report on it.</p>
        </div>
      ) : (
        <>
          {/* ---- the spine first: the number the page exists for ---- */}
          <AlignmentSpine
            programCode={program.code}
            summary={summary}
            coursesWithOutcomes={coursesWithOutcomes}
            coursesTotal={programCourseList.length}
          />

          {/* ---- KPI cards ---- */}
          <div className="stat-grid stat-grid--2026 reports-kpis">
            <KpiCard label="Program" value={program.code} sub={program.name} icon="grid" />
            <KpiCard
              label="Courses"
              value={programCourseList.length}
              sub={`${coursesWithOutcomes} carry learning outcomes`}
              icon="list"
            />
            <KpiCard
              label="Learning Outcomes"
              value={clos.length}
              sub="Across all courses"
              icon="list"
            />
            <KpiCard
              label="Program Outcomes"
              value={summary.outcomes}
              sub={`${pos.length} alignment rows`}
              icon="check"
            />
            <KpiCard
              label="PEOs"
              value={peos.length}
              sub={`${goals.length} goals · ${cmos.length} CHED memos`}
              icon="eye"
            />
            <KpiCard
              label="Anchored"
              value={summary.outcomes === 0 ? '—' : `${summary.percent}%`}
              sub={`${summary.aligned} of ${summary.outcomes} outcomes`}
              icon="check"
            />
            <KpiCard
              label="Gaps"
              value={summary.unaligned + coursesWithoutOutcomes.length}
              sub={`${summary.unaligned} outcomes · ${coursesWithoutOutcomes.length} courses`}
              icon="x"
            />
          </div>

          {/* ---- panels ----
              Asymmetric on purpose: the alignment story reads down the wide
              left column (which document, then every outcome against every
              document), and the right column carries the supporting evidence
              (which course, what else exists, what is missing). A uniform grid
              would give the matrix the same visual weight as the bar chart, and
              it is the denser of the two by an order of magnitude. */}
          <div className="reports-grid">
            <div className="reports-grid__main">
              <section className="panel reports-panel">
                <h3>Outcomes by Anchor</h3>
                <p className="reports-panel__sub">
                  How many program outcomes reach each CHED memorandum, PEO or strategic
                  goal.
                </p>
                {tallies.length === 0 ? (
                  <p className="reports-empty">
                    No CHED memoranda, PEOs or strategic goals recorded yet.
                  </p>
                ) : (
                  <OutcomeBars data={tallies} outcomes={summary.outcomes} />
                )}
              </section>

              <section className="panel reports-panel">
                <h3>Outcome Alignment Matrix</h3>
                <p className="reports-panel__sub">
                  Every program outcome against every document it could be aligned to.
                </p>
                {outcomes.length === 0 ? (
                  <p className="reports-empty">
                    {singleProgram
                      ? 'No program outcomes recorded yet.'
                      : 'Program outcomes are institutional rather than per program, so ' +
                        'this matrix is only charted while the system holds a single program.'}
                  </p>
                ) : (
                  <OutcomeAnchorMatrix
                    outcomes={outcomes}
                    columns={anchors.map((a) => ({ family: a.family, code: a.code }))}
                  />
                )}
              </section>
            </div>

            <div className="reports-grid__side">
              <section className="panel reports-panel">
                <h3>Course Outcomes</h3>
                <p className="reports-panel__sub">
                  Which of the program's courses carry learning outcomes.
                </p>
                <div className="table-wrap oamx__scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Course Title</th>
                        <th className="reports-num">#</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courseOutcomeRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="reports-empty">No courses in this program yet.</td>
                        </tr>
                      ) : (
                        courseOutcomeRows.map(({ course, outcomeCount }) => (
                          <tr
                            key={course.id}
                            className={outcomeCount === 0 ? 'reports-row--archived' : undefined}
                          >
                            <td>{course.code}</td>
                            <td>{course.title}</td>
                            <td className="reports-num">
                              {outcomeCount === 0 ? (
                                <span className="status-badge status-badge--unmapped">none</span>
                              ) : (
                                outcomeCount
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel reports-panel">
                <h3>Record Mix</h3>
                <p className="reports-panel__sub">
                  What the system is made of, across all programs.
                </p>
                <RecordMixDonut mix={mix} />
              </section>

              <section className="panel reports-panel">
                <h3>Gaps</h3>
                <p className="reports-panel__sub">
                  What the data is missing, counted rather than described.
                </p>
                <ul className="reports-gaps">
                  <Gap
                    n={summary.unaligned}
                    label="outcomes anchored to nothing"
                    detail={
                      unalignedOutcomes.length > 0
                        ? unalignedOutcomes.map((o) => o.code).join(', ')
                        : ''
                    }
                  />
                  <Gap
                    n={coursesWithoutOutcomes.length}
                    label="courses with no learning outcomes"
                    detail={
                      coursesWithoutOutcomes.length > 0
                        ? `${coursesWithoutOutcomes
                            .slice(0, 8)
                            .map((r) => r.course.code)
                            .join(', ')}${
                            coursesWithoutOutcomes.length > 8
                              ? ` +${coursesWithoutOutcomes.length - 8} more`
                              : ''
                          }`
                        : ''
                    }
                  />
                  <Gap
                    n={coursesWithoutInstructor.length}
                    label="courses with no instructor assigned"
                  />
                  <Gap
                    n={issues.length}
                    label="outcome codes written more than one way"
                    detail={
                      issues.length > 0
                        ? `${issues
                            .slice(0, 4)
                            .map((i) => `${i.code} (${i.spellings.length} ways)`)
                            .join(', ')}${issues.length > 4 ? ` +${issues.length - 4} more` : ''}`
                        : ''
                    }
                  />
                  <Gap
                    n={summary.outcomes - summary.withGoal}
                    label="outcomes with no strategic goal"
                  />
                  <Gap n={looseMatches.length} label="outcomes whose course code is misspelled" />
                </ul>
              </section>
            </div>
          </div>

          {/* ---- footer: who produced this and what it is not ---- */}
          <footer className="reports-footer">
            <p className="reports-footer__who">
              Overall Report · {program ? `${program.code} Department` : 'All Programs'} ·{' '}
              {SCHOOL.school}
            </p>
            <p className="reports-footer__note">
              Note: this report is generated from system data and is for academic use
              only. Final decisions must be made by authorized personnel.
            </p>
          </footer>
        </>
      )}
    </div>
  )
}

/** One line of the gaps list: a count, what it is a count of, and the names. */
function Gap({ n, label, detail }: { n: number; label: string; detail?: string }) {
  return (
    <li className={n === 0 ? 'reports-gaps__item reports-gaps__item--none' : 'reports-gaps__item'}>
      <span className="reports-gaps__n">{n}</span>
      <span className="reports-gaps__label">{label}</span>
      {detail && <span className="reports-gaps__detail">{detail}</span>}
    </li>
  )
}

/** One KPI card, on the dashboard's own stat-card chrome. */
function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string | number
  sub: string
  icon: 'grid' | 'list' | 'check' | 'eye' | 'x'
}) {
  return (
    <div className="stat-card stat-card--2026 card-enter">
      <div className="stat-card__icon stat-card__icon--reports">
        <Icon name={icon} size={16} />
      </div>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__sub">{sub}</span>
    </div>
  )
}

export default Reports

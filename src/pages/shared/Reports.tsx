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
  fetchCqiActions,
} from '../../services/database'
import type {
  Program,
  Course,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  CourseLearningOutcomeStandalone,
  StrategicGoal,
  ChedMemoOrder,
  CqiAction,
} from '../../services/database'
import { buildReport } from '../../utils/reports'
import { SCHOOL } from '../../utils/report'
import {
  alignmentSummary,
  buildAnchors,
  courseOutcomes,
  coursesInProgram,
  poOutcomes,
} from '../../utils/alignment'
import {
  anchorKeysOf,
  buildMappingReport,
  chartableOutcomes,
  matrixRows,
} from '../../utils/cloPoMapping'
import type { PoOutcome } from '../../utils/alignment'
import { normalizeCode } from '../../utils/courseCodes'
import MappedTargetsDonut from '../../components/MappedTargetsDonut'
import PoCoverageBars from '../../components/PoCoverageBars'
import CloPoMatrix from '../../components/CloPoMatrix'
import Icon from '../../components/icons'
import type { IconName } from '../../components/icons'

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
  const [cqiActions, setCqiActions] = useState<CqiAction[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c, po, peo, clo, sg, cmo, cqi] = await Promise.all([
        fetchPrograms(),
        fetchCourses(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchCourseLearningOutcomesStandalone(),
        fetchStrategicGoals(),
        fetchChedMemoOrders(),
        fetchCqiActions(),
      ])
      setPrograms(p)
      setCourses(c)
      setPos(po)
      setPeos(peo)
      setClos(clo)
      setGoals(sg)
      setCmos(cmo)
      setCqiActions(cqi)
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

  const programCourseList = useMemo(
    () => (program ? coursesInProgram(courses, program.id) : []),
    [courses, program],
  )

  // The mapping the report is built on: which program outcomes each learning
  // outcome names. clo_po_matrix holds no rows and nothing writes to it, so this
  // reads the codes out of the learning outcomes themselves -- see
  // utils/cloPoMapping.ts for why that is narrow enough to trust.
  const mapping = useMemo(() => buildMappingReport(clos, outcomes), [clos, outcomes])
  const charted = useMemo(() => chartableOutcomes(mapping), [mapping])
  const matrixKeys = useMemo(() => anchorKeysOf(mapping), [mapping])
  const matrixCodes = matrixKeys.map(
    (k) => outcomes.find((o) => o.key === k)?.code ?? k,
  )
  const courseCodeOf = useCallback(
    (courseId: string) => {
      const hit = courses.find((c) => c.id === courseId || normalizeCode(c.code) === normalizeCode(courseId))
      return hit?.code ?? courseId
    },
    [courses],
  )
  const matrix = useMemo(
    () => matrixRows(mapping, courseCodeOf),
    [mapping, courseCodeOf],
  )

  // Per course: its outcomes, and how many of them reach a program outcome.
  const courseOutcomeRows = useMemo(
    () => courseOutcomes(programCourseList, clos),
    [programCourseList, clos],
  )
  const mappedByCourse = useMemo(() => {
    const byCourse = new Map<string, { mapped: number; total: number }>()
    for (const course of programCourseList) {
      const key = normalizeCode(course.code)
      const total = courseOutcomeRows.find((r) => r.course.id === course.id)?.outcomeCount ?? 0
      const mapped = mapping.links.filter(
        (l) => normalizeCode(l.clo.course) === key && l.poKeys.length > 0,
      ).length
      byCourse.set(course.id, { mapped, total })
    }
    return byCourse
  }, [programCourseList, courseOutcomeRows, mapping])

  // Which kind of document the mapped learning outcomes reach, for the
  // donut. A learning outcome counts once per family it reaches, so the slices
  // need not total the mapped count -- which is what the legend's counts are
  // for.
  const mappedTargets = useMemo(() => {
    const byKey = new Map(outcomes.map((o) => [o.key, o]))
    const counts = { po: 0, peo: 0, sg: 0, ched: 0 }
    for (const link of mapping.links) {
      if (link.poKeys.length === 0) continue
      counts.po += 1
      const reached = link.poKeys.map((k) => byKey.get(k)).filter(Boolean)
      if (reached.some((o) => o!.peo.length > 0)) counts.peo += 1
      if (reached.some((o) => o!.sg.length > 0)) counts.sg += 1
      // A CMO alignment IS a CHED memorandum reference: the memo table holds
      // them, and cmo_id points into it.
      if (reached.some((o) => o!.cmo.length > 0)) counts.ched += 1
    }
    return counts
  }, [mapping, outcomes])

  // ---- the export's source ----
  //
  // There is no on-screen inventory any more: the page is a report about the
  // program, not a listing of the database. The Excel export still carries
  // every record, built the same way -- the whole dataset, nothing filtered --
  // because that is the one artifact that has to leave the app complete.
  const report = buildReport({ programs, courses, pos, peos, clos })

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
          {/* ---- KPI row ----
              Eight tiles in one row, each with an icon, a figure and the
              qualifier that makes the figure mean something -- a count on its
              own ("33") invites the reader to assume it is the answer. */}
          <div className="stat-grid stat-grid--2026 reports-kpis">
            <KpiCard label="Total Programs" value={programs.length} sub={program.code} icon="cap" />
            <KpiCard
              label="Total Courses"
              value={programCourseList.length}
              sub="Across all year levels"
              icon="book"
            />
            <KpiCard
              label="Total CLOs"
              value={clos.length}
              sub="From all courses"
              icon="doc"
            />
            <KpiCard
              label="Total POs"
              value={summary.outcomes}
              sub="Program Outcomes"
              icon="target"
            />
            <KpiCard
              label="Total PEOs"
              value={peos.length}
              sub="Program Educational Objectives"
              icon="people"
            />
            <KpiCard
              label="Mapping Coverage"
              value={mapping.totalClos === 0 ? '—' : `${mapping.coveragePercent}%`}
              sub={`(${mapping.mappedClos} / ${mapping.totalClos} CLOs)`}
              icon="check"
              tone="good"
            />
            <KpiCard
              label="Unmapped / Incomplete"
              value={mapping.gaps.length}
              sub="CLOs / Relationships"
              icon="warning"
              tone={mapping.gaps.length > 0 ? 'bad' : 'good'}
            />
            <KpiCard
              label="CQI Actions"
              value={cqiActions.length}
              sub="Open Recommendations"
              icon="actions"
              tone={cqiActions.length > 0 ? 'warn' : 'neutral'}
            />
          </div>

          {/* ---- panels: three across, two rows ----
              The arrangement of the CQI report brief: mapping summary, PO
              coverage chart and the CLO-PO matrix on the first row; alignment
              mix, mapping gaps and CQI monitoring on the second. */}
          <div className="reports-panels">
            {/* 1 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="book" title="Curriculum Mapping Summary" />
              <div className="table-wrap reports-scroll">
                <table className="table reports-summary">
                  <thead>
                    <tr>
                      <th>Course Code</th>
                      <th>Course Title</th>
                      <th className="reports-num">Year Level</th>
                      <th className="reports-num">Semester</th>
                      <th className="reports-num"># of CLOs</th>
                      <th>Mapping Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseOutcomeRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="reports-empty">No courses in this program yet.</td>
                      </tr>
                    ) : (
                      courseOutcomeRows.map(({ course, outcomeCount }) => {
                        const roll = mappedByCourse.get(course.id) ?? { mapped: 0, total: 0 }
                        const badge = statusBadge(roll)
                        return (
                          <tr key={course.id}>
                            <td>{course.code}</td>
                            <td className="reports-course-title">{course.title}</td>
                            <td className="reports-num">{course.year_level ?? BLANK}</td>
                            <td className="reports-num">{course.semester ?? BLANK}</td>
                            <td className="reports-num">{outcomeCount}</td>
                            <td><span className={badge.className}>{badge.label}</span></td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PanelFoot
                left={`Showing ${courseOutcomeRows.length} of ${programCourseList.length} courses`}
                action="View All Courses"
              />
            </section>

            {/* 2 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="chart" title="PO Coverage Chart" />
              <p className="reports-panel__sub">
                Percentage of CLOs mapped to each Program Outcome.
              </p>
              {charted.rows.length === 0 && charted.uncovered === 0 ? (
                <p className="reports-empty">No program outcomes recorded yet.</p>
              ) : (
                <PoCoverageBars
                  rows={charted.rows.map((r) => ({
                    code: r.outcome.code,
                    percent: r.percent,
                    count: r.cloCount,
                  }))}
                  uncovered={charted.uncovered}
                  hidden={charted.hidden}
                  totalClos={mapping.totalClos}
                />
              )}
            </section>

            {/* 3 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="grid" title="CLO-PO Alignment Matrix" />
              {matrix.length === 0 ? (
                <p className="reports-empty">No learning outcomes recorded yet.</p>
              ) : matrixKeys.length === 0 ? (
                <p className="reports-empty">
                  No learning outcome names a program outcome yet — the matrix fills in as
                  outcomes are mapped.
                </p>
              ) : (
                <CloPoMatrix rows={matrix} columns={matrixCodes} columnKeys={matrixKeys} />
              )}
            </section>

            {/* 4 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="target" title="Outcomes Alignment by Type" />
              <p className="reports-panel__sub">
                Distribution of mapped CLOs across PO, PEO and Strategic Goals.
              </p>
              <MappedTargetsDonut
                slices={[
                  { key: 'po', label: 'PO', count: mappedTargets.po },
                  { key: 'peo', label: 'PEO', count: mappedTargets.peo },
                  { key: 'sg', label: 'Strategic Goal', count: mappedTargets.sg },
                  { key: 'ched', label: 'CHED', count: mappedTargets.ched },
                ]}
                mapped={mapping.mappedClos}
                total={mapping.totalClos}
              />
            </section>

            {/* 5 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="warning" title="Mapping Gaps" />
              <p className="reports-panel__sub">
                CLOs with no program outcome mapping.
              </p>
              <div className="table-wrap reports-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course Code</th>
                      <th>CLO Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.gaps.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="reports-empty">
                          {mapping.totalClos === 0
                            ? 'No learning outcomes to check yet.'
                            : 'Every learning outcome maps to a program outcome.'}
                        </td>
                      </tr>
                    ) : (
                      mapping.gaps.map((gap) => (
                        <tr key={gap.clo.id}>
                          <td>{courseCodeOf(gap.clo.course)}</td>
                          <td className="reports-gap-clo">
                            {gap.clo.title || gap.clo.description || BLANK}
                          </td>
                          <td>
                            <span className="status-badge status-badge--unmapped">Unmapped</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PanelFoot left="" action="View All Gaps" />
            </section>

            {/* 6 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="actions" title="CQI Monitoring" />
              <p className="reports-panel__sub">
                Latest recommendations and action items.
              </p>
              <div className="table-wrap reports-scroll">
                <table className="table reports-cqi">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Recommendation</th>
                      <th>Responsible</th>
                      <th>Status</th>
                      <th>Target Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cqiActions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="reports-empty">
                          No recommendations recorded yet.
                        </td>
                      </tr>
                    ) : (
                      cqiActions.map((a) => (
                        <tr key={a.id}>
                          <td>{a.code}</td>
                          <td>{a.recommendation}</td>
                          <td>{a.responsible || BLANK}</td>
                          <td>
                            <span className={`status-badge status-badge--${cqiTone(a.status)}`}>
                              {cqiLabel(a.status)}
                            </span>
                          </td>
                          <td className="reports-cqi__date">{formatTarget(a.target_date)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PanelFoot left="" action="View All Actions" />
            </section>
          </div>

          {/* ---- footer: who produced this and what it is not ---- */}
          <footer className="reports-footer">
            <p className="reports-footer__who">
              <span className="reports-footer__mark">
                <Icon name="cap" size={15} />
              </span>
              CQI Monitoring System
              <span className="reports-footer__sep">|</span>
              {program ? `${program.code} Department` : 'All Programs'}
              <span className="reports-footer__sep">·</span>
              {SCHOOL.institute}
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

/** Shown where a record has nothing recorded, rather than as an empty cell. */
const BLANK = '—'

/**
 * A course's mapping status, from how many of its learning outcomes reach a
 * program outcome.
 *
 * "No CLOs" is kept distinct from "Unmapped": a course with no outcomes has
 * nothing to map, which is a different fact from having outcomes and leaving
 * them unmapped, and the report says which it is.
 */
function statusBadge({ mapped, total }: { mapped: number; total: number }) {
  if (total === 0) return { label: 'No CLOs', className: 'status-badge status-badge--none' }
  if (mapped === 0) return { label: 'Unmapped', className: 'status-badge status-badge--unmapped' }
  if (mapped < total)
    return { label: 'Partially Mapped', className: 'status-badge status-badge--partial' }
  return { label: 'Mapped', className: 'status-badge status-badge--mapped' }
}

const CQI_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
} as const

const cqiLabel = (status: keyof typeof CQI_LABELS) => CQI_LABELS[status] ?? 'Pending'
const cqiTone = (status: keyof typeof CQI_LABELS) =>
  status === 'completed' ? 'mapped' : status === 'in_progress' ? 'partial' : 'unmapped'

/** "2026-12-01" -> "Dec 2026". A null target date is not an error. */
function formatTarget(date: string | null): string {
  if (!date) return BLANK
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return BLANK
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * A panel's footer line: a count on the left, a "view all" action on the right.
 *
 * The action is deliberately inert for now -- there is no second page to send
 * it to, and a link that goes nowhere is worse than one that is obviously not
 * there yet. It is a span, not a button, so it cannot be clicked and fail.
 */
function PanelFoot({ left, action }: { left: string; action: string }) {
  return (
    <div className="reports-panel__foot">
      <span>{left}</span>
      <span className="reports-panel__more">{action} →</span>
    </div>
  )
}

/**
 * A panel's icon-and-title line.
 *
 * Every panel gets one, so the six headers on the page read as six of the same
 * thing. The title is the h3 rather than the rule below it: the panel is a
 * section of the report, and the heading is what a screen reader and the print
 * outline both navigate by.
 */
function PanelHead({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="reports-panel__head">
      <span className="reports-panel__icon">
        <Icon name={icon} size={15} />
      </span>
      <h3>{title}</h3>
    </div>
  )
}

/**
 * One KPI tile.
 *
 * `tone` colours the figure only. A count of zero is not an error, so the tiles
 * that can legitimately be zero default to neutral and the caller decides
 * whether a number deserves attention -- "2 unaligned" in amber is information,
 * the same 2 in red would read as a failure.
 */
function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  sub: string
  icon: IconName
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  return (
    <div className="stat-card stat-card--2026 reports-kpi card-enter">
      <div className="stat-card__icon stat-card__icon--reports">
        <Icon name={icon} size={16} />
      </div>
      <span className="stat-card__label">{label}</span>
      <span className={`stat-card__value reports-kpi__value reports-kpi__value--${tone}`}>
        {value}
      </span>
      <span className="stat-card__sub">{sub}</span>
    </div>
  )
}

export default Reports

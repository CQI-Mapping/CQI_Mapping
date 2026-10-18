// Overall Report: the program's curriculum at a glance.
//
// Shared by all three roles (admin, manager, faculty), like the record list it
// grew out of. A header with the export actions, a row of KPI cards, then six
// panels: the curriculum mapping summary, PO coverage, the outcome coverage
// chart, the alignment mix, the mapping gaps and CQI monitoring.
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
  UserRole,
} from '../../services/database'
import { buildReport } from '../../utils/reports'
import { SCHOOL } from '../../utils/report'
import { saveBlob } from '../../utils/download'
import { buildReportsCsv, overallReportFileName } from '../../utils/reportsCsv'
import {
  alignmentSummary,
  buildAnchors,
  courseOutcomes,
  coursesInProgram,
  poOutcomes,
} from '../../utils/alignment'
import { buildMappingReport, chartableOutcomes, poLabel } from '../../utils/cloPoMapping'
import type { PoOutcome } from '../../utils/alignment'
import { normalizeCode } from '../../utils/courseCodes'
import MappedTargetsDonut from '../../components/MappedTargetsDonut'
import PoCoverageBars from '../../components/PoCoverageBars'
import OutcomeCoverageChart from '../../components/OutcomeCoverageChart'
import Icon from '../../components/icons'
import type { IconName } from '../../components/icons'

interface ReportsProps {
  profile: { email?: string | null; role?: UserRole }
  onNavigate?: (page: string) => void
}

/**
 * Academic years around the current one. The school year is named by the two
 * calendar years it spans, starting in June: by June the current year is
 * "2026 - 2027", from January to May it is still the previous pair. The
 * banner opens on the middle entry and may be turned to any of the three;
 * the summary's per-course academic-year selects offer the whole list.
 */
function academicYearOptions(today = new Date()): string[] {
  const start = today.getFullYear() - (today.getMonth() >= 5 ? 0 : 1)
  return [start - 1, start, start + 1].map((s) => `${s} - ${s + 1}`)
}

/**
 * The semester in progress on `today`, worked out on the same June-start
 * calendar the academic year follows: the first semester runs June through
 * October, the second November through May's close of the school year --
 * so January sits at the tail of the pairing academicYearOptions chose for
 * it, not on a new first semester. Returns the option string the selects
 * trade in, "1" or "2", so it backs the summary cells' fallback and the CSV
 * header without translation.
 */
function currentSemester(today = new Date()): string {
  return today.getMonth() >= 5 && today.getMonth() <= 9 ? '1' : '2'
}

/** "2026 - 2027" from the starting year the column stores. */
function ayLabel(v: number | null | undefined): string | null {
  return v == null ? null : `${v} - ${v + 1}`
}

function Reports({ profile, onNavigate }: ReportsProps) {
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
  /**
   * The academic year the report covers. It opens on the current school
   * year by the June-start calendar, and the banner offers to turn it to a
   * neighbouring year -- the choice a picker, not a stated fact.
   */
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[1])

  /**
   * The report's semester context, read once per mount from the date on the
   * same June-start calendar the academic year uses. The banner does not
   * state it; it backs the summary's semester cells -- the dash-fallback a
   * course without a term displays -- and rides into the CSV header.
   */
  const [reportSemester] = useState(currentSemester())

  // Where "View All Courses" leads: the courses page each role is actually
  // allowed into -- the manager's course list, the admin's curriculum, which
  // is where its programs and their courses live. A faculty reader has no
  // courses page in their sidebar, so their footer stays inert text rather
  // than a link that cannot go anywhere.
  const courseListPage =
    profile.role === 'manager' ? 'course' : profile.role === 'admin' ? 'curriculum' : null

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

  // Academic years this curriculum actually spans, once the term columns
  // carry data. Zero until then -- the tile keeps its fallback rather than
  // announcing "Across 0 years".
  const yearsOffered = useMemo(
    () => new Set(programCourseList.map((c) => c.year_level).filter((y) => y != null)).size,
    [programCourseList],
  )

  // The mapping the report is built on: which program outcomes each learning
  // outcome names. clo_po_matrix holds no rows and nothing writes to it, so this
  // reads the codes out of the learning outcomes themselves -- see
  // utils/cloPoMapping.ts for why that is narrow enough to trust.
  const mapping = useMemo(() => buildMappingReport(clos, outcomes), [clos, outcomes])
  const charted = useMemo(() => chartableOutcomes(mapping), [mapping])
  // The course a learning outcome belongs to, as a code: the gaps panel and
  // the network's node labels resolve the learning outcomes' course text
  // against the program's own course list.
  const courseCodeOf = useCallback(
    (courseId: string) => {
      const hit = courses.find((c) => c.id === courseId || normalizeCode(c.code) === normalizeCode(courseId))
      return hit?.code ?? courseId
    },
    [courses],
  )

  // The coverage chart reads every outcome, not just the mapped ones: its
  // whole point is naming the outcomes nothing reaches.

  // Per course: its outcomes, and how many of them reach a program outcome.
  const courseOutcomeRows = useMemo(
    () => courseOutcomes(programCourseList, clos),
    [programCourseList, clos],
  )
  const coursesWithoutOutcomes = courseOutcomeRows.filter((r) => r.outcomeCount === 0)
  const coursesWithoutInstructor = programCourseList.filter((c) => !c.instructor_id)
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
    const reaches: Array<{ code: string; targets: { label: string; color: string }[] }> = []
    for (const link of mapping.links) {
      if (link.poKeys.length === 0) continue
      counts.po += 1
      const pos = link.poKeys.map((k) => byKey.get(k)).filter(Boolean)
      const peoSet = new Set(pos.flatMap((o) => o!.peo))
      const sgSet = new Set(pos.flatMap((o) => o!.sg))
      const cmoSet = new Set(pos.flatMap((o) => o!.cmo))
      if (peoSet.size > 0) counts.peo += 1
      if (sgSet.size > 0) counts.sg += 1
      // A CMO alignment IS a CHED memorandum reference: the memo table holds
      // them, and cmo_id points into it.
      if (cmoSet.size > 0) counts.ched += 1
      // The chain the panel names: the outcomes the CLO reaches, then the
      // PEOs and goals those outcomes anchor to -- all chips under the ring.
      reaches.push({
        code: link.clo.code.trim() || '—',
        targets: [
          ...pos.map((o) => ({ label: poLabel(o!.code), color: '#15803d' })),
          ...[...peoSet].map((c) => ({ label: c, color: '#4d9a2f' })),
          ...[...sgSet].map((c) => ({ label: c, color: '#3b82f6' })),
        ],
      })
    }
    return { counts, reaches }
  }, [mapping, outcomes])

  // The gaps panel reads two directions of the same missing link: learning
  // outcomes that name nothing, and outcomes nothing names. This is the
  // second list -- the coverage rows with no learning outcome on them.
  const [gapView, setGapView] = useState<'clos' | 'pos'>('clos')
  const uncoveredOutcomes = useMemo(
    () => mapping.coverage.filter((row) => row.cloCount === 0),
    [mapping],
  )

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
      // Plain text, no dependency to fetch: every section flattened into one
      // CSV grid, with the academic year and stamp riding in the header so the
      // file can be forwarded without the app that produced it.
      const csv = buildReportsCsv(report, { academicYear, semester: reportSemester, generated })
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), overallReportFileName())
      setNotice('CSV file downloaded.')
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not create the CSV: ${e.message}`
          : 'Could not create the CSV.',
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
      {/* The banner is the image's title band: a document mark against the
          title and its one-line scope on the left; the academic year, program
          and generated stamp in labelled fields above the two actions on the
          right. Every part is chrome a report page needs, which is why it is
          one card and not floating text. */}
      <div className="reports-banner">
        <div className="reports-banner__id">
          <span className="reports-banner__mark">
            <Icon name="doc" size={24} />
          </span>
          <div className="reports-banner__title">
            <h2>Overall Report</h2>
            <p className="reports-banner__lead">
              Comprehensive overview of curriculum mapping, outcomes alignment,
              and continuous quality improvement.
            </p>
            {program && (
              <p className="reports-banner__crumb">
                {SCHOOL.institute} · {program.code} Program
              </p>
            )}
          </div>
        </div>

        <div className="reports-banner__side">
          <div className="reports-banner__controls">
            <label className="reports-filter">
              <span className="reports-filter__label">
                <Icon name="calendar" size={11} />
                Academic Year
              </span>
              <select
                className="input reports-filter__select"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              >
                {academicYearOptions().map((ay) => (
                  <option key={ay} value={ay}>
                    {ay}
                  </option>
                ))}
              </select>
            </label>

            <label className="reports-filter">
              <span className="reports-filter__label">Program</span>
              <select
                className="input reports-filter__select"
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

            <div className="reports-filter">
              <span className="reports-filter__label">
                <Icon name="calendar" size={11} />
                Report Generated
              </span>
              <span className="reports-filter__when">{generated}</span>
            </div>
          </div>

          <div className="reports-banner__actions">
            <button
              className="btn btn--sm reports-banner__print"
              onClick={() => window.print()}
              title="Print the report as it is on screen"
            >
              <Icon name="print" />
              Print Report
            </button>
            <button
              className="btn btn--sm reports-banner__csv"
              onClick={download}
              disabled={downloading || loading}
              title="Save every section to one CSV file"
            >
              <Icon name="download" />
              {downloading ? 'Preparing…' : 'Export CSV'}
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
              sub={
                yearsOffered
                  ? `Across ${yearsOffered} year${yearsOffered === 1 ? '' : 's'}`
                  : 'Across all academic years'
              }
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
              sub={`(${mapping.mappedClos}) / ${mapping.totalClos} CLOs`}
              icon="checkCircle"
              tone="good"
            />
            <KpiCard
              label="Unmapped / Incomplete"
              value={summary.unaligned + mapping.gaps.length}
              sub="CLOs / Relationships"
              icon="warning"
              tone="warn"
            />
            <KpiCard
              label="CQI Actions"
              value={summary.unaligned + coursesWithoutOutcomes.length + coursesWithoutInstructor.length}
              sub="Open Recommendations"
              icon="actions"
              tone="good"
            />
          </div>

          {/* ---- panels: three across, two rows ----
              The arrangement of the CQI report brief: mapping summary, PO
              coverage chart and the outcome coverage bars below it; alignment
              mix, mapping gaps and CQI monitoring on the second. */}
          <div className="reports-panels">
            {/* 1 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="book" title="Curriculum Mapping Summary" />
              <p className="reports-panel__sub">
                Term placement and mapping coverage of every course in the program.
              </p>
              <div className="table-wrap reports-scroll">
                <table className="table reports-summary">
                  <thead>
                    <tr>
                      <th>Course Code</th>
                      <th>Course Title</th>
                      <th className="reports-num">Academic Year</th>
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
                            <td className="reports-num">
                              {ayLabel(course.year_level) ?? academicYear}
                            </td>
                            <td className="reports-num">
                              {course.semester ?? reportSemester}
                            </td>
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
                left={`${courseOutcomeRows.length} courses`}
                action="View All Courses"
                onAction={courseListPage ? () => onNavigate?.(courseListPage) : undefined}
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
              <PanelHead icon="table" title="Outcome Coverage Bar Chart" />
              <p className="reports-panel__sub">
                Shows each PO alongside the percentage or number of CLOs mapped to it.
              </p>
              {mapping.coverage.length === 0 ? (
                <p className="reports-empty">No program outcomes recorded yet.</p>
              ) : (
                <OutcomeCoverageChart rows={mapping.coverage} totalClos={mapping.totalClos} />
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
                  { key: 'po', label: 'PO', count: mappedTargets.counts.po },
                  { key: 'peo', label: 'PEO', count: mappedTargets.counts.peo },
                  { key: 'sg', label: 'Strategic Goal', count: mappedTargets.counts.sg },
                  { key: 'ched', label: 'CHED', count: mappedTargets.counts.ched },
                ]}
                mapped={mapping.mappedClos}
                total={mapping.totalClos}
                reaches={mappedTargets.reaches}
              />
            </section>

            {/* 5 -- both directions of a gap: CLOs that name no outcome,
                     outcomes no CLO names. The tabs carry live counts. -- */}
            <section className="panel reports-panel">
              <PanelHead icon="warning" title="Mapping Gaps" />
              <p className="reports-panel__sub">
                Gaps on both sides of the mapping: learning outcomes that name
                no program outcome, and program outcomes no outcome names.
              </p>
              <div className="rgap__tabs" role="tablist" aria-label="Gap direction">
                <button
                  type="button"
                  role="tab"
                  aria-selected={gapView === 'clos'}
                  className={gapView === 'clos' ? 'rgap__tab rgap__tab--on' : 'rgap__tab'}
                  onClick={() => setGapView('clos')}
                >
                  Unmapped CLOs
                  <span className="rgap__count">{mapping.gaps.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={gapView === 'pos'}
                  className={gapView === 'pos' ? 'rgap__tab rgap__tab--on' : 'rgap__tab'}
                  onClick={() => setGapView('pos')}
                >
                  Unreached POs
                  <span className="rgap__count">{uncoveredOutcomes.length}</span>
                </button>
              </div>
              <div className="table-wrap reports-scroll">
                <table className="table">
                  <thead>
                    {gapView === 'clos' ? (
                      <tr>
                        <th>Course Code</th>
                        <th>CLO Description</th>
                        <th>Status</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>Outcome</th>
                        <th>Description</th>
                        <th>Status</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {gapView === 'clos' ? (
                      mapping.gaps.length === 0 ? (
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
                      )
                    ) : uncoveredOutcomes.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="reports-empty">
                          {mapping.coverage.length === 0
                            ? 'No program outcomes recorded yet.'
                            : 'Every program outcome is covered by a mapped learning outcome.'}
                        </td>
                      </tr>
                    ) : (
                      uncoveredOutcomes.map((row) => (
                        <tr key={row.outcome.key}>
                          <td>{poLabel(row.outcome.code)}</td>
                          <td className="reports-gap-clo">{row.outcome.title}</td>
                          <td>
                            <span className="status-badge status-badge--unmapped">
                              No CLO coverage
                            </span>
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
 * A panel's footer line: a count on the left, a "view all" action on the
 * right. The action earns its arrow only where it leads somewhere; without a
 * destination it stays a span, because a control that cannot do anything is
 * worse than the text admitting it.
 */
function PanelFoot({
  left,
  action,
  onAction,
}: {
  left: string
  action: string
  onAction?: () => void
}) {
  return (
    <div className="reports-panel__foot">
      <span>{left}</span>
      {onAction ? (
        <button type="button" className="reports-panel__more" onClick={onAction}>
          {action} →
        </button>
      ) : (
        <span className="reports-panel__more">{action} →</span>
      )}
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
 * The image's tile reads icon-and-label on the first line, then the figure,
 * then the qualifier — centred as one column, so the eye drops from the icon
 * to the number it explains without a left edge to hunt for.
 *
 * `tone` colours the icon only. All figures are dark: a coloured number is a
 * judgement, and the tile beside it ("45 unmapped") is neither good nor bad —
 * it is the count of what still isn't written down.
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
      <div className="reports-kpi__top">
        <span className={`reports-kpi__icon reports-kpi__icon--${tone}`}>
          <Icon name={icon} size={17} />
        </span>
        <span className="stat-card__label">{label}</span>
      </div>
      <span className="stat-card__value reports-kpi__value">{value}</span>
      <span className="stat-card__sub">{sub}</span>
    </div>
  )
}

export default Reports

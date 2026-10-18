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
  updateCourse,
  courseTermColumnsExist,
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
  profile: { email?: string | null; role?: UserRole }
  onNavigate?: (page: string) => void
}

/**
 * Academic years around the current one. The school year is named by the two
 * calendar years it spans, starting in June: by June the current year is
 * "2026 - 2027", from January to May it is still the previous pair. The
 * banner displays the middle entry as the report's year; the summary's
 * per-course academic-year selects offer the whole list.
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
 * trade in, "1" or "2", so it can be stated in the banner and used as the
 * summary cells' fallback without translation.
 */
function currentSemester(today = new Date()): string {
  return today.getMonth() >= 5 && today.getMonth() <= 9 ? '1' : '2'
}

/**
 * Academic years a course can be offered in, the same list the banner's
 * picker offers. The column stores the starting year -- "2026" for
 * "2026 - 2027" -- so the value stays a plain integer while the cell shows
 * the pair the academic calendar actually calls it.
 */
const YEAR_OPTIONS = academicYearOptions().map((ay) => ({
  value: ay.split(' - ')[0] ?? ay,
  label: ay,
}))

/** Two regular semesters plus the optional mid-year term. */
const SEMESTER_OPTIONS = [1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))

/** "2026 - 2027" from the starting year the column stores. */
function ayLabel(v: number | null | undefined): string | null {
  return v == null ? null : `${v} - ${v + 1}`
}

/**
 * The term cell of a course the user may write: a select dressed as table
 * text, so thirty-two extra controls do not turn the summary into a form.
 * The empty option is the "not recorded yet" state the read-only cell shows
 * as a dash.
 */
function TermSelect({
  course,
  field,
  options,
  busy,
  onChange,
  fallback,
}: {
  course: Course
  field: 'year_level' | 'semester'
  options: { value: string; label: string }[]
  busy: boolean
  onChange: (course: Course, field: 'year_level' | 'semester', raw: string) => void
  /**
   * What the cell shows -- and offers to save -- when the course records
   * nothing of its own. Academic year and semester fall back to the report's
   * banner context, so the columns display a value on every row; without a
   * fallback the blank option stands for "not recorded".
   */
  fallback?: string
}) {
  const raw = course[field]
  return (
    <select
      className="reports-termsel"
      value={raw == null ? (fallback ?? '') : String(raw)}
      disabled={busy}
      onChange={(e) => onChange(course, field, e.target.value)}
      aria-label={`${field === 'year_level' ? 'Academic year' : 'Semester'} of ${course.code}`}
    >
      {fallback == null && <option value="">—</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
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
   * The academic year the report covers: the current one by the June-start
   * calendar, read once per mount. It is a fact of the report, stated as
   * text in the banner -- not a filter, and not offered as a choice.
   */
  const [academicYear] = useState(academicYearOptions()[1])

  /**
   * The semester the report covers: read once per mount from the date, by
   * the same June-start calendar the academic year uses. Like the year, the
   * banner states it as text rather than offering it -- and it doubles as
   * the fallback the summary's semester cells display and confirm.
   */
  const [reportSemester] = useState(currentSemester())

  /**
   * Which summary cells are mid-save, keyed "courseId:field". A cell that is
   * saving is disabled, so one cell never double-fires, and the busy set —
   * not a single flag — lets several rows be set at once without blocking
   * each other.
   */
  const [termBusy, setTermBusy] = useState<Set<string>>(new Set())

  /**
   * Whether the database actually has the term columns. Probed once on load,
   * and a save that hits the missing columns flips it too, so the panel and
   * the cells agree no matter which of them noticed first.
   */
  const [termsReady, setTermsReady] = useState(true)

  // Terms are curriculum data, and the RLS policies let managers and admins
  // write them; everyone else just reads. On top of the role gate sits a
  // schema check: the term columns ship as a migration, and a database that
  // has not run it gets a setup note in the panel rather than controls that
  // could only fail on save.
  const roleCanEditTerm = profile.role === 'admin' || profile.role === 'manager'
  const canEditTerm = roleCanEditTerm && termsReady

  // Where "View All Courses" leads: the courses page each role is actually
  // allowed into -- the manager's course list, the admin's curriculum, which
  // is where its programs and their courses live. A faculty reader has no
  // courses page in their sidebar, so their footer stays inert text rather
  // than a link that cannot go anywhere.
  const courseListPage =
    profile.role === 'manager' ? 'course' : profile.role === 'admin' ? 'curriculum' : null

  // The report's own academic year -- the banner's picker. A course with no
  // term recorded displays it, so the summary column reads a value on every
  // row instead of a dash; picking a cell's value materialises it on the
  // course. Courses that do record their own year always win.
  const reportYearStart = academicYear.split(' - ')[0] ?? ''

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
      courseTermColumnsExist()
        .then(setTermsReady)
        .catch(() => setTermsReady(true))
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


  /**
   * Sets one term field of one course, from one cell of the summary table.
   *
   * The write is optimistic: a summarized board of 33 courses should not grow
   * a spinner per cell, so the cell takes the value at once and reverts it if
   * the save fails. The busy key disables only the one cell that is saving.
   *
   * The value arrives as the select's string and leaves as a small integer
   * (null for the blank option), which is what the column holds.
   */
  const setTerm = useCallback(
    async (course: Course, field: 'year_level' | 'semester', raw: string) => {
      const value = raw === '' ? null : Number(raw)
      if ((course[field] ?? null) === value) return

      const key = `${course.id}:${field}`
      const previous = course[field] ?? null
      setTermBusy((busy) => new Set(busy).add(key))
      setCourses((all) =>
        all.map((c) => {
          if (c.id !== course.id) return c
          const next = { ...c }
          if (field === 'year_level') next.year_level = value
          else next.semester = value
          return next
        }),
      )

      try {
        const patch: Partial<Course> =
          field === 'year_level' ? { year_level: value } : { semester: value }
        await updateCourse(course.id, patch)
        addActivityLog('course.term_set', {
          entity: 'course',
          entity_id: course.id,
          label: `${course.code} — ${field === 'year_level' ? 'academic year' : 'semester'} set to ${value == null ? 'none' : ayLabel(value)}`,
        }).catch(() => {})
      } catch (e) {
        setCourses((all) =>
          all.map((c) => {
            if (c.id !== course.id) return c
            const next = { ...c }
            if (field === 'year_level') next.year_level = previous
            else next.semester = previous
            return next
          }),
        )
        const msg = e instanceof Error ? e.message : String(e)
        // The one failure this table can hit today: the term columns are in
        // supabase-schema.sql but not yet in the live database. Naming the
        // exact statements beats "network error" from a report page.
        if (/year_level|semester|column|schema/i.test(msg)) {
          // The columns are simply not there yet. The setup note -- the SQL
          // and its copy button -- appears in the panel itself and the
          // selects stand down; that is the whole message, nothing lost.
          setTermsReady(false)
        } else {
          setError(`Could not save ${course.code}: ${msg}`)
        }
      } finally {
        setTermBusy((busy) => {
          const next = new Set(busy)
          next.delete(key)
          return next
        })
      }
    },
    [],
  )

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
            <div className="reports-filter">
              <span className="reports-filter__label">
                <Icon name="calendar" size={11} />
                Academic Year
              </span>
              <span className="reports-filter__when">{academicYear}</span>
            </div>

            <div className="reports-filter">
              <span className="reports-filter__label">
                <Icon name="calendar" size={11} />
                Semester
              </span>
              <span className="reports-filter__when">{reportSemester}</span>
            </div>

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
              coverage chart and the CLO-PO matrix on the first row; alignment
              mix, mapping gaps and CQI monitoring on the second. */}
          <div className="reports-panels">
            {/* 1 ---- */}
            <section className="panel reports-panel">
              <PanelHead icon="book" title="Curriculum Mapping Summary" />
              <p className="reports-panel__sub">
                Term placement and mapping coverage of every course in the program.
              </p>
              {roleCanEditTerm && !termsReady && <TermSetupNote />}
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
                              {canEditTerm ? (
                                <TermSelect
                                  course={course}
                                  field="year_level"
                                  options={YEAR_OPTIONS}
                                  busy={termBusy.has(`${course.id}:year_level`)}
                                  onChange={setTerm}
                                  fallback={reportYearStart}
                                />
                              ) : (
                                ayLabel(course.year_level) ?? academicYear
                              )}
                            </td>
                            <td className="reports-num">
                              {canEditTerm ? (
                                <TermSelect
                                  course={course}
                                  field="semester"
                                  options={SEMESTER_OPTIONS}
                                  busy={termBusy.has(`${course.id}:semester`)}
                                  onChange={setTerm}
                                  fallback={reportSemester}
                                />
                              ) : (
                                course.semester ?? reportSemester
                              )}
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
              <PanelHead icon="grid" title="CLO-PO Alignment Matrix" />
              <p className="reports-panel__sub">
                Which learning outcomes reach which program outcome.
              </p>
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
 * The summary's setup note: the term migration exists on disk, the database
 * has not run it. States the fix as runnable SQL with a one-click copy,
 * because the action between "read this" and "columns exist" is a paste into
 * another tab.
 */
function TermSetupNote() {
  const sql =
    'ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS year_level INTEGER;\n' +
    'ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS semester INTEGER;'
  const [copied, setCopied] = useState(false)
  return (
    <div className="reports-setup">
      <p>
        Term editing is off: the database is missing the <code>year_level</code> and{' '}
        <code>semester</code> columns. Paste this into the Supabase SQL editor, run it,
        then reload this page.
      </p>
      <pre>{sql}</pre>
      <button
        type="button"
        className="reports-setup__copy"
        onClick={() => {
          navigator.clipboard
            .writeText(sql)
            .then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
            .catch(() => {})
        }}
      >
        {copied ? 'Copied ✓' : 'Copy SQL'}
      </button>
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

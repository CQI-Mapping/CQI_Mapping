// MapBrief: the program's curriculum at a glance — the KPI tiles, the
// Curriculum Mapping Summary and the PO Coverage Chart that used to open the
// Generate Map page (shared/Reports.tsx). Extracted as a self-contained block
// so all three role dashboards can embed it unchanged: it fetches its own
// data, picks the account's program the same way the report does (assignment,
// then BSIT, then first), and renders with nothing but shared CSS. Generate
// Map keeps only its export toolbar; the PDF still prints these figures,
// computed from the same helpers.
//
// Forked from Reports.tsx on purpose rather than shared with it: the page
// wraps these blocks in its own toolbar and export model, and a shared child
// would drag that context back in. When the computation moves — say, coverage
// gets redefined — Reports' PDF model (utils/reportsPdf.ts) and this block
// both read utils/alignment.ts and utils/cloPoMapping.ts, so the engines stay
// single-source even though the rendering forks.
import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomesStandalone,
  fetchProgramEducationalObjectives,
  fetchCourseLearningOutcomesStandalone,
  fetchStrategicGoals,
  fetchChedMemoOrders,
} from '../services/database'
import type {
  Program,
  Course,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  CourseLearningOutcomeStandalone,
  StrategicGoal,
  ChedMemoOrder,
  UserRole,
} from '../services/database'
import {
  alignmentSummary,
  buildAnchors,
  courseOutcomes,
  coursesInProgram,
  poOutcomes,
} from '../utils/alignment'
import { buildMappingReport, chartableOutcomes } from '../utils/cloPoMapping'
import type { MappingStatus } from '../utils/reportsPdfModel'
import { normalizeCode } from '../utils/courseCodes'
import PoCoverageBars from './PoCoverageBars'

interface MapBriefProps {
  /** The fields of the signed-in profile this brief reads: the role names
      where "View All Courses" leads, the program assignment opens it there. */
  profile: { role?: UserRole; program_id?: string | null } | null
  onNavigate?: (page: string) => void
  /** Blocks slotted between the KPI tiles and the two panels — currently the
      dashboard's OBE Curriculum Map (components/MapPreview.tsx), so the
      figures above and the picture below read as one continuous brief. */
  children?: ReactNode
}

/** Stands in for program assignments the account may not carry yet, the way
 *  the sidebar's PROGRAM_LOGO does: until every account is bound to its
 *  program in the UI, BSIT is the program the system currently serves. */
const FALLBACK_PROGRAM_CODE = 'BSIT'

/**
 * Academic years around the current one, keyed to the same June-start
 * calendar the report uses. The table's per-course year fallback prints the
 * middle entry when a course predates the term columns.
 */
const academicYear = academicYearOptions()[1]
function academicYearOptions(today = new Date()): string[] {
  const start = today.getFullYear() - (today.getMonth() >= 5 ? 0 : 1)
  return [start - 1, start, start + 1].map((s) => `${s} - ${s + 1}`)
}

/**
 * The semester in progress on the same June-start calendar: June–October is
 * the first semester, November–May the second. It backs the summary cells
 * of courses that carry no stored semester.
 */
const reportSemester = currentSemester()
function currentSemester(today = new Date()): string {
  return today.getMonth() >= 5 && today.getMonth() <= 9 ? '1' : '2'
}

/**
 * How a course's stored year reads — program year level for small values
 * ("1st Year"), academic start year for four-digit ones ("AY 2026 - 2027").
 */
function courseYearLabel(v: number | null | undefined): string {
  if (v == null) return ''
  if (v < 100) return `${['1st', '2nd', '3rd'][v - 1] ?? `${v}th`} Year`
  return `AY ${v} - ${v + 1}`
}

/** A course's mapping status badge, worded exactly like the report's table.
 *  "No CLOs" stays distinct from "Unmapped": nothing to map is a different
 *  fact from having outcomes and leaving them unmapped. */
function statusBadge({ mapped, total }: { mapped: number; total: number }): {
  label: MappingStatus
  className: string
} {
  if (total === 0) return { label: 'No CLOs', className: 'status-badge status-badge--none' }
  if (mapped === 0) return { label: 'Unmapped', className: 'status-badge status-badge--unmapped' }
  if (mapped < total)
    return { label: 'Partially Mapped', className: 'status-badge status-badge--partial' }
  return { label: 'Mapped', className: 'status-badge status-badge--mapped' }
}

/** A panel's footer line: a count on the left, a "view all" action on the
 *  right. The action earns its arrow only where it leads somewhere. */
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

/** A panel's title line, read by screen readers and the print outline. */
function PanelHead({ title }: { title: string }) {
  return (
    <div className="reports-panel__head">
      <h3>{title}</h3>
    </div>
  )
}

/** One KPI tile: label, figure and qualifier centred as a single column. */
function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub: string
}) {
  return (
    <div className="stat-card stat-card--2026 reports-kpi card-enter">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value reports-kpi__value">{value}</span>
      <span className="stat-card__sub">{sub}</span>
    </div>
  )
}

function MapBrief({ profile, onNavigate, children }: MapBriefProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
  const [goals, setGoals] = useState<StrategicGoal[]>([])
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])

  const viewerProgramId = profile?.program_id ?? null

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchPrograms(),
      fetchCourses(),
      fetchProgramOutcomesStandalone(),
      fetchProgramEducationalObjectives(),
      fetchCourseLearningOutcomesStandalone(),
      fetchStrategicGoals(),
      fetchChedMemoOrders(),
    ])
      .then(([p, c, po, peo, clo, sg, cmo]) => {
        setPrograms(p)
        setCourses(c)
        setPos(po)
        setPeos(peo)
        setClos(clo)
        setGoals(sg)
        setCmos(cmo)
        setProgramId((current) => {
          if (current) return current
          if (viewerProgramId && p.some((row) => row.id === viewerProgramId)) return viewerProgramId
          const served = p.find((row) => (row.code ?? '').toUpperCase() === FALLBACK_PROGRAM_CODE)
          return served?.id ?? p[0]?.id ?? null
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the curriculum brief.'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const program = programs.find((p) => p.id === programId) ?? null

  // Where "View All Courses" leads: the courses page each role is actually
  // allowed into — the manager's course list, the admin's curriculum. A
  // faculty reader has no courses page in their sidebar, so their footer
  // stays inert text rather than a link that cannot go anywhere.
  const courseListPage =
    profile?.role === 'manager' ? 'course' : profile?.role === 'admin' ? 'curriculum' : null

  // ---- the same derivation Generate Map runs ----
  const anchors = useMemo(() => buildAnchors({ cmos, peos, goals }), [cmos, peos, goals])
  const outcomes = useMemo(() => (pos.length > 0 ? poOutcomes(pos, anchors) : []), [pos, anchors])
  const summary = alignmentSummary(outcomes)

  const programCourseList = useMemo(
    () => (program ? coursesInProgram(courses, program.id) : []),
    [courses, program],
  )
  const programClos = useMemo(() => {
    if (!program) return []
    const codes = new Set(programCourseList.map((c) => normalizeCode(c.code)))
    return clos.filter((cl) => codes.has(normalizeCode(cl.course)))
  }, [program, programCourseList, clos])

  const yearsOffered = useMemo(
    () => new Set(programCourseList.map((c) => c.year_level).filter((y) => y != null)).size,
    [programCourseList],
  )

  const mapping = useMemo(() => buildMappingReport(programClos, outcomes), [programClos, outcomes])
  const charted = useMemo(() => chartableOutcomes(mapping), [mapping])

  const courseOutcomeRows = useMemo(
    () => courseOutcomes(programCourseList, programClos),
    [programCourseList, programClos],
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

  // Coverage the way a coordinator reads it: subjects, not learning
  // outcomes — a subject counts when every learning outcome it holds names
  // a program outcome, so the headline and the table's status badges
  // verify each other.
  const subjectCoverage = useMemo(() => {
    let fully = 0
    for (const course of programCourseList) {
      const roll = mappedByCourse.get(course.id)
      if (roll && roll.total > 0 && roll.mapped === roll.total) fully += 1
    }
    const percent =
      programCourseList.length === 0 ? 0 : Math.round((fully / programCourseList.length) * 100)
    return { fully, total: programCourseList.length, percent }
  }, [programCourseList, mappedByCourse])

  return (
    <div className="map-brief">
      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {loading ? (
        <p className="msg">Loading the curriculum brief…</p>
      ) : !program ? (
        <div className="panel">
          <p className="msg">No programs yet. Create one to brief on it.</p>
        </div>
      ) : (
        <>
          {/* ---- KPI row ----
              Tiles show the label, figure and qualifier that makes the
              figure mean something — a count on its own invites the reader
              to assume it is the answer. */}
          <div className="stat-grid stat-grid--2026 reports-kpis">
            <KpiCard label="Total Programs" value={programs.length} sub={program.code} />
            <KpiCard
              label="Total Courses"
              value={programCourseList.length}
              sub={
                yearsOffered
                  ? `Across ${yearsOffered} year${yearsOffered === 1 ? '' : 's'}`
                  : 'Across all academic years'
              }
            />
            <KpiCard
              label="Total CLO's"
              value={programClos.length}
              sub={program ? `${program.code} courses` : 'From all courses'}
            />
            <KpiCard label="Total PO's" value={summary.outcomes} sub="Program Outcomes" />
            <KpiCard
              label="Total PEO's"
              value={peos.length}
              sub="Program Educational Objectives"
            />
            <KpiCard
              label="Mapping Coverage"
              value={subjectCoverage.total === 0 ? '—' : `${subjectCoverage.percent}%`}
              sub={`(${subjectCoverage.fully} / ${subjectCoverage.total} subjects)`}
            />
            <KpiCard
              label="Unmapped / Incomplete"
              value={summary.unaligned + mapping.gaps.length}
              sub="CLOs / Relationships"
            />
          </div>

          {/* ---- slotted children between the tiles and the panels ---- */}
          {children}

          {/* ---- panels: two columns, one row ---- */}
          <div className="reports-panels">
            {/* 1 ---- */}
            <section className="panel reports-panel">
              <PanelHead title="Curriculum Mapping Summary" />
              <p className="reports-panel__sub">
                Term placement and mapping coverage of every course in the program.
              </p>
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
                            <td className="reports-num">
                              {course.year_level == null ? academicYear : courseYearLabel(course.year_level)}
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
              <PanelHead title="PO Coverage Chart" />
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
          </div>
        </>
      )}
    </div>
  )
}

export default MapBrief

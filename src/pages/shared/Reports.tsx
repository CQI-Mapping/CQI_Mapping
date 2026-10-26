// Overall Report: the program's curriculum at a glance.
//
// Shared by all three roles (admin, manager, faculty), like the record list it
// grew out of. A header with the PDF export, a row of KPI cards, then five
// panels: the curriculum mapping summary, PO coverage, the outcome coverage
// chart, the alignment mix and the mapping gaps across the last row.
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
  UserRole,
  CqiResult,
} from '../../services/database'
import { SCHOOL } from '../../utils/report'
import { saveBlob } from '../../utils/download'
import { buildReportsPdf, overallReportPdfFileName } from '../../utils/reportsPdf'
import type { ReportsPdfModel, MappingStatus } from '../../utils/reportsPdfModel'
import { anchorKeysOf } from '../../utils/cloPoMapping'
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
import PoCoverageBars from '../../components/PoCoverageBars'
import Icon from '../../components/icons'
import type { IconName } from '../../components/icons'

interface ReportsProps {
  profile: {
    email?: string | null
    role?: UserRole
    full_name?: string | null
    /** The account's program assignment (profiles.program_id), when its role
        carries one — the report opens there before anything else. */
    program_id?: string | null
  }
  onNavigate?: (page: string) => void
}

/** The role as a person is introduced on a signed document, not as a slug. */
function signatureRole(role: UserRole): string {
  return role === 'admin' ? 'Administrator' : role === 'manager' ? 'Manager' : 'Faculty'
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
 * trade in, "1" or "2", so it backs the summary cells' fallback and the PDF
 * header without translation.
 */
function currentSemester(today = new Date()): string {
  return today.getMonth() >= 5 && today.getMonth() <= 9 ? '1' : '2'
}

/** "2026 - 2027" from the starting year the column stores. */
function ayLabel(v: number | null | undefined): string | null {
  return v == null ? null : `${v} - ${v + 1}`
}

/** Stands in for program assignments the account may not carry yet, the way
 *  the sidebar's PROGRAM_LOGO does: until every account is bound to its
 *  program in the UI, BSIT is the program the system currently serves. */
const FALLBACK_PROGRAM_CODE = 'BSIT'

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
  /**
   * The CQI actions table, fetched beside everything else the report reads.
   * `missing` is not an error: a database provisioned before the table gets an
   * absent section in the PDF, not a failed export.
   */
  const [cqi, setCqi] = useState<CqiResult>({ rows: [], missing: false })
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
   * course without a term displays -- and rides into the PDF title block.
   */
  const [reportSemester] = useState(currentSemester())

  // Where "View All Courses" leads: the courses page each role is actually
  // allowed into -- the manager's course list, the admin's curriculum, which
  // is where its programs and their courses live. A faculty reader has no
  // courses page in their sidebar, so their footer stays inert text rather
  // than a link that cannot go anywhere.
  const courseListPage =
    profile.role === 'manager' ? 'course' : profile.role === 'admin' ? 'curriculum' : null

  // The signed-in account's program, read once per render as a scalar so the
  // load callback's identity only moves when the assignment itself does.
  const viewerProgramId = profile.program_id ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c, po, peo, clo, sg, cmo, cqiResult] = await Promise.all([
        fetchPrograms(),
        fetchCourses(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchCourseLearningOutcomesStandalone(),
        fetchStrategicGoals(),
        fetchChedMemoOrders(),
        // An absent table is a finding, not a load failure.
        fetchCqiActions().catch(() => ({ rows: [], missing: true })),
      ])
      setPrograms(p)
      setCourses(c)
      setPos(po)
      setPeos(peo)
      setClos(clo)
      setGoals(sg)
      setCmos(cmo)
      setCqi(cqiResult)
      // The report opens on the viewer's own program, not on whatever row
      // happens to sort first: an account with an assignment lands there,
      // and otherwise on the program the system currently serves (BSIT).
      // Admins are not program-bound — the selector stays free for them to
      // audit any program; this only picks where it opens.
      setProgramId((current) => {
        if (current) return current
        if (viewerProgramId && p.some((row) => row.id === viewerProgramId)) return viewerProgramId
        const served = p.find((row) => (row.code ?? '').toUpperCase() === FALLBACK_PROGRAM_CODE)
        return served?.id ?? p[0]?.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the report.')
    } finally {
      setLoading(false)
    }
  }, [viewerProgramId])

  useEffect(() => { load() }, [load])

  const program = programs.find((p) => p.id === programId) ?? null

  // ---- the dashboard, derived from the selected program ----
  const anchors = useMemo(() => buildAnchors({ cmos, peos, goals }), [cmos, peos, goals])
  // The outcome rows are institutional — one shared list of codes that every
  // program's report reads. The engine therefore runs whenever rows exist,
  // not only when the database holds exactly one program: the old
  // singleProgram gate zeroed the chart the moment a second program row was
  // recorded, leaving the PO Coverage panel stuck on "No program outcomes
  // recorded yet" against a table full of rows.
  const outcomes: PoOutcome[] = useMemo(
    () => (pos.length > 0 ? poOutcomes(pos, anchors) : []),
    [pos, anchors],
  )
  const summary = alignmentSummary(outcomes)

  const programCourseList = useMemo(
    () => (program ? coursesInProgram(courses, program.id) : []),
    [courses, program],
  )

  // Learning outcomes, scoped to the selected program. The standalone CLO
  // table is global; without this filter a second program's outcomes would
  // still count toward this report — including shared-course codes that
  // match by text alone.
  const programClos = useMemo(() => {
    if (!program) return []
    const codes = new Set(programCourseList.map((c) => normalizeCode(c.code)))
    return clos.filter((cl) => codes.has(normalizeCode(cl.course)))
  }, [program, programCourseList, clos])

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
  const mapping = useMemo(() => buildMappingReport(programClos, outcomes), [programClos, outcomes])
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
    () => courseOutcomes(programCourseList, programClos),
    [programCourseList, programClos],
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

  // The coverage the tile headlines, defined the way a coordinator reads it:
  // subjects, not learning outcomes. A subject counts when every learning
  // outcome it holds names a program outcome — the "Mapped" badge in the
  // summary table — so the headline number and the table's status column
  // verify each other. Subjects without any learning outcome are not
  // coverage; they stay in the denominator as the work still owed.
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

  // The coverage rows no learning outcome reaches. The panels that showed
  // both sides of the gap are gone from the brief, so this count now lives on
  // only in the report's findings and recommendations.
  const uncoveredOutcomes = useMemo(
    () => mapping.coverage.filter((row) => row.cloCount === 0),
    [mapping],
  )

  // ---- the export's source ----
  //
  // The PDF is the sheet the page shows: the same memoised KPI tiles, mapping
  // rows, coverage chart, matrix, named alignment documents and CQI actions, assembled inside download()
  // from what the panels display. There is no separate computation for the
  // document to drift into, and no record inventory built here -- buildReport's
  // five flattened lists were the CSV's shape, and the CSV is gone. The Excel
  // exporter (utils/reportsXlsx.ts) still owns that flattened shape, unchanged,
  // so re-hanging an inventory export costs one import rather than a rethink.

  /**
   * Opening the page is the event worth recording — it has no other action of
   * its own. Logged once per load, not per render, and deliberately not keyed
   * on any of the dashboard's memoised values (each is a fresh object every
   * render, which would log on every keystroke in the search box).
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
      // The document is the page, not a second opinion of the data: every value
      // below is the one the corresponding panel shows, computed above. jsPDF
      // is fetched here, on the click, so it never rides in the initial bundle.
      const now = new Date()
      const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('')
      const openCqiActions = cqi.missing
        ? summary.unaligned + coursesWithoutOutcomes.length + coursesWithoutInstructor.length
        : cqi.rows.filter((r) => r.status !== 'completed').length

      // Coverage's weakest outcomes, for the findings section.
      const weakest = [...charted.rows].sort((a, b) => a.percent - b.percent).slice(0, 2)

      // The matrix: mapped learning outcomes against the outcomes they reach.
      const matrixKeys = anchorKeysOf(mapping)
      const matrixRows = mapping.links
        .map((link, i) => ({
          label: `${courseCodeOf(link.clo.course)} · ${link.clo.code || `CLO ${i + 1}`}`,
          hits: link.poKeys.map((key) => matrixKeys.indexOf(key)).filter((ix) => ix >= 0),
        }))
        .filter((row) => row.hits.length > 0)

      // The named alignment documents: every PEO, strategic goal and CHED
      // memorandum with the program outcomes that cite it. The page outcome's
      // own code is what the sheet prints, normalised like every other PO
      // label.
      const familyField = { cmo: 'cmo', peo: 'peo', sg: 'sg' } as const
      const familyLabel = { cmo: 'CHED', peo: 'PEO', sg: 'Strategic Goal' } as const
      // The records carry their own kind word ('PEO 1', 'Goal 1'), so the
      // family name collapses onto it without repeating it: 'PEO 1',
      // 'Strategic Goal 1' and 'CHED CMO 25 s. 2015' — never the doubled
      // 'PEO PEO 1' / 'Strategic Goal Goal 1' the sheet used to print.
      const anchorLabel = (family: 'cmo' | 'peo' | 'sg', code: string): string => {
        const word = familyLabel[family]
        const kind = word.split(' ').slice(-1)[0]
        const tail = code.startsWith(kind) ? code.slice(kind.length).trimStart() : code
        return tail ? `${word} ${tail}` : word
      }
      const documentRows = anchors.map((anchor) => ({
        label: anchorLabel(anchor.family, anchor.code),
        detail: anchor.title ?? '',
        codes: outcomes
          .filter((o) => o[familyField[anchor.family]].includes(anchor.code))
          .map((o) => poLabel(o.code)),
      }))

      const model: ReportsPdfModel = {
        meta: {
          institute: SCHOOL.institute,
          department: `${program!.code} Department`,
          tagline: ['Quality Education.', 'Continuous Improvement.', 'Better Future.'],
          academicYear,
          // The record's own name can already end in its code ("...Technology
          // (BSIT)"), so only add the parenthesised code when it is not there
          // -- otherwise the field printed '(BSIT) (BSIT)'.
          program: program!.name.endsWith(`(${program!.code})`)
            ? program!.name
            : `${program!.name} (${program!.code})`,
          semester: reportSemester,
          generated,
          reportId: `CQI-OVR-${stamp}`,
          source: 'CQI Monitoring System',
        },
        kpis: [
          { label: 'Total Programs', value: String(programs.length), sub: program!.code },
          {
            label: 'Total Courses',
            value: String(programCourseList.length),
            sub: yearsOffered ? `Across ${yearsOffered} year${yearsOffered === 1 ? '' : 's'}` : 'Across all academic years',
          },
          {
            label: 'Total CLOs',
            value: String(programClos.length),
            sub: program ? `${program.code} courses` : 'From all courses',
          },
          { label: 'Total POs', value: String(summary.outcomes), sub: 'Program Outcomes' },
          { label: 'Total PEOs', value: String(peos.length), sub: 'Educational Objectives' },
          {
            label: 'Mapping Coverage',
            value: subjectCoverage.total === 0 ? '—' : `${subjectCoverage.percent}%`,
            sub: `(${subjectCoverage.fully} / ${subjectCoverage.total} subjects)`,
            tone: 'good',
          },
          {
            label: 'Unmapped / Incomplete',
            value: String(summary.unaligned + mapping.gaps.length),
            sub: 'CLOs / Relationships',
            tone: 'warn',
          },
          { label: 'CQI Actions', value: String(openCqiActions), sub: 'Open Recommendations', tone: 'good' },
        ],
        mapping: {
          rows: courseOutcomeRows.map(({ course, outcomeCount }) => {
            const roll = mappedByCourse.get(course.id) ?? { mapped: 0, total: 0 }
            return {
              code: course.code,
              title: course.title || '—',
              year: ayLabel(course.year_level) ?? academicYear,
              semester: String(course.semester ?? reportSemester),
              clos: outcomeCount,
              status: statusBadge(roll).label,
            }
          }),
        },
        poCoverage: {
          rows: charted.rows.map((r) => ({ label: poLabel(r.outcome.code), percent: r.percent, count: r.cloCount })),
          uncovered: charted.uncovered,
          hidden: charted.hidden,
          totalClos: mapping.totalClos,
        },
        matrix: {
          columns: matrixKeys.map((key) => {
            const row = mapping.coverage.find((r) => r.outcome.key === key)
            return { key, label: poLabel(row?.outcome.code ?? key) }
          }),
          rows: matrixRows,
          unmappedCount: mapping.gaps.length,
        },
        documents: { rows: documentRows },
        cqi: {
          missing: cqi.missing,
          rows: cqi.rows.map((action) => ({
            code: action.code,
            recommendation: action.recommendation,
            responsible: action.responsible || '—',
            status: action.status === 'in_progress' ? 'In Progress' : action.status === 'completed' ? 'Completed' : 'Pending',
            target: action.target_date ? new Date(action.target_date).toLocaleDateString() : null,
          })),
        },
        findings: [
          `Mapping coverage is ${subjectCoverage.percent}% — ${subjectCoverage.fully} of ${subjectCoverage.total} subject(s) have every learning outcome mapped to a program outcome.`,
          weakest.length > 0
            ? `Lowest coverage: ${weakest.map((r) => `${poLabel(r.outcome.code)} at ${r.percent}%`).join(' and ')}.`
            : '',
          mapping.gaps.length > 0 ? `${mapping.gaps.length} learning outcome(s) name no program outcome.` : '',
          uncoveredOutcomes.length > 0 ? `${uncoveredOutcomes.length} program outcome(s) have no learning-outcome coverage.` : '',
          coursesWithoutOutcomes.length > 0 ? `${coursesWithoutOutcomes.length} course(s) have no learning outcomes recorded.` : '',
          coursesWithoutInstructor.length > 0 ? `${coursesWithoutInstructor.length} course(s) have no instructor assigned.` : '',
          `${openCqiActions} CQI action(s) remain open.`,
        ].filter(Boolean) as string[],
        recommendations: [
          mapping.gaps.length > 0 ? `Map the ${mapping.gaps.length} learning outcome(s) that currently name no program outcome.` : '',
          uncoveredOutcomes.length > 0 ? `Settle coverage for the ${uncoveredOutcomes.length} program outcome(s) no learning outcome reaches.` : '',
          coursesWithoutOutcomes.length > 0 ? `Record learning outcomes for the ${coursesWithoutOutcomes.length} course(s) that have none.` : '',
          coursesWithoutInstructor.length > 0 ? `Assign instructors to the ${coursesWithoutInstructor.length} course(s) missing one.` : '',
          'Monitor and update CQI action items regularly.',
        ].filter(Boolean) as string[],
        signatures: {
          preparedName: profile.full_name ?? profile.email ?? '',
          preparedRole: signatureRole(profile.role ?? 'user'),
          date: generated,
        },
      }

      const blob = await buildReportsPdf(model)
      saveBlob(blob, overallReportPdfFileName(now))
      setNotice('PDF file downloaded.')
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not create the PDF: ${e.message}`
          : 'Could not create the PDF.',
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
              className="btn btn--sm reports-banner__pdf"
              onClick={download}
              disabled={downloading || loading}
              title="Save every section as one PDF document"
            >
              <Icon name="download" />
              {downloading ? 'Preparing…' : 'Export PDF'}
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
              value={programClos.length}
              sub={program ? `${program.code} courses` : 'From all courses'}
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
              value={subjectCoverage.total === 0 ? '—' : `${subjectCoverage.percent}%`}
              sub={`(${subjectCoverage.fully} / ${subjectCoverage.total} subjects)`}
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

          {/* ---- panels: two columns, one row ----
              The arrangement of the report brief: the mapping summary beside
              the PO coverage chart. The coverage bars, the alignment donut and
              the mapping gaps panels once filled three more cells here; the
              brief now stops after the coverage chart. */}
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

/**
 * A course's mapping status, from how many of its learning outcomes reach a
 * program outcome.
 *
 * "No CLOs" is kept distinct from "Unmapped": a course with no outcomes has
 * nothing to map, which is a different fact from having outcomes and leaving
 * them unmapped, and the report says which it is.
 */
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
 * A panel's title line. The icon chip that used to sit here is gone: the
 * headings now read as bare titles.
 *
 * The title is the h3 rather than the rule below it: the panel is a section of
 * the report, and the heading is what a screen reader and the print outline
 * both navigate by.
 */
function PanelHead({ title }: { title: string }) {
  return (
    <div className="reports-panel__head">
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

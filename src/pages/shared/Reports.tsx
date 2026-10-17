// Overall Report: the program's curriculum at a glance.
//
// Shared by all three roles (admin, manager, faculty), like the record list it
// grew out of. The layout follows the report brief: a header with the export
// actions, a row of KPI cards, then panels -- course mapping summary, PO
// coverage chart, the CLO-to-PO alignment matrix, the record mix and the
// mapping gaps. The searchable record inventory stays below as the appendix the
// Excel export is built from.
//
// Everything above the appendix reads the matrix-side tables:
// course_learning_outcomes (a CLO row per course, by foreign key),
// program_outcomes (a PO row per program) and clo_po_matrix (the mappings).
// Those are the only sources a coverage number can honestly come from -- the
// admin standalone lists key courses by free text, which is fine for a name
// list and useless for "is this outcome mapped".
//
// The page is scoped to one program at a time, because the alignment matrix is
// meaningless across programs: PO codes repeat per program by design
// (UNIQUE(program_id, code)), so PO1 of one program and PO1 of another are
// different outcomes that only the program selector can tell apart.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  addActivityLog,
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomesStandalone,
  fetchProgramEducationalObjectives,
  fetchCourseLearningOutcomesStandalone,
  fetchProgramOutcomes,
  fetchCourseLearningOutcomes,
  fetchCloPoMatrix,
} from '../../services/database'
import type {
  Program,
  Course,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  CourseLearningOutcomeStandalone,
  ProgramOutcome,
  CourseLearningOutcome,
  CloPoMappingEntry,
} from '../../services/database'
import { buildReport, buildRecordMix, isArchived, columns, rowCells, COURSE_COLUMN } from '../../utils/reports'
import type { Report, ReportSection } from '../../utils/reports'
import { SCHOOL } from '../../utils/report'
import {
  alignmentMatrix,
  courseCoverage,
  coverageSummary,
  mappingGaps,
  poCoverage,
  programCourses,
  programClos,
  programMappings,
  LEVEL_LEGEND,
} from '../../utils/coverage'
import RecordMixDonut from '../../components/RecordMixDonut'
import PoCoverageChart from '../../components/PoCoverageChart'
import CloPoMatrix from '../../components/CloPoMatrix'
import Icon from '../../components/icons'

interface ReportsProps {
  profile: { email?: string | null }
}

/** Badge tone per course mapping status. */
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  mapped: { label: 'Mapped', className: 'status-badge status-badge--mapped' },
  partial: { label: 'Partially Mapped', className: 'status-badge status-badge--partial' },
  unmapped: { label: 'Unmapped', className: 'status-badge status-badge--unmapped' },
  none: { label: 'No CLOs', className: 'status-badge status-badge--archived' },
}

function Reports({ profile }: ReportsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)

  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])

  // The matrix-side tables, separate from the inventory lists above: these feed
  // the dashboard panels.
  const [poRows, setPoRows] = useState<ProgramOutcome[]>([])
  const [cloRows, setCloRows] = useState<CourseLearningOutcome[]>([])
  const [matrix, setMatrix] = useState<CloPoMappingEntry[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c, po, peo, clo, poRows, cloRows, mx] = await Promise.all([
        fetchPrograms(),
        fetchCourses(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchCourseLearningOutcomesStandalone(),
        fetchProgramOutcomes(),
        fetchCourseLearningOutcomes(),
        fetchCloPoMatrix(),
      ])
      setPrograms(p)
      setCourses(c)
      setPos(po)
      setPeos(peo)
      setClos(clo)
      setPoRows(poRows)
      setCloRows(cloRows)
      setMatrix(mx)
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

  // ---- everything derives from the selected program ----
  const programCourseList = program ? programCourses(courses, program.id) : []
  const programCloList = program ? programClos(courses, cloRows, program.id) : []
  const programMatrixRows = program ? programMappings(cloRows, matrix, program.id) : []
  const coverage = coverageSummary(programCloList, programMatrixRows)
  const courseRows = courseCoverage(programCourseList, programCloList, programMatrixRows)
  const gaps = mappingGaps(programCloList, programMatrixRows, programCourseList)
  const coverageChart = program ? poCoverage(poRows.filter((po) => po.program_id === program.id), programCloList, programMatrixRows) : []
  const matrixRows = program
    ? alignmentMatrix(programCloList, poRows.filter((po) => po.program_id === program.id), programMatrixRows, programCourseList)
    : []

  // ---- appendix: the record inventory, unchanged in behaviour ----
  const report = buildReport(
    { programs, courses, pos, peos, clos },
    { includeArchived, query },
  )

  // The record mix stays global: the standalone PO list cannot be attributed
  // to a program, and a per-program donut that quietly includes or excludes
  // whole record families would misstate the mix. The KPI cards above are the
  // per-program story; this one is the whole-system story.
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

  const filtersActive = query.trim() !== '' || includeArchived

  // Captured once per mount. Computing it inline would re-stamp on every
  // render -- typing in the search box would scroll the timestamp forward.
  const generated = useMemo(() => new Date().toLocaleString(), [])

  return (
    <div className="reports">
      <div className="reports-header">
        <div className="page-heading">
          <h2>Overall Report</h2>
          <p>
            Curriculum mapping, outcomes coverage and the record inventory —
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
          {/* ---- KPI cards ---- */}
          <div className="stat-grid stat-grid--2026 reports-kpis">
            <KpiCard label="Program" value={program.code} sub={program.name} icon="grid" />
            <KpiCard label="Total Courses" value={programCourseList.length} sub="Active and archived" icon="list" />
            <KpiCard label="Total CLOs" value={coverage.totalClos} sub="From all courses" icon="list" />
            <KpiCard
              label="Total POs"
              value={poRows.filter((po) => po.program_id === program.id).length}
              sub="Program Outcomes"
              icon="check"
            />
            <KpiCard label="Total PEOs" value={peos.length} sub="Program Educational Objectives" icon="eye" />
            <KpiCard
              label="Mapping Coverage"
              value={`${coverage.coveragePercent}%`}
              sub={`${coverage.mappedClos} / ${coverage.totalClos} CLOs mapped`}
              icon="check"
            />
            <KpiCard
              label="Unmapped CLOs"
              value={coverage.unmappedClos}
              sub="CLOs with no PO mapping"
              icon="x"
            />
          </div>

          {/* ---- panels ---- */}
          <div className="reports-panels">
            <section className="panel reports-panel">
              <h3>Curriculum Mapping Summary</h3>
              <p className="reports-panel__sub">
                How much of each course's learning outcomes reach a Program Outcome.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course Code</th>
                      <th>Course Title</th>
                      <th className="reports-num"># of CLOs</th>
                      <th>Mapping Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="reports-empty">No courses in this program yet.</td>
                      </tr>
                    ) : (
                      courseRows.map(({ course, cloCount, status }) => (
                        <tr key={course.id}>
                          <td>{course.code}</td>
                          <td>{course.title}</td>
                          <td className="reports-num">{cloCount}</td>
                          <td>
                            <span className={STATUS_BADGE[status].className}>
                              {STATUS_BADGE[status].label}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel reports-panel">
              <h3>PO Coverage Chart</h3>
              <p className="reports-panel__sub">
                Percentage of CLOs mapped to each Program Outcome.
              </p>
              {coverageChart.length === 0 ? (
                <p className="reports-empty">No Program Outcomes recorded for this program yet.</p>
              ) : (
                <PoCoverageChart data={coverageChart} />
              )}
            </section>

            <section className="panel reports-panel reports-panel--wide">
              <h3>CLO–PO Alignment Matrix</h3>
              <p className="reports-panel__sub">
                What depth each learning outcome reaches each Program Outcome at.
              </p>
              {matrixRows.length === 0 ? (
                <p className="reports-empty">
                  No learning outcomes recorded for this program yet.
                </p>
              ) : coverageChart.length === 0 ? (
                <p className="reports-empty">
                  No Program Outcomes recorded for this program yet — there is nothing to
                  align against.
                </p>
              ) : (
                <>
                  <CloPoMatrix
                    rows={matrixRows}
                    poCodes={coverageChart.map((c) => c.po.code)}
                  />
                  {coverage.totalClos > 0 && coverage.mappedClos === 0 && (
                    <p className="reports-panel__note">
                      No CLO–PO mappings recorded yet — every outcome below shows as unmapped
                      until the mapping pages fill the matrix in.
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="panel reports-panel">
              <h3>Record Mix</h3>
              <p className="reports-panel__sub">
                What the system is made of, across all programs.
              </p>
              <RecordMixDonut mix={mix} />
            </section>

            <section className="panel reports-panel">
              <h3>Mapping Gaps</h3>
              <p className="reports-panel__sub">
                Learning outcomes that reach no Program Outcome.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>CLO</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="reports-empty">
                          {coverage.totalClos === 0
                            ? 'No learning outcomes to check yet.'
                            : 'Every learning outcome maps to at least one outcome.'}
                        </td>
                      </tr>
                    ) : (
                      gaps.map((gap) => (
                        <tr key={gap.clo.id}>
                          <td>{gap.courseCode}</td>
                          <td>{gap.clo.code}{gap.clo.description ? ` — ${gap.clo.description}` : ''}</td>
                          <td>
                            <span className="status-badge status-badge--unmapped">Unmapped</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* ---- appendix: the record inventory ---- */}
          <h3 className="reports-appendix-title">Record Inventory</h3>
          <div className="panel reports-controls">
            <label className="field reports-search">
              <span>Search</span>
              <input
                className="input"
                type="search"
                placeholder="Name or code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="reports-toggle">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              <span>Include archived</span>
            </label>
          </div>

          <p className="reports-shown">
            Showing <strong>{report.shownCount}</strong> record
            {report.shownCount === 1 ? '' : 's'}
            {filtersActive ? ' matching the current filters' : ''}.
            {report.shownCount === 0 && ' Try clearing the search box.'}
          </p>

          {report.sections.map((section) => (
            <SectionTable key={section.key} section={section} />
          ))}

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

/** One KPI card, on the dashboard's own stat-card chrome. */
function KpiCard({ label, value, sub, icon }: { label: string; value: string | number; sub: string; icon: 'grid' | 'list' | 'check' | 'eye' | 'x' }) {
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

/**
 * One section's table.
 *
 * Split out because the header and the body both have to agree on how many
 * columns there are, and the Course column is conditional. Both read the same
 * two helpers off the same report -- columns() for the headings, rowCells() for
 * the values -- so there is no second place where the column count is decided
 * and nothing to fall out of step.
 */
function SectionTable({ section }: { section: ReportSection }) {
  const headings = columns(section.hasCourse)
  // The leading "No." is the caller's to render, so every span and width here
  // is one more than the headings.
  const span = headings.length + 1

  return (
    <div className="panel table-wrap reports-section">
      <h3>{section.title}</h3>
      <table className="table">
        <thead>
          <tr>
            <th className="reports-num">#</th>
            {headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.length === 0 ? (
            <tr>
              <td colSpan={span} className="reports-empty">
                No {section.title.toLowerCase()} to show.
              </td>
            </tr>
          ) : (
            section.rows.map((row, i) => (
              <tr
                key={`${section.key}-${row.code}-${i}`}
                className={isArchived(row) ? 'reports-row--archived' : undefined}
              >
                <td className="reports-num">{i + 1}</td>
                {headings.map((h, c) => (
                  <td key={h} className={h === COURSE_COLUMN ? 'reports-course' : undefined}>
                    {rowCells(row, section.hasCourse)[c]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default Reports

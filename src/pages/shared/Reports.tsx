// Reports: one consolidated list of every named record in the system.
//
// Shared by all three roles (admin, manager, faculty). It is a read-only
// report -- the pages that own these records are still where they get created,
// edited and archived. Every list it reads is covered by an "authenticated
// users can read" RLS policy, which is what lets faculty see it without any
// extra policy; user full names are deliberately not included, because
// profiles is readable only by the account itself and by admin/manager.
//
// A code-and-name list, laid out like the rest of the app rather than like the
// Curriculum Report: no letterhead, no title block. The detail behind each name
// (program, units, CMO alignment, description) lives on the Curriculum Report,
// which already presents it properly.
//
// The Excel export is handed the *filtered* report rather than the raw
// lists, so the file always matches what is on screen.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomesStandalone,
  fetchProgramEducationalObjectives,
  fetchCourseLearningOutcomesStandalone,
} from '../../services/database'
import type {
  Program,
  Course,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  CourseLearningOutcomeStandalone,
} from '../../services/database'
import { buildReport, isArchived } from '../../utils/reports'
import Icon from '../../components/icons'

interface ReportsProps {
  profile: { email?: string | null }
}

function Reports({ profile }: ReportsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)

  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c, po, peo, clo] = await Promise.all([
        fetchPrograms(),
        fetchCourses(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchCourseLearningOutcomesStandalone(),
      ])
      setPrograms(p)
      setCourses(c)
      setPos(po)
      setPeos(peo)
      setClos(clo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the report.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Rebuilt on every keystroke, but the input lists are small (hundreds of
  // rows at most) and the flatten is a pure sort-and-map, so there is nothing
  // to memoise against here that would be worth the extra state.
  const report = buildReport(
    { programs, courses, pos, peos, clos },
    { includeArchived, query },
  )

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

  return (
    <div className="reports">
      <div className="page-heading">
        <h2>Reports</h2>
        <p>
          Every named record in the system — programs, objectives, outcomes and
          courses. Read-only; edit records on their own pages.
        </p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {notice && <p className="msg msg--success" role="status">{notice}</p>}

      <div className="panel breports-controls">
        <label className="field breports-search">
          <span>Search</span>
          <input
            className="input"
            type="search"
            placeholder="Name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="breports-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>Include archived</span>
        </label>
        <button
          className="btn btn--primary btn--sm breports-export"
          onClick={download}
          disabled={downloading || loading}
          title="Save every section to one Excel workbook"
        >
          <Icon name="download" />
          {downloading ? 'Preparing…' : 'Download Excel'}
        </button>
      </div>

      {loading ? (
        <p>Loading report…</p>
      ) : (
        <>
          <div className="panel table-wrap breports-summary">
            <h3>Totals</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Record Type</th>
                  <th>Active</th>
                  <th>Archived</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.summary.map((line) => (
                  <tr key={line.key}>
                    <td>{line.title}</td>
                    <td>{line.active}</td>
                    <td>{line.archived}</td>
                    <td>{line.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals count the whole dataset; the tables below narrow as the
              search box is typed in. */}
          <p className="breports-shown">
            Showing <strong>{report.shownCount}</strong> record
            {report.shownCount === 1 ? '' : 's'}
            {filtersActive ? ' matching the current filters' : ''}.
            {report.shownCount === 0 && ' Try clearing the search box.'}
          </p>

          {report.sections.map((section) => (
            <div className="panel table-wrap breports-section" key={section.key}>
              <h3>{section.title}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th className="breports-num">#</th>
                    <th>Code</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="breports-empty">
                        No {section.title.toLowerCase()} to show.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row, i) => (
                      // Archived rows are muted rather than badged: with only
                      // three columns there is no room for a status column, and
                      // the point of the toggle is that they are visibly the
                      // "extra" ones.
                      <tr key={`${section.key}-${row.code}-${i}`} className={isArchived(row) ? 'breports-row--archived' : undefined}>
                        <td className="breports-num">{i + 1}</td>
                        <td>{row.code}</td>
                        <td>{row.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default Reports
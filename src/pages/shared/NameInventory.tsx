// Name Inventory: one consolidated list of every named record in the system.
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
// The Excel export is handed the *filtered* inventory rather than the raw
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
import { buildInventory, isArchived } from '../../utils/nameInventory'
import Icon from '../../components/icons'

interface NameInventoryProps {
  profile: { email?: string | null }
}

function NameInventory({ profile }: NameInventoryProps) {
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
      setError(e instanceof Error ? e.message : 'Failed to load the inventory.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Rebuilt on every keystroke, but the input lists are small (hundreds of
  // rows at most) and the flatten is a pure sort-and-map, so there is nothing
  // to memoise against here that would be worth the extra state.
  const inventory = buildInventory(
    { programs, courses, pos, peos, clos },
    { includeArchived, query },
  )

  const download = async () => {
    setDownloading(true)
    setError(null)
    setNotice(null)
    try {
      // Lazy: exceljs is ~1MB and only needed once someone exports.
      const { downloadInventoryExcel } = await import('../../utils/nameInventoryXlsx')
      await downloadInventoryExcel(inventory, profile.email ?? '')
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
    <div className="name-inventory">
      <div className="page-heading">
        <h2>Name Inventory</h2>
        <p>
          Every named record in the system — programs, objectives, outcomes and
          courses. Read-only; edit records on their own pages.
        </p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {notice && <p className="msg msg--success" role="status">{notice}</p>}

      <div className="panel ni-controls">
        <label className="field ni-search">
          <span>Search</span>
          <input
            className="input"
            type="search"
            placeholder="Name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="ni-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>Include archived</span>
        </label>
        <button
          className="btn btn--primary btn--sm ni-export"
          onClick={download}
          disabled={downloading || loading}
          title="Save every section to one Excel workbook"
        >
          <Icon name="download" />
          {downloading ? 'Preparing…' : 'Download Excel'}
        </button>
      </div>

      {loading ? (
        <p>Loading inventory…</p>
      ) : (
        <>
          <div className="panel table-wrap ni-summary">
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
                {inventory.summary.map((line) => (
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
          <p className="ni-shown">
            Showing <strong>{inventory.shownCount}</strong> record
            {inventory.shownCount === 1 ? '' : 's'}
            {filtersActive ? ' matching the current filters' : ''}.
            {inventory.shownCount === 0 && ' Try clearing the search box.'}
          </p>

          {inventory.sections.map((section) => (
            <div className="panel table-wrap ni-section" key={section.key}>
              <h3>{section.title}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th className="ni-num">#</th>
                    <th>Code</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="ni-empty">
                        No {section.title.toLowerCase()} to show.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row, i) => (
                      // Archived rows are muted rather than badged: with only
                      // three columns there is no room for a status column, and
                      // the point of the toggle is that they are visibly the
                      // "extra" ones.
                      <tr key={`${section.key}-${row.code}-${i}`} className={isArchived(row) ? 'ni-row--archived' : undefined}>
                        <td className="ni-num">{i + 1}</td>
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

export default NameInventory
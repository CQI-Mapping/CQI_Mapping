// Name Inventory: one consolidated list of every named record in the system.
//
// Shared by all three roles (admin, manager, faculty). It is a read-only
// report -- the pages that own these records are still where they get created,
// edited and archived. Every list it reads is covered by an "authenticated
// users can read" RLS policy, which is what lets faculty see it without any
// extra policy; user full names are deliberately not included, because
// profiles is readable only by the account itself and by admin/manager.
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
  fetchChedMemoOrders,
} from '../../services/database'
import type {
  Program,
  Course,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  CourseLearningOutcomeStandalone,
  ChedMemoOrder,
} from '../../services/database'
import { buildInventory, rowValues } from '../../utils/nameInventory'
import type { InventoryRow, SectionKey } from '../../utils/nameInventory'
import { LETTERHEAD_URL } from '../../utils/letterhead'
import { SCHOOL } from '../../utils/report'
import Icon from '../../components/icons'

interface NameInventoryProps {
  profile: { email?: string | null }
}

/**
 * One row's cells, in the order its section declares.
 *
 * Status is the last column in every section, so the final cell gets the
 * status badge; the code (first) is emphasised. Anything in between is plain
 * text. Reading the order from rowValues() is what stops a short section from
 * shifting its body out of line with its header.
 */
function RowCells({ sectionKey, row }: { sectionKey: SectionKey; row: InventoryRow }) {
  const values = rowValues(sectionKey, row)
  return (
    <>
      {values.map((value, c) => (
        <td key={c}>
          {c === 0 ? (
            <strong>{value}</strong>
          ) : c === values.length - 1 ? (
            <span
              className={`sd-status-badge ${
                value === 'archived'
                  ? 'sd-status-badge--archived'
                  : 'sd-status-badge--active'
              }`}
            >
              {value || 'active'}
            </span>
          ) : (
            value
          )}
        </td>
      ))}
    </>
  )
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
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c, po, peo, clo, cmo] = await Promise.all([
        fetchPrograms(),
        fetchCourses(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchCourseLearningOutcomesStandalone(),
        fetchChedMemoOrders(),
      ])
      setPrograms(p)
      setCourses(c)
      setPos(po)
      setPeos(peo)
      setClos(clo)
      setCmos(cmo)
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
    { programs, courses, pos, peos, clos, cmos },
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
    <div className="syllabus-doc">
      <div className="syllabus-doc__toolbar no-print">
        <span className="syllabus-doc__meta">
          Generated: {new Date().toLocaleDateString()}
          {profile.email ? ` · ${profile.email}` : ''}
        </span>
        <div className="sd-toolbar-controls">
          <label className="sd-toolbar__subject">
            <span>Search</span>
            <input
              className="input input--sm"
              type="search"
              placeholder="Name, code or course…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter the inventory by name, code or course"
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
          <button className="btn btn--ghost btn--sm" onClick={() => window.print()}>
            Print
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={download}
            disabled={downloading || loading}
            title="Save every section to one Excel workbook"
          >
            <Icon name="download" />
            {downloading ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </div>

      <div className="page-heading">
        <h2>Name Inventory</h2>
        <p>
          Every named record in the system — programs, objectives, outcomes and
          courses — in one list.
        </p>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {notice && <p className="msg msg--success" role="status">{notice}</p>}

      <div className="syllabus-doc__page">
        <header className="sd-letterhead">
          <img className="sd-letterhead__img" src={LETTERHEAD_URL} alt={SCHOOL.school} />
          <div className="sd-letterhead__text">
            <div>{SCHOOL.republic}</div>
            <div className="sd-letterhead__school">{SCHOOL.school}</div>
            <div>{SCHOOL.address}</div>
            <div className="sd-letterhead__motto">{SCHOOL.motto}</div>
          </div>
        </header>

        <div className="sd-titleblock">
          <div className="sd-titleblock__title">NAME INVENTORY</div>
          <div>{SCHOOL.institute}</div>
          <div>{SCHOOL.program}</div>
          <div className="sd-titleblock__course">{SCHOOL.term}</div>
        </div>

        {loading ? (
          <p>Loading inventory…</p>
        ) : (
          <>
            {/* Totals count the whole dataset, not the filtered view — the
                tables below narrow as the search box is typed in. */}
            <table className="table ni-summary">
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
                    <td><strong>{line.title}</strong></td>
                    <td>{line.active}</td>
                    <td>{line.archived}</td>
                    <td>{line.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="ni-shown">
              Showing <strong>{inventory.shownCount}</strong> record
              {inventory.shownCount === 1 ? '' : 's'}
              {filtersActive ? ' matching the current filters' : ''}.
              {inventory.shownCount === 0 && ' Try clearing the search box.'}
            </p>

            {inventory.sections.map((section) => (
              <section key={section.key} className="ni-section">
                <h3 className="ni-section__title">{section.title}</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        {section.columns.map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.length === 0 ? (
                        <tr>
                          <td colSpan={section.columns.length} className="ni-empty">
                            No {section.title.toLowerCase()} to show.
                          </td>
                        </tr>
                      ) : (
                        section.rows.map((row, i) => (
                          <tr key={`${section.key}-${row.code}-${i}`}>
                            <td>{i + 1}</td>
                            <RowCells sectionKey={section.key} row={row} />
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default NameInventory
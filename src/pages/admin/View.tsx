// Admin Curriculum Map: printable report that mirrors the VCQI course
// syllabus document (IT21 - Object Oriented Programming) page by page:
// letterhead, title block, Vision/Mission/Goals/PEO table, Program Outcomes
// list, Curriculum Mapping matrix (PO x PEO x Strategic Goal per section),
// CLO-to-PO table, then course details.
//
// All report data is loaded from the database: strategic goals, PEOs and
// program outcomes (standalone tables), course learning outcomes, and the
// courses list. Institutional letterhead and vision/mission text are static
// (they are school branding, not input data). Records support inline editing
// and archiving directly on this page via the "Edit" toggle.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchStrategicGoals,
  fetchProgramEducationalObjectives,
  fetchProgramOutcomesStandalone,
  fetchCourseLearningOutcomesStandalone,
  fetchCourses,
  fetchChedMemoOrders,
  updateStrategicGoal,
  updateProgramEducationalObjective,
  updateProgramOutcomeStandalone,
} from '../../services/database'
import type {
  StrategicGoal,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
  CourseLearningOutcomeStandalone,
  Course,
  ChedMemoOrder,
} from '../../services/database'

interface ViewProps {
  userEmail: string
}

type EditableKind = 'goal' | 'peo' | 'po'

interface EditState {
  kind: EditableKind
  id: string
  code: string
  title: string
  description: string
}

// Institutional letterhead / branding (not input data).
const SCHOOL = {
  republic: 'Republic of the Philippines',
  school: 'NORTHERN BUKIDNON STATE COLLEGE',
  address: 'Manolo Fortich, 8703 Bukidnon',
  motto: 'Creando futura, Transformationis vitae, Ductae a Deo',
  title: 'COURSE SYLLABUS',
  institute: 'INSTITUTE FOR COMPUTER STUDIES',
  program: 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY',
  term: 'Summer, SY: 2024 - 2025',
}

const DOC_VISION =
  'Northern Bukidnon State College will be a college of choice, nationally recognized for having innovative and sustainable academic programs, research, extensions and services that cultivate educational, personal, and professional growth to meet the needs of our students, our society, and the global community.'

const DOC_MISSION =
  'Northern Bukidnon State College is an accessible community-based institution that provides educational opportunities to develop students into socially responsible, competent, and productive professionals.'

// Fixed CMO categories (stored as cmo_text when cmo_id is null).
const FIXED_CMO_CATEGORIES = [
  { id: 'fixed-common', title: 'Common to All Programs in All Types of Schools' },
  { id: 'fixed-bscs', title: 'Bachelor of Science in Computer Science Program Outcomes' },
  { id: 'fixed-college', title: 'College Defined Program Outcome' },
]

// Numbering helpers: digits parsed from the PO code (PO-1 -> 1).
// Codes without digits (or blank codes) have no number — they sort last
// and display the raw code instead of "NaN".
const poDigits = (code: string) => {
  const m = (code || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}
const poNumber = (code: string) => poDigits(code) ?? 9999
const poLabel = (code: string) => {
  const d = poDigits(code)
  return d === null ? (code || '—') : String(d)
}

const isActive = (item: { status?: string }) => !item.status || item.status === 'active'

type EditableItem = StrategicGoal | ProgramEducationalObjective

interface PoGroup {
  heading: string
  items: ProgramOutcomeStandalone[]
}

function View({ userEmail }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [goals, setGoals] = useState<StrategicGoal[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])

  const [editMode, setEditMode] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, p, po, clo, c, cmo] = await Promise.all([
        fetchStrategicGoals(),
        fetchProgramEducationalObjectives(),
        fetchProgramOutcomesStandalone(),
        fetchCourseLearningOutcomesStandalone(),
        fetchCourses(),
        fetchChedMemoOrders(),
      ])
      setGoals(g)
      setPeos(p)
      setPos(po.sort((a, b) => poNumber(a.code) - poNumber(b.code) || a.code.localeCompare(b.code)))
      setClos(clo)
      setCourses(c)
      setCmos(cmo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load curriculum map data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const itemOf = (kind: EditableKind, id: string) => {
    const list =
      kind === 'goal' ? goals :
      kind === 'peo' ? peos :
      pos
    return list.find((i) => i.id === id)
  }

  const startEdit = (kind: EditableKind, id: string) => {
    const item = itemOf(kind, id)
    if (!item) return
    setEdit({ kind, id, code: item.code, title: item.title, description: item.description || '' })
    setNotice(null)
  }

  const saveEdit = async () => {
    if (!edit) return
    setBusy(true)
    setError(null)
    try {
      const updates =
        edit.kind === 'peo'
          ? { title: edit.title.trim(), description: edit.description.trim() || null }
          : { title: edit.title.trim() }
      if (edit.kind === 'goal') await updateStrategicGoal(edit.id, updates)
      else if (edit.kind === 'peo') await updateProgramEducationalObjective(edit.id, updates)
      else await updateProgramOutcomeStandalone(edit.id, updates)
      setEdit(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save changes.')
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = async (kind: EditableKind, id: string) => {
    const item = itemOf(kind, id)
    if (!item) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const next = isActive(item) ? 'archived' : 'active'
    try {
      if (kind === 'goal') await updateStrategicGoal(id, { status: next })
      else if (kind === 'peo') await updateProgramEducationalObjective(id, { status: next })
      else await updateProgramOutcomeStandalone(id, { status: next })
      await load()
    } catch {
      setError('Could not change status. If this keeps happening, the status column is missing — run the archive migration SQL in the Supabase SQL Editor (see supabase-schema.sql).')
    } finally {
      setBusy(false)
    }
  }

  // Row visibility: the report always shows active records only.
  const shown = <T extends { status?: string }>(list: T[]) =>
    list.filter((i) => isActive(i))

  const visibleGoals = shown(goals)
  const visiblePeos = shown(peos)
  const visiblePos = shown(pos)

  // Separate admin vs manager outcomes.
  const adminPos = visiblePos.filter((p) => (p as { source?: string }).source !== 'manager')
  const managerPos = visiblePos.filter((p) => (p as { source?: string }).source === 'manager')

  // Group active program outcomes by CMO category (cmo_id or cmo_text).
  const cmoLabel = (po: ProgramOutcomeStandalone) => {
    const key = po.cmo_id || (po as { cmo_text?: string }).cmo_text
    if (!key) return 'UNCATEGORIZED'
    const fixed = FIXED_CMO_CATEGORIES.find((c) => c.id === key)
    if (fixed) return fixed.title.toUpperCase()
    const cmo = cmos.find((c) => c.id === key)
    return cmo ? `${cmo.title} (${cmo.code})`.toUpperCase() : 'UNCATEGORIZED'
  }

  const buildGroups = (list: ProgramOutcomeStandalone[]): PoGroup[] => {
    const groups: PoGroup[] = []
    for (const po of list) {
      const heading = cmoLabel(po)
      const last = groups[groups.length - 1]
      if (last && last.heading === heading) last.items.push(po)
      else groups.push({ heading, items: [po] })
    }
    return groups
  }

  const adminGroups = buildGroups(adminPos)
  const managerGroups = buildGroups(managerPos)

  const programText = (c: Course) =>
    typeof c.program_id === 'object' && c.program_id ? c.program_id.name : SCHOOL.program

  // Inline edit controls for one record (Save / Cancel or Edit / Archive).
  const rowActions = (kind: EditableKind, id: string) => {
    const item = itemOf(kind, id)
    if (!item) return null
    if (edit && edit.kind === kind && edit.id === id) {
      return (
        <span className="sd-actions">
          <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
        </span>
      )
    }
    return (
      <span className="sd-actions">
        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(kind, id)} disabled={busy || !!edit}>Edit</button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => toggleArchive(kind, id)}
          disabled={busy || !!edit}
          title={isActive(item) ? 'Hide from the report without deleting' : 'Show on the report again'}
        >
          {isActive(item) ? 'Archive' : 'Restore'}
        </button>
      </span>
    )
  }

  // One editable record inside the Vision/Goals/PEO table cells.
  const editableListRow = (kind: EditableKind, item: EditableItem, display: React.ReactNode) => {
    const editingThis = edit && edit.kind === kind && edit.id === item.id
    return (
      <div key={item.id} className={`sd-edit-row${isActive(item) ? '' : ' sd-archived'}`}>
        {editingThis ? (
          <div className="sd-edit-fields">
            <input
              className="input input--sm"
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              disabled={busy}
            />
            {kind === 'peo' && (
              <textarea
                className="input input--sm"
                rows={3}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                disabled={busy}
              />
            )}
          </div>
        ) : (
          <span className="sd-edit-row__text">{display}</span>
        )}
        {editMode && rowActions(kind, item.id)}
      </div>
    )
  }

  return (
    <div className="syllabus-doc">
      <div className="syllabus-doc__toolbar no-print">
        <span className="syllabus-doc__meta">
          Generated: {new Date().toLocaleDateString()} &middot; {userEmail}
        </span>
        <div className="sd-toolbar-controls">
          <button
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => { setEditMode(!editMode); setEdit(null) }}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {notice && <p className="msg msg--success">{notice}</p>}
      {editMode && !error && (
        <p className="msg">Edit mode: click Edit on a row to change it, or Archive to hide it from the report. Click Done when finished.</p>
      )}
      {loading ? (
        <p>Loading curriculum map...</p>
      ) : (
        <div className="syllabus-doc__page">
          {/* Letterhead */}
          <header className="sd-letterhead">
            <img className="sd-letterhead__img" src="/nbsc-letterhead.jpg" alt="Northern Bukidnon State College" />
            <div className="sd-letterhead__text">
              <div>{SCHOOL.republic}</div>
              <div className="sd-letterhead__school">{SCHOOL.school}</div>
              <div>{SCHOOL.address}</div>
              <div className="sd-letterhead__motto">{SCHOOL.motto}</div>
            </div>
          </header>

          {/* Title block */}
          <div className="sd-titleblock">
            <div className="sd-titleblock__title">{SCHOOL.title}</div>
            <div>{SCHOOL.institute}</div>
            <div>{courses[0] ? programText(courses[0]) : SCHOOL.program}</div>
            {courses.length > 0 ? (
              courses.map((c) => (
                <div className="sd-titleblock__course" key={c.id}>{c.code} - {c.title}</div>
              ))
            ) : (
              <div className="sd-titleblock__course">No courses yet</div>
            )}
            <div>{SCHOOL.term}</div>
          </div>

          {/* Vision | Mission | Strategic Goals | PEOs */}
          <table className="sd-table sd-table--vmgp">
            <thead>
              <tr>
                <th className="sd-col-head">VISION</th>
                <th className="sd-col-head">MISSION</th>
                <th className="sd-col-head">STRATEGIC GOALS</th>
                <th className="sd-col-head">PROGRAM EDUCATIONAL OBJECTIVES</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sd-cell--justify">{DOC_VISION}</td>
                <td className="sd-cell--justify">{DOC_MISSION}</td>
                <td>
                  {visibleGoals.map((g) =>
                    editableListRow(
                      'goal',
                      g,
                      <span className="sd-goal">{g.code.replace(/^SG-/i, 'Goal ')}: {g.description}</span>,
                    ),
                  )}
                  {visibleGoals.length === 0 && <span>No strategic goals.</span>}
                </td>
                <td>
                  {visiblePeos.map((p) =>
                    editableListRow(
                      'peo',
                      p,
                      <>
                        <span>{p.code.replace(/-/, ' ')}: {p.title}</span>
                        {p.description && <div className="sd-peo__desc">{p.description}</div>}
                      </>,
                    ),
                  )}
                  {visiblePeos.length === 0 && <span>No PEOs.</span>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Program Outcomes (ADMIN) — grouped by CMO category */}
          <table className="sd-table sd-table--po-single">
            <thead>
              <tr>
                <th className="sd-po-single-title">PROGRAM OUTCOMES</th>
              </tr>
            </thead>
            <tbody>
              {adminGroups.length === 0 && (
                <tr>
                  <td className="sd-po-single-section">No admin program outcomes yet.</td>
                </tr>
              )}
              {adminGroups.map((group, gi) => (
                <tr key={group.heading}>
                  <td className="sd-po-single-section">
                    <div className="sd-po-single-section__head">{group.heading}</div>
                    {gi === 0 && (
                      <div className="sd-po-single-section__sub">
                        The NBSC graduates have the ability to:
                      </div>
                    )}
                    {group.items.map((p, i, arr) => {
                      const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                      const isLast = i === arr.length - 1
                      const semicolon = isLast ? '.' : ';'
                      return (
                        <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                          {poLabel(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                          {editMode && (
                            <span className="sd-po-single-item__actions">
                              {rowActions('po', p.id)}
                            </span>
                          )}
                          {editingThis && (
                            <span className="sd-po-single-edit">
                              <input
                                className="input input--sm"
                                value={edit.title}
                                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                                disabled={busy}
                              />
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Program Outcomes (MANAGER) — separate section */}
          {managerGroups.length > 0 && (
            <table className="sd-table sd-table--po-single">
              <thead>
                <tr>
                  <th className="sd-po-single-title">PROGRAM OUTCOMES (MANAGER)</th>
                </tr>
              </thead>
              <tbody>
                {managerGroups.map((group) => (
                  <tr key={group.heading}>
                    <td className="sd-po-single-section">
                      <div className="sd-po-single-section__head">{group.heading}</div>
                      {group.items.map((p, i, arr) => {
                        const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                        const isLast = i === arr.length - 1
                        const semicolon = isLast ? '.' : ';'
                        return (
                          <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                            {poLabel(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                            {editMode && (
                              <span className="sd-po-single-item__actions">
                                {rowActions('po', p.id)}
                              </span>
                            )}
                            {editingThis && (
                              <span className="sd-po-single-edit">
                                <input
                                  className="input input--sm"
                                  value={edit.title}
                                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                                  disabled={busy}
                                />
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Curriculum Mapping — 3-column matrix per PO section, matching the
              syllabus document pages (Program Outcome | PEO | Strategic Goal).
              Driven by each PO's peo_text / sg_text alignments.
              Uses admin outcomes only (manager outcomes are separate). */}
          {adminGroups.length > 0 && (
            <div className="sd-mapping">
              <div className="sd-band sd-band--center">CURRICULUM MAPPING</div>
              {adminGroups.map((group) => (
                <table key={group.heading} className="sd-table sd-table--mapping">
                  <thead>
                    <tr>
                      <th colSpan={3} className="sd-mapping__section">{group.heading}</th>
                    </tr>
                    <tr>
                      <th className="sd-mapping__col-po">Program Outcomes</th>
                      <th className="sd-mapping__col-align">Program Educational Objectives</th>
                      <th className="sd-mapping__col-align">Strategic Goals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((p) => (
                      <tr key={p.id}>
                        <td>{poLabel(p.code)}. {p.title.replace(/\.$/, '')}</td>
                        <td>{p.peo_text?.trim() || '—'}</td>
                        <td>{p.sg_text?.trim() || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          )}

          {/* Course Learning Outcomes */}
          {clos.length > 0 && (
            <table className="sd-table sd-table--clo">
              <thead>
                <tr>
                  <th>Course Learning Outcomes</th>
                  <th className="sd-map-col">Program Outcomes</th>
                </tr>
              </thead>
              <tbody>
                {clos.map((c) => (
                  <tr key={c.id}>
                    <td>{c.code}: {c.description}</td>
                    <td>{c.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Course Details */}
          <div className="sd-details">
            <div className="sd-band">COURSE DETAILS</div>
            {courses.length === 0 ? (
              <p>No courses yet — add one on the Course page.</p>
            ) : (
              courses.map((c) => (
                <ol className="sd-details__list" key={c.id}>
                  <li><strong>Course Code:</strong> {c.code}</li>
                  <li><strong>Course Title:</strong> {c.title}</li>
                  <li><strong>Credits:</strong> Lecture {c.credit_lecture ?? 0} / Laboratory {c.credit_laboratory ?? 0} / Total {c.units ?? 0}</li>
                  <li><strong>Program:</strong> {programText(c)}</li>
                </ol>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default View
// Admin Curriculum Map: printable report that mirrors the VCQI course
// syllabus document (IT21 - Object Oriented Programming) page by page.
//
// The institution-record tables (Strategic Goals, PEOs, Program Outcomes)
// support inline editing and archiving directly on this page via the
// "Edit" toggle: click Edit, modify a row's fields, then Save. Archive
// hides a record from the report without deleting it (requires the status
// column migration — see supabase-schema.sql). Syllabus-fixed content
// (vision/mission wording, curriculum mapping columns, course details) is
// transcribed in src/data/vcqiSyllabus.ts and stays read-only.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchStrategicGoals,
  fetchProgramEducationalObjectives,
  fetchProgramOutcomesStandalone,
  updateStrategicGoal,
  updateProgramEducationalObjective,
  updateProgramOutcomeStandalone,
} from '../../services/database'
import type {
  StrategicGoal,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../../services/database'
import {
  DOC_HEADER,
  DOC_VISION,
  DOC_MISSION,
  PO_SECTION_HEADINGS,
  MAPPING_COMMON_DISCIPLINE,
  MAPPING_SUB_DISCIPLINE,
  CLO_PLO_MAPPING,
  COURSE_DETAILS,
} from '../../data/vcqiSyllabus.js'

interface CurriculumMapProps {
  userEmail: string
}

type EditableKind = 'goal' | 'peo' | 'po'

interface EditState {
  kind: EditableKind
  id: string
  title: string
  description: string
}

const poNumber = (code: string) => parseInt(code.replace(/[^0-9]/g, ''), 10)

const isActive = (item: { status?: string }) => !item.status || item.status === 'active'

function CurriculumMap({ userEmail }: CurriculumMapProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [goals, setGoals] = useState<StrategicGoal[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])

  const [editMode, setEditMode] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [busy, setBusy] = useState(false)
  const [collegeDefinedExpanded, setCollegeDefinedExpanded] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, p, po] = await Promise.all([
        fetchStrategicGoals(),
        fetchProgramEducationalObjectives(),
        fetchProgramOutcomesStandalone(),
      ])
      setGoals(g)
      setPeos(p)
      setPos(po.sort((a, b) => poNumber(a.code) - poNumber(b.code)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load curriculum map data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const itemOf = (kind: EditableKind, id: string) => {
    const list = kind === 'goal' ? goals : kind === 'peo' ? peos : pos
    return list.find((i) => i.id === id)
  }

  const startEdit = (kind: EditableKind, id: string) => {
    const item = itemOf(kind, id)
    if (!item) return
    setEdit({ kind, id, title: item.title, description: item.description || '' })
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

  // Row visibility: the report shows active records; edit mode can reveal
  // archived ones via the "Show archived" checkbox.
  const shown = <T extends { status?: string }>(list: T[]) =>
    list.filter((i) => (showArchived && editMode ? true : isActive(i)))

  const visibleGoals = shown(goals)
  const visiblePeos = shown(peos)
  const visiblePos = shown(pos)

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
  const editableListRow = (kind: EditableKind, item: StrategicGoal | ProgramEducationalObjective, display: React.ReactNode) => {
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
        {editMode && isActive(item) === false && <span className="sd-archived-badge">archived</span>}
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
          <label className="sd-check">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              disabled={!editMode}
            />
            Show archived
          </label>
          <button
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => { setEditMode(!editMode); setEdit(null); setShowArchived(false) }}
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
              <div>{DOC_HEADER.republic}</div>
              <div className="sd-letterhead__school">{DOC_HEADER.school}</div>
              <div>{DOC_HEADER.address}</div>
              <div className="sd-letterhead__motto">{DOC_HEADER.motto}</div>
            </div>
          </header>

          {/* Title block */}
          <div className="sd-titleblock">
            <div className="sd-titleblock__title">{DOC_HEADER.title}</div>
            <div>{DOC_HEADER.institute}</div>
            <div>{DOC_HEADER.program}</div>
            <div className="sd-titleblock__course">
              {COURSE_DETAILS.code} - {COURSE_DETAILS.title}
            </div>
            <div>{DOC_HEADER.term}</div>
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
                      <em>{g.code.replace(/^SG-/, 'Goal ')}. {g.title};</em>,
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
                        <strong>{p.code.replace(/-/, ' ')}: {p.title}</strong>
                        {p.description && <div className="sd-peo__desc">{p.description}</div>}
                      </>,
                    ),
                  )}
                  {visiblePeos.length === 0 && <span>No PEOs.</span>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Program Outcomes — single continuous table, academic document format */}
          <table className="sd-table sd-table--po-single">
            <thead>
              <tr>
                <th className="sd-po-single-title">PROGRAM OUTCOMES</th>
              </tr>
            </thead>
            <tbody>
              {/* Section 1: Common to all programs */}
              <tr>
                <td className="sd-po-single-section">
                  <div className="sd-po-single-section__head">
                    COMMON TO ALL PROGRAMS IN ALL TYPES OF SCHOOLS
                  </div>
                  <div className="sd-po-single-section__sub">
                    The NBSC graduates have the ability to:
                  </div>
                  {visiblePos.filter((p) => { const n = poNumber(p.code); return n >= 1 && n <= 5 }).map((p, i, arr) => {
                    const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                    const isLast = i === arr.length - 1
                    const semicolon = isLast ? '.' : ';'
                    return (
                      <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                        {poNumber(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                        {editMode && (
                          <span className="sd-po-single-item__actions">
                            {rowActions('po', p.id)}
                            {!isActive(p) && <span className="sd-archived-badge">archived</span>}
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

              {/* Section 2: BS in Computer Science POs */}
              <tr>
                <td className="sd-po-single-section">
                  <div className="sd-po-single-section__head">
                    BACHELOR OF SCIENCE IN COMPUTER SCIENCE PROGRAM OUTCOMES
                  </div>
                  {visiblePos.filter((p) => { const n = poNumber(p.code); return n >= 6 && n <= 9 }).map((p, i, arr) => {
                    const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                    const isLast = i === arr.length - 1
                    const semicolon = isLast ? '.' : ';'
                    return (
                      <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                        {poNumber(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                        {editMode && (
                          <span className="sd-po-single-item__actions">
                            {rowActions('po', p.id)}
                            {!isActive(p) && <span className="sd-archived-badge">archived</span>}
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

              {/* Section 3: Specific to sub-discipline */}
              <tr>
                <td className="sd-po-single-section">
                  <div className="sd-po-single-section__head">
                    SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR <em>(CMO 25 s. 2015)</em>
                  </div>
                  {visiblePos.filter((p) => { const n = poNumber(p.code); return n >= 10 && n <= 22 }).map((p, i, arr) => {
                    const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                    const isLast = i === arr.length - 1
                    const semicolon = isLast ? '.' : ';'
                    return (
                      <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                        {poNumber(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                        {editMode && (
                          <span className="sd-po-single-item__actions">
                            {rowActions('po', p.id)}
                            {!isActive(p) && <span className="sd-archived-badge">archived</span>}
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

              {/* Section 4: Common to horizontal types */}
              <tr>
                <td className="sd-po-single-section">
                  <div className="sd-po-single-section__head">
                    COMMON TO HORIZONTAL TYPES <em>(CMO 46 s. 2012)</em>
                  </div>
                  {visiblePos.filter((p) => { const n = poNumber(p.code); return n >= 23 && n <= 25 }).map((p, i, arr) => {
                    const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                    const isLast = i === arr.length - 1
                    const semicolon = isLast ? '.' : ';'
                    return (
                      <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                        {poNumber(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                        {editMode && (
                          <span className="sd-po-single-item__actions">
                            {rowActions('po', p.id)}
                            {!isActive(p) && <span className="sd-archived-badge">archived</span>}
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

              {/* Section 5: College defined */}
              <tr>
                <td className="sd-po-single-section">
                  <div className="sd-po-single-section__head">
                    COLLEGE DEFINED PROGRAM OUTCOME
                  </div>
                  {visiblePos.filter((p) => { const n = poNumber(p.code); return n >= 26 && n <= 27 }).map((p, i, arr) => {
                    const editingThis = edit && edit.kind === 'po' && edit.id === p.id
                    const isLast = i === arr.length - 1
                    const semicolon = isLast ? '.' : ';'
                    return (
                      <div key={p.id} className={`sd-po-single-outcome ${isActive(p) ? '' : 'sd-archived'}`}>
                        {poNumber(p.code)}. {p.title.replace(/\.$/, '')}{semicolon}
                        {editMode && (
                          <span className="sd-po-single-item__actions">
                            {rowActions('po', p.id)}
                            {!isActive(p) && <span className="sd-archived-badge">archived</span>}
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
            </tbody>
          </table>

          {/* Curriculum Mapping — one row per outcome, PEO/Goal cells aligned.
              Static transcription from the source syllabus (not editable). */}
          <div className="sd-band sd-band--center">CURRICULUM MAPPING</div>
          <table className="sd-table sd-table--map">
            <thead>
              <tr>
                <th className="sd-map-outcomes">
                  <div className="sd-map-title">Bachelor of Science in Information Technology Program Outcomes (CMO 25 s. 2015)</div>
                </th>
                <th className="sd-map-col">PROGRAM EDUCATIONAL OBJECTIVES</th>
                <th className="sd-map-col">STRATEGIC GOALS</th>
              </tr>
            </thead>
            <tbody>
              {MAPPING_COMMON_DISCIPLINE.map((m) => (
                <tr key={m.item}>
                  <td>{m.item}. {m.text}</td>
                  <td className="sd-map-cell">{m.peos}</td>
                  <td className="sd-map-cell">{m.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="sd-table sd-table--map">
            <thead>
              <tr>
                <th className="sd-map-outcomes">
                  <div className="sd-map-title">SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR (CMO 25 s. 2015)</div>
                </th>
                <th className="sd-map-col">PROGRAM EDUCATIONAL OBJECTIVES</th>
                <th className="sd-map-col">STRATEGIC GOALS</th>
              </tr>
            </thead>
            <tbody>
              {MAPPING_SUB_DISCIPLINE.map((m) => (
                <tr key={m.item}>
                  <td>{m.item}. {m.text}</td>
                  <td className="sd-map-cell">{m.peos}</td>
                  <td className="sd-map-cell">{m.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Course Learning Outcomes */}
          <table className="sd-table sd-table--clo">
            <thead>
              <tr>
                <th>Course Learning Outcomes</th>
                <th className="sd-map-col">Program Outcomes</th>
              </tr>
            </thead>
            <tbody>
              {CLO_PLO_MAPPING.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}: {c.text}</td>
                  <td>{c.plos}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Course Details */}
          <div className="sd-details">
            <div className="sd-band">COURSE DETAILS</div>
            <ol className="sd-details__list">
              <li><strong>Course Code:</strong> {COURSE_DETAILS.code}</li>
              <li><strong>Course Title:</strong> {COURSE_DETAILS.title}</li>
              <li><strong>Pre-requisite:</strong> {COURSE_DETAILS.prerequisite}</li>
              <li><strong>Co-requisite:</strong> {COURSE_DETAILS.corequisite}</li>
              <li><strong>Credit:</strong> {COURSE_DETAILS.credit}</li>
            </ol>
            <div className="sd-details__section"><strong>VI. COURSE DESCRIPTION</strong></div>
            <p className="sd-cell--justify">{COURSE_DETAILS.description}</p>
            <div className="sd-details__section"><strong>VII. COURSE LEARNING OUTCOMES</strong></div>
            <ol className="sd-details__clos">
              {CLO_PLO_MAPPING.map((c) => (
                <li key={c.code}>{c.text}</li>
              ))}
            </ol>
            <div className="sd-details__section"><strong>VIII. NUMBER OF HOURS:</strong> {COURSE_DETAILS.hours}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CurriculumMap

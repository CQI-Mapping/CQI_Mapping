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
import { normalizeCode, cloMatchesSubject } from '../../utils/courseCodes'
import { isActive, buildGroups, splitReportPos, poNumber } from '../../utils/report'
import type { EditableItem, EditableKind, EditState } from '../../utils/report'
import SyllabusReport from '../../components/SyllabusReport'

interface ViewProps {
  userEmail: string
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
  const [selectedCourseId, setSelectedCourseId] = useState('')

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

  // Subject scope: the report renders one subject's syllabus at a time.
  // CLOs link to a subject through their free-text `course` field, so matching
  // is lenient (see courseCodes.ts). Defaults to the first active subject.
  const activeCourses = courses.filter(isActive)
  const selectedCourse =
    activeCourses.find((c) => c.id === selectedCourseId) ?? activeCourses[0] ?? null
  const subjectClos = selectedCourse
    ? clos.filter((c) => isActive(c) && cloMatchesSubject(c.course || '', normalizeCode(selectedCourse.code)))
    : []

  // Pre-req / co-req resolution ("IT13" → "IT13 - Fundamentals of Programming
  // 2", one line per course), PO grouping and the Course Details markup are
  // shared with the Subject Graph's About card via utils/courseCodes,
  // utils/report and components/SyllabusReport.
  const { adminPos, managerPos } = splitReportPos(visiblePos)
  const adminGroups = buildGroups(adminPos, cmos)
  const managerGroups = buildGroups(managerPos, cmos)

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
          {activeCourses.length > 0 && (
            <label className="sd-toolbar__subject">
              <span>Subject</span>
              <select
                className="input input--sm"
                value={selectedCourse?.id ?? ''}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                aria-label="Select subject for this syllabus"
              >
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}{c.title ? ` — ${c.title}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
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
        <SyllabusReport
          course={selectedCourse}
          courses={courses}
          goals={visibleGoals}
          peos={visiblePeos}
          adminGroups={adminGroups}
          managerGroups={managerGroups}
          subjectClos={subjectClos}
          editMode={editMode}
          edit={edit}
          busy={busy}
          onEditChange={setEdit}
          rowActions={rowActions}
          editableListRow={editableListRow}
        />
      )}
    </div>
  )
}

export default View
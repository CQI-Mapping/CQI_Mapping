// Manager Course page: manages courses linked to a program. Pick a program and
// curriculum, then create / edit / archive the courses inside it. The top panel
// creates courses; editing expands the course card itself inline (the same
// card-expanding editor the CLO page uses). Courses can reference a
// prerequisite and corequisite from the same program, and credits are split
// into lecture + laboratory (total is computed automatically).
// Managers cannot delete courses (RLS blocks it too).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useDraft } from '../../hooks/useDraft'
import { useViewMode } from '../../hooks/useViewMode'
import ViewModeToggle from '../../components/ViewModeToggle'
import Icon from '../../components/icons'
import { normalizeCode } from '../../utils/courseCodes'
import {
  fetchPrograms,
  fetchResources,
  fetchCourses,
  createCourse,
  updateCourse,
  courseTermColumnsExist,
  addActivityLog,
} from '../../services/database'
import type { Program, Resource, Course } from '../../services/database'

const instructorLabelOf = (v: Course['instructor_id']) =>
  v && typeof v === 'object' ? v.full_name || v.email : ''

// Term placement readback, worded exactly like the OBE Curriculum Map's
// columns ("2nd Year · 1st Sem"), so the card badge and the map agree.
const ordYear = (n: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1] ?? `${n}th`
const termLabelOf = (c: Pick<Course, 'year_level' | 'semester'>): string => {
  if (c.year_level == null) return ''
  const sem = c.semester === 1 ? '1st Sem' : c.semester === 2 ? '2nd Sem' : c.semester === 3 ? 'Off Sem' : ''
  return sem ? `${ordYear(c.year_level)} Year · ${sem}` : `${ordYear(c.year_level)} Year`
}

interface CourseProps {
  profile?: { email?: string | null } | null
}

type CourseForm = {
  code: string
  title: string
  curriculum: string
  yearLevel: string
  semester: string
  prereq: string
  prereqNA: boolean
  coreq: string
  coreqNA: boolean
  creditLecture: string
  creditLaboratory: string
  description: string
}

const blank: CourseForm = {
  code: '',
  title: '',
  curriculum: '',
  yearLevel: '',
  semester: '',
  prereq: '',
  prereqNA: false,
  coreq: '',
  coreqNA: false,
  creditLecture: '',
  creditLaboratory: '',
  description: '',
}

const relId = (v: string | { id: string } | null | undefined) =>
  v && typeof v === 'object' ? v.id : (v || '')

// Count how many duplicate tokens exist in a comma-separated pre-req/co-req value.
const dupTokenCount = (v: string) => {
  const seen = new Set<string>()
  let dupes = 0
  for (const t of v.split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)) {
    if (seen.has(t)) dupes++
    seen.add(t)
  }
  return dupes
}

// Split a comma-separated pre-req/co-req value into trimmed non-empty tokens.
const listTokens = (s: string) => (s || '').split(',').map((t) => t.trim()).filter(Boolean)

// Credit units clamp to 0–3; the field may stay temporarily empty while typing.
const clampCredit = (v: string) => (v === '' ? '' : Number(v) > 3 ? '3' : Number(v) < 0 ? '0' : v)

interface ComboInputProps {
  value: string
  onChange: (value: string) => void
  options: { code: string; title: string }[]
  placeholder: string
  disabled?: boolean
  /** Compact height, used by the inline card editor and other dense forms. */
  small?: boolean
}

function ComboInput({ value, onChange, options, placeholder, disabled, small }: ComboInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Tokens already entered in the field (comma-separated).
  const picked = listTokens(value)

  // Whether a token refers to the same subject as a code (lenient, mirrors the report).
  const sameAs = (token: string, code: string) => {
    const tn = normalizeCode(token)
    const cn = normalizeCode(code)
    return tn === cn || tn.startsWith(cn)
  }

  const uniqueOptions = Array.from(new Map(options.map((o) => [o.code, o])).values())
  const visibleOptions = uniqueOptions
    .filter((o) => !picked.some((t) => sameAs(t, o.code)))
    .filter((o) =>
      query ? `${o.code} ${o.title}`.toLowerCase().includes(query.toLowerCase()) : true,
    )

  // Selecting a suggestion APPENDS it — multiple pre-requisites accumulate as
  // "IT12, IT13, CS101" instead of replacing what was typed.
  const addToken = (code: string) => {
    const next = picked.length === 0 ? code : [...picked, code].join(', ')
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="combo" ref={ref}>
      <input
        className={small ? 'input input--sm' : 'input'}
        type="text"
        placeholder={placeholder}
        value={disabled ? '' : value}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      <button type="button" className="combo__caret" tabIndex={-1} disabled={disabled}
        aria-label="Toggle options" onClick={() => setOpen((v) => !v)}>
        v
      </button>
      {open && !disabled && (
        <div className="combo__list">
          {visibleOptions.length === 0 && (
            <div className="combo__empty">
              {picked.length > 0 ? 'All available subjects already added' : 'No matches'}
            </div>
          )}
          {visibleOptions.map((o) => (
            <button type="button" key={o.code} className="combo__item"
              onMouseDown={(e) => { e.preventDefault(); addToken(o.code) }}>
              {o.code}{o.title ? ` — ${o.title}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ManagerCourse({ profile }: CourseProps) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [curriculums, setCurriculums] = useState<Resource[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [programId, setProgramId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Create + edit forms persist to sessionStorage so typed text survives
  // page navigation (the page unmounts when switching sidebar pages).
  const [form, setForm, clearForm] = useDraft<CourseForm>('cqi.draft.Course.create', blank)
  const [editState, setEditState, clearEdit] = useDraft('cqi.draft.Course.edit', {
    editId: null as string | null,
    editForm: blank,
  })
  const { editId, editForm } = editState
  const setEditId = (id: string | null) => setEditState((s) => ({ ...s, editId: id }))
  const setEditForm = (f: CourseForm) => setEditState((s) => ({ ...s, editForm: f }))
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  // List (default) or grid card style — the user decides per browser.
  const [viewMode, setViewMode] = useViewMode('cqi.viewMode.course')
  // The term selects only render when the database actually carries the
  // courses.year_level / courses.semester columns — the same probe the
  // Curriculum Mapping Summary uses before it shows its edit controls. A
  // database provisioned before migration 003 keeps the form usable without
  // them, and the map simply reports those subjects as unplaced.
  const [termColumns, setTermColumns] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    courseTermColumnsExist()
      .then((ok) => { if (alive) setTermColumns(ok) })
      .catch(() => { if (alive) setTermColumns(true) })
    return () => { alive = false }
  }, [])

  const errMsg = (e: unknown) => {
    if (e instanceof Error) return e.message
    if (e && typeof e === 'object') {
      const m = (e as Record<string, unknown>).message
      return typeof m === 'string' ? m : JSON.stringify(e)
    }
    return String(e)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [p, res, c] = await Promise.all([fetchPrograms(), fetchResources(), fetchCourses()])
      setPrograms(p)
      // Arrange curriculum options by number (natural order: 1, 2, … 10)
      setCurriculums(
        res
          .filter((r) => r.status !== 'archived' && (r.code || r.title))
          .sort((a, b) =>
            String(a.code || a.title || '').localeCompare(
              String(b.code || b.title || ''),
              undefined,
              { numeric: true, sensitivity: 'base' },
            ),
          ),
      )
      setCourses(c)
      setProgramId((prev) => {
        if (prev && p.some((x) => x.id === prev)) return prev
        return p[0]?.id ?? ''
      })
    } catch (e) {
      setError('Unable to load courses: ' + errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const isActive = (c: Course) => !c.status || c.status === 'active'
  const q = query.trim().toLowerCase()
  const visible = courses.filter((c) =>
    typeof c.program_id === 'object' ? c.program_id.id === programId : c.program_id === programId,
  ).filter((c) => (archived ? !isActive(c) : isActive(c))).filter(
    (c) => !q || [c.code, c.title, c.prerequisite, c.corequisite, c.description, instructorLabelOf(c.instructor_id)].some((v) => (v || '').toLowerCase().includes(q)),
  )

  const archivedCount = courses.filter(
    (c) =>
      !isActive(c) &&
      (typeof c.program_id === 'object' ? c.program_id.id === programId : c.program_id === programId),
  ).length

  const programCourses = courses.filter(
    (c) =>
      isActive(c) &&
      c.id !== editId &&
      (typeof c.program_id === 'object' ? c.program_id.id === programId : c.program_id === programId),
  )

  // Duplicate lookup: same program + same normalized code. Catches "it21",
  // "IT 21", "IT-21", etc. so near-duplicates can't sneak past the DB
  // constraint (courses_program_id_code_key) and mislead the report/Subject Graph.
  const sameProgram = (c: Course) =>
    (typeof c.program_id === 'object' ? c.program_id.id : c.program_id) === programId
  const dupeFor = (code: string, excludeId?: string) =>
    courses.find(
      (c) =>
        c.id !== excludeId &&
        sameProgram(c) &&
        normalizeCode(c.code) === normalizeCode(code),
    )
  const dupeMessage = (code: string, dupe: Course) =>
    isActive(dupe)
      ? `A course with code ${code} already exists in this program.`
      : `${code} exists but is archived — toggle "Archived" on this page and press Restore on that card instead of creating a new one.`

  const totalCredits = (f: CourseForm) => {
    const lec = parseInt(f.creditLecture, 10) || 0
    const lab = parseInt(f.creditLaboratory, 10) || 0
    return lec + lab
  }

  const idOf = (v: string | { id: string } | null) => (v && typeof v === 'object' ? v.id : v)
  const curriculumLabel = (id: string | { id: string } | null) => {
    if (!id) return '-'
    const r = curriculums.find((x) => x.id === idOf(id))
    return r ? (r.code || r.title) : '-'
  }

  const buildPayload = (f: CourseForm) => ({
    code: f.code.trim().toUpperCase(),
    title: f.title.trim(),
    curriculum_id: f.curriculum || null,
    year_level: f.yearLevel ? Number(f.yearLevel) : null,
    semester: f.semester ? Number(f.semester) : null,
    prerequisite: f.prereqNA ? '' : f.prereq.trim(),
    corequisite: f.coreqNA ? '' : f.coreq.trim(),
    credit_lecture: parseInt(f.creditLecture, 10) || 0,
    credit_laboratory: parseInt(f.creditLaboratory, 10) || 0,
    units: totalCredits(f),
    description: f.description.trim() || null,
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!programId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const code = form.code.trim().toUpperCase()
      const dupe = dupeFor(code)
      if (dupe) {
        setError(dupeMessage(code, dupe))
        return
      }
      // Keep the returned row: the id is only known after the insert, so the
      // audit entry used to go out without one and a created course could not
      // be traced back to its row.
      const created = await createCourse({ program_id: programId, ...buildPayload(form) })
      await addActivityLog('course.created', {
        entity: 'course',
        entity_id: created.id,
        label: `${code} — ${form.title.trim()}`,
      })
      setMessage('Course created.')
      clearForm()
      load()
    } catch (err) {
      setError('Failed to create course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (item: Course) => {
    const pid = typeof item.program_id === 'object' ? item.program_id.id : item.program_id
    setProgramId(pid)
    setEditState({
      editId: item.id,
      editForm: {
        code: item.code,
        title: item.title,
        curriculum: relId(item.curriculum_id),
        yearLevel: item.year_level == null ? '' : String(item.year_level),
        semester: item.semester == null ? '' : String(item.semester),
        prereq: item.prerequisite || '',
        prereqNA: !item.prerequisite,
        coreq: item.corequisite || '',
        coreqNA: !item.corequisite,
        creditLecture: String(item.credit_lecture ?? 0),
        creditLaboratory: String(item.credit_laboratory ?? 0),
        description: item.description || '',
      },
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const code = editForm.code.trim().toUpperCase()
      const dupe = dupeFor(code, editId)
      if (dupe) {
        setError(dupeMessage(code, dupe))
        return
      }
      await updateCourse(editId, buildPayload(editForm))
      await addActivityLog('course.updated', {
        entity: 'course',
        entity_id: editId,
        label: `${editForm.code.trim().toUpperCase()} — ${editForm.title.trim()}`,
      })
      setMessage('Course updated.')
      clearEdit()
      load()
    } catch (err) {
      setError('Failed to update course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const cancelEdit = () => {
    clearEdit()
  }

  const handleToggleStatus = async (item: Course) => {
    setError('')
    setMessage('')
    const next = isActive(item) ? 'archived' : 'active'
    setBusy(true)
    try {
      await updateCourse(item.id, { status: next })
      await addActivityLog(next === 'archived' ? 'course.archived' : 'course.restored', {
        entity: 'course',
        entity_id: item.id,
        label: item.code || item.title || undefined,
      })
      setMessage(`Course ${next}.`)
      if (editId === item.id) cancelEdit()
      load()
    } catch (err) {
      setError('Failed to update course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  // Credit units (lecture / laboratory) share one clamped numeric input.
  const creditField = (
    label: string,
    key: 'creditLecture' | 'creditLaboratory',
    f: CourseForm,
    setF: (next: CourseForm) => void,
    small = false,
  ) => (
    <label className="field" style={small ? { marginBottom: 0 } : undefined}>
      <span>{label}</span>
      <input className={small ? 'input input--sm' : 'input'} type="number" min={0} max={3} value={f[key]}
        onChange={(e) => setF({ ...f, [key]: clampCredit(e.target.value) })}
        onWheel={(e) => (e.target as HTMLInputElement).blur()} />
    </label>
  )

  // Inline edit form for a single course card — the same card-expanding editor
  // the CLO page uses: fields stack inside the card and Save/Cancel sit at the
  // bottom, so editing a course never yanks the manager back to the top form.
  // Both card styles (list row and grid card) render it directly.
  const renderCourseEdit = () => (
    <div className="resource-card__edit">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input className="input input--sm" type="text" placeholder="Course code (e.g. IT21)"
          value={editForm.code}
          onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} required />
        <input className="input input--sm" type="text" placeholder="Course title"
          value={editForm.title}
          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <select className="input input--sm" title="Curriculum" value={editForm.curriculum}
          onChange={(e) => setEditForm({ ...editForm, curriculum: e.target.value })}>
          <option value="">No curriculum</option>
          {curriculums.map((r) => (
            <option key={r.id} value={r.id}>{r.code || r.title}</option>
          ))}
        </select>
        {termColumns ? (
          <>
            <select className="input input--sm" title="Year level" value={editForm.yearLevel}
              onChange={(e) => setEditForm({
                ...editForm,
                yearLevel: e.target.value,
                // Clearing the year has no semester to keep.
                semester: e.target.value ? editForm.semester : '',
              })}>
              <option value="">Not placed</option>
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>{ordYear(y)} Year</option>
              ))}
            </select>
            <select className="input input--sm" title="Semester" value={editForm.semester} disabled={!editForm.yearLevel}
              onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}>
              <option value="">Not placed</option>
              <option value="1">1st Sem</option>
              <option value="2">2nd Sem</option>
              <option value="3">Off-sem</option>
            </select>
          </>
        ) : (
          <input className="input input--sm" readOnly disabled
            title="Term placement is unavailable — the database lacks courses.year_level / courses.semester (migration 003)."
            value="Year/semester unavailable (migration 003)" />
        )}
      </div>
      <div className="na-row">
        <ComboInput
          value={editForm.prereq}
          onChange={(v) => setEditForm({ ...editForm, prereq: v })}
          options={programCourses}
          placeholder="Type or select prerequisite"
          disabled={editForm.prereqNA}
          small
        />
        <label className="na-check">
          <input type="checkbox" checked={editForm.prereqNA}
            onChange={(e) => setEditForm({ ...editForm, prereqNA: e.target.checked, prereq: e.target.checked ? '' : editForm.prereq })} />
          <span className="cb-box" aria-hidden="true" />
          N/A
        </label>
      </div>
      {!editForm.prereqNA && dupTokenCount(editForm.prereq) > 0 && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          Repeated pre-requisites are listed once in the report.
        </div>
      )}
      <div className="na-row">
        <ComboInput
          value={editForm.coreq}
          onChange={(v) => setEditForm({ ...editForm, coreq: v })}
          options={programCourses}
          placeholder="Type or select co-requisite"
          disabled={editForm.coreqNA}
          small
        />
        <label className="na-check">
          <input type="checkbox" checked={editForm.coreqNA}
            onChange={(e) => setEditForm({ ...editForm, coreqNA: e.target.checked, coreq: e.target.checked ? '' : editForm.coreq })} />
          <span className="cb-box" aria-hidden="true" />
          N/A
        </label>
      </div>
      {!editForm.coreqNA && dupTokenCount(editForm.coreq) > 0 && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          Repeated co-requisites are listed once in the report.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {creditField('Lecture', 'creditLecture', editForm, setEditForm, true)}
        {creditField('Laboratory', 'creditLaboratory', editForm, setEditForm, true)}
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Total</span>
          <input className="input input--sm" type="number" readOnly value={totalCredits(editForm)} />
        </label>
      </div>
      <textarea className="input input--sm" rows={2} placeholder="Description"
        value={editForm.description}
        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
      <div className="program-card__actions">
        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>
          {busy ? 'Saving...' : (<><Icon name="check" size={13} /> Save</>)}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={cancelEdit} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">C</div>
          <div className="program-hero__titles">
            <h2>Courses</h2>
            <p>Catalog, prerequisites, and credit mapping per program and curriculum.</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{courses.length}</div>
          <div className="program-stat__sub">{programs.length} programs</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Visible</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{visible.length}</div>
          <div className="program-stat__sub">{archived ? 'Archived' : 'Active'} in current program</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Archived</div>
          <div className="program-stat__value" style={{ color: '#64748b' }}>{archivedCount}</div>
          <div className="program-stat__sub">Hidden from lists</div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {message && <p className="msg msg--success" role="status">{message}</p>}
      {loading ? (
        <p>Loading courses...</p>
      ) : (
        <>
          <form className="panel create-resource" onSubmit={handleCreate} style={{ borderTop: '3px solid #16a34a' }}>
            <h3>New Course</h3>
            <label className="field">
              <span>Program code</span>
              <select className="input" value={programId}
                onChange={(e) => setProgramId(e.target.value)} required>
                {programs.length === 0 && <option value="">No programs yet</option>}
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.code}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Curriculum</span>
              <select className="input" value={form.curriculum}
                onChange={(e) => setForm({ ...form, curriculum: e.target.value })}>
                <option value="">None</option>
                {curriculums.map((r) => (
                  <option key={r.id} value={r.id}>{r.code || r.title}</option>
                ))}
              </select>
            </label>
            {termColumns ? (
              <>
                <label className="field">
                  <span>Year Level</span>
                  <select className="input" value={form.yearLevel}
                    onChange={(e) => setForm({
                      ...form,
                      yearLevel: e.target.value,
                      // Clearing the year has no semester to keep.
                      semester: e.target.value ? form.semester : '',
                    })}>
                    <option value="">Not placed</option>
                    {[1, 2, 3, 4, 5, 6].map((y) => (
                      <option key={y} value={y}>{ordYear(y)} Year</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Semester</span>
                  <select className="input" value={form.semester} disabled={!form.yearLevel}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}>
                    <option value="">Not placed</option>
                    <option value="1">1st Sem</option>
                    <option value="2">2nd Sem</option>
                    <option value="3">Off-sem</option>
                  </select>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Places the subject in the OBE Curriculum Map's Year · Semester columns.
                  </div>
                </label>
              </>
            ) : (
              <label className="field">
                <span>Year Level / Semester</span>
                <input className="input" readOnly disabled
                  value="Unavailable — the database lacks courses.year_level / courses.semester (migration 003)." />
              </label>
            )}
            <label className="field">
              <span>Course Code</span>
              <input className="input" type="text" placeholder="e.g. IT21"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label className="field">
              <span>Course Title</span>
              <input className="input" type="text" placeholder="Course title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="field">
              <span>Pre-requisite</span>
              <div className="na-row">
<ComboInput
                  value={form.prereq}
                  onChange={(v) => setForm({ ...form, prereq: v })}
                  options={programCourses}
                  placeholder="Type or select prerequisite"
                  disabled={form.prereqNA}
                />
                <label className="na-check">
                  <input type="checkbox" checked={form.prereqNA}
                    onChange={(e) => setForm({ ...form, prereqNA: e.target.checked, prereq: e.target.checked ? '' : form.prereq })} />
                  <span className="cb-box" aria-hidden="true" />
                  N/A
                </label>
              </div>
              {!form.prereqNA && dupTokenCount(form.prereq) > 0 && (
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                  Repeated pre-requisites are listed once in the report.
                </div>
              )}
            </label>
            <label className="field">
              <span>Co-requisite</span>
              <div className="na-row">
<ComboInput
                  value={form.coreq}
                  onChange={(v) => setForm({ ...form, coreq: v })}
                  options={programCourses}
                  placeholder="Type or select co-requisite"
                  disabled={form.coreqNA}
                />
                <label className="na-check">
                  <input type="checkbox" checked={form.coreqNA}
                    onChange={(e) => setForm({ ...form, coreqNA: e.target.checked, coreq: e.target.checked ? '' : form.coreq })} />
                  <span className="cb-box" aria-hidden="true" />
                  N/A
                </label>
              </div>
              {!form.coreqNA && dupTokenCount(form.coreq) > 0 && (
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                  Repeated co-requisites are listed once in the report.
                </div>
              )}
            </label>
            <div className="field">
              <span>Credit</span>
              <div className="credit-group">
                {creditField('Lecture', 'creditLecture', form, setForm)}
                {creditField('Laboratory', 'creditLaboratory', form, setForm)}
                <label className="field">
                  <span>Total</span>
                  <input className="input" type="number" readOnly value={totalCredits(form)} />
                </label>
              </div>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea className="input" rows={3} placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="create-resource__submit">
              <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
                {busy ? 'Saving...' : (<><Icon name="plus" size={13} /> Add</>)}
              </button>
            </div>
          </form>

          <div className="program-panel">
            <div className="program-toolbar">
              <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
                <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
                <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
                  Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
                </button>
              </div>
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              <label className="program-search" aria-label="Search courses">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20L15.5 15.5"/></svg>
                <input className="input input--sm" type="search" placeholder="Search courses..." value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
            {visible.length === 0 ? (
              <div className="program-empty" style={{ marginTop: 14 }}>
                <strong>No {archived ? 'archived' : 'active'} courses yet.</strong>
                <span>{query ? `No results for "${query}"` : `Add your first course for ${programs.find(p=>p.id===programId)?.code || 'this program'}.`}</span>
              </div>
            ) : viewMode === 'list' ? (
              <div className="resource-list">
                {visible.map((c) => (
                  <div key={c.id} className={`resource-card ${isActive(c) ? '' : 'resource-card--archived'}`}
                    onDoubleClick={() => { if (!busy && editId === null) startEdit(c) }}
                    title={editId === c.id ? undefined : 'Double-click to edit'}>
                    {editId === c.id ? renderCourseEdit() : (
                      <>
                        <div className="resource-card__body">
                          <h4>{c.code} — {c.title}</h4>
                          {c.description && <p>{c.description}</p>}
                          <div className="resource-card__meta">
                            <span className={`status-badge status-badge--${isActive(c) ? 'active' : 'archived'}`}>{isActive(c) ? 'Active' : 'Archived'}</span>
                            <span>{curriculumLabel(c.curriculum_id)}</span>
                            {termLabelOf(c) && <span title="Term placement — which column the subject stands in on the OBE Curriculum Map">{termLabelOf(c)}</span>}
                            <span>{c.credit_lecture ?? 0} lec / {c.credit_laboratory ?? 0} lab</span>
                            <span>{instructorLabelOf(c.instructor_id)}</span>
                          </div>
                        </div>
                        <div className="resource-card__actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)} disabled={busy || !!editId} aria-label={`Edit ${c.code}`} title="Edit"><Icon name="edit" size={13} /></button>
                          <button className={`btn btn--sm ${isActive(c) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleToggleStatus(c)} disabled={busy || !!editId} aria-label={isActive(c) ? `Archive ${c.code}` : `Restore ${c.code}`} title={isActive(c) ? 'Archive' : 'Restore'}>
                            <Icon name={isActive(c) ? 'archive' : 'restore'} size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="program-grid" style={{ marginTop: 14 }}>
                {visible.map((c) => (
                  <div key={c.id} className="program-card--2026 card-enter" data-status={isActive(c) ? 'active' : 'archived'}
                    onDoubleClick={() => { if (!busy && editId === null) startEdit(c) }}
                    title={editId === c.id ? undefined : 'Double-click to edit'}>
                    {editId === c.id ? renderCourseEdit() : (
                      <>
                        <div className="program-card__top">
                          <span className="program-card__code">{c.code}</span>
                          <span className={`program-card__status ${isActive(c) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                            <span className="program-card__status-dot" />{isActive(c) ? 'Active' : 'Archived'}
                          </span>
                        </div>
                        <h3 className="program-card__name">{c.title}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                          <div style={{ display: 'flex', gap: 6 }}><span style={{ fontWeight: 700, color: '#64748b' }}>Curriculum:</span><span style={{ color: '#0f172a' }}>{curriculumLabel(c.curriculum_id)}</span></div>
                          <div style={{ display: 'flex', gap: 6 }}><span style={{ fontWeight: 700, color: '#64748b' }}>Term:</span><span style={{ color: '#0f172a' }}>{termLabelOf(c) || 'Not placed'}</span></div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, color: '#64748b' }}>Instructor:</span>
                            <span style={{ color: '#0f172a' }}>{instructorLabelOf(c.instructor_id)}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ color: '#475569' }}>
                              <strong style={{ color: '#64748b' }}>Pre-req:</strong>
                              {listTokens(c.prerequisite).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  {listTokens(c.prerequisite).map((p, i) => (
                                    <span key={i}>{p}</span>
                                  ))}
                                </div>
                              ) : <span> N/A</span>}
                            </div>
                            <div style={{ color: '#475569' }}>
                              <strong style={{ color: '#64748b' }}>Co-req:</strong>
                              {listTokens(c.corequisite).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  {listTokens(c.corequisite).map((p, i) => (
                                    <span key={i}>{p}</span>
                                  ))}
                                </div>
                              ) : <span> N/A</span>}
                            </div>
                          </div>
                          <div style={{ color: '#475569' }}><strong style={{ color: '#64748b' }}>Credits:</strong> {c.credit_lecture ?? 0} lec / {c.credit_laboratory ?? 0} lab / {c.units ?? 0} total</div>
                        </div>
                        <p className="program-card__desc">{c.description || 'No description.'}</p>
                        <div className="program-card__actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)} disabled={busy || !!editId} aria-label={`Edit ${c.code}`} title="Edit"><Icon name="edit" size={13} /></button>
                          <button className={`btn btn--sm ${isActive(c) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleToggleStatus(c)} disabled={busy || !!editId} aria-label={isActive(c) ? `Archive ${c.code}` : `Restore ${c.code}`} title={isActive(c) ? 'Archive' : 'Restore'}>
                            <Icon name={isActive(c) ? 'archive' : 'restore'} size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
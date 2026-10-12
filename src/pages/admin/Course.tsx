// Admin Course page: manages courses linked to a program. Pick a program and
// curriculum, then create / edit / delete the courses inside it. Courses can
// reference a prerequisite and corequisite from the same program, and credits
// are split into lecture + laboratory (total is computed automatically).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useDraft } from '../../hooks/useDraft'
import { useViewMode } from '../../hooks/useViewMode'
import ViewModeToggle from '../../components/ViewModeToggle'
import Icon from '../../components/icons'
import {
  fetchPrograms,
  fetchResources,
  fetchCourses,
  fetchAllProfiles,
  createCourse,
  updateCourse,
  deleteCourse,
  assignCourseInstructor,
  addActivityLog,
} from '../../services/database'
import type { Program, Resource, Course, Profile } from '../../services/database'

const instructorIdOf = (v: Course['instructor_id']) =>
  v && typeof v === 'object' ? v.id : v || ''
const instructorLabelOf = (v: Course['instructor_id']) =>
  v && typeof v === 'object' ? v.full_name || v.email : ''

interface CourseProps {
  profile?: { email?: string | null } | null
  onViewSubject?: (courseId: string) => void
  hideDelete?: boolean
}

type CourseForm = {
  code: string
  title: string
  curriculum: string
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

interface ComboInputProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  disabled?: boolean
}

function ComboInput({ value, onChange, options, placeholder, disabled }: ComboInputProps) {
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

  const uniqueOptions = Array.from(new Set(options))
  const visibleOptions = query
    ? uniqueOptions.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : uniqueOptions

  return (
    <div className="combo" ref={ref}>
      <input
        className="input"
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
          {visibleOptions.length === 0 && <div className="combo__empty">No matches</div>}
          {visibleOptions.map((o) => (
            <button type="button" key={o} className="combo__item"
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false) }}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Course({ profile, onViewSubject, hideDelete }: CourseProps) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [curriculums, setCurriculums] = useState<Resource[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [faculty, setFaculty] = useState<Profile[]>([])
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null)
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
      const [p, res, c, users] = await Promise.all([fetchPrograms(), fetchResources(), fetchCourses(), fetchAllProfiles().catch(() => [] as Profile[])])
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
      setFaculty(users)
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
    code: f.code.trim(),
    title: f.title.trim(),
    curriculum_id: f.curriculum || null,
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
      await createCourse({ program_id: programId, ...buildPayload(form) })
      await addActivityLog('course.created')
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
      await updateCourse(editId, buildPayload(editForm))
      await addActivityLog('course.updated')
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course permanently?')) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await deleteCourse(id)
      await addActivityLog('course.deleted')
      setMessage('Course deleted.')
      load()
    } catch (err) {
      setError('Failed to delete course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  // Assign (or unassign with '') the faculty user teaching a course.
  const handleAssign = async (courseId: string, instructorId: string) => {
    setError('')
    setMessage('')
    setAssignBusyId(courseId)
    try {
      await assignCourseInstructor(courseId, instructorId || null)
      await addActivityLog('course.assigned')
      setMessage(instructorId ? 'Instructor assigned.' : 'Instructor unassigned.')
      load()
    } catch (err) {
      setError('Failed to assign instructor: ' + errMsg(err))
    } finally {
      setAssignBusyId(null)
    }
  }

  const handleToggleStatus = async (item: Course) => {
    setError('')
    setMessage('')
    const next = isActive(item) ? 'archived' : 'active'
    setBusy(true)
    try {
      await updateCourse(item.id, { status: next })
      await addActivityLog(next === 'archived' ? 'course.archived' : 'course.restored')
      setMessage(`Course ${next}.`)
      if (editId === item.id) cancelEdit()
      load()
    } catch (err) {
      setError('Failed to update course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const editing = editId !== null
  const activeForm = editing ? editForm : form
  const setActiveForm = editing ? setEditForm : setForm

  const creditField = (label: string, key: 'creditLecture' | 'creditLaboratory') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="number" min={0} max={3} value={activeForm[key]}
        onChange={(e) => {
          let v = e.target.value
          if (Number(v) > 3) v = '3'
          if (Number(v) < 0) v = '0'
          setActiveForm({ ...activeForm, [key]: v })
        }}
        onWheel={(e) => (e.target as HTMLInputElement).blur()} />
    </label>
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
            <h3>{editing ? `Edit Course — ${editForm.code || 'untitled'}` : 'New Course'}</h3>
            <label className="field">
              <span>Program code</span>
              <select className="input" value={programId}
                onChange={(e) => setProgramId(e.target.value)} required disabled={editing}>
                {programs.length === 0 && <option value="">No programs yet</option>}
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.code}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Curriculum</span>
              <select className="input" value={activeForm.curriculum}
                onChange={(e) => setActiveForm({ ...activeForm, curriculum: e.target.value })}>
                <option value="">None</option>
                {curriculums.map((r) => (
                  <option key={r.id} value={r.id}>{r.code || r.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Course Code</span>
              <input className="input" type="text" placeholder="e.g. IT21"
                value={activeForm.code}
                onChange={(e) => setActiveForm({ ...activeForm, code: e.target.value })} required />
            </label>
            <label className="field">
              <span>Course Title</span>
              <input className="input" type="text" placeholder="Course title"
                value={activeForm.title}
                onChange={(e) => setActiveForm({ ...activeForm, title: e.target.value })} required />
            </label>
            <label className="field">
              <span>Pre-requisite</span>
              <div className="na-row">
<ComboInput
                  value={activeForm.prereq}
                  onChange={(v) => setActiveForm({ ...activeForm, prereq: v })}
                  options={programCourses.map((c) => c.code)}
                  placeholder="Type or select prerequisite"
                  disabled={activeForm.prereqNA}
                />
                <label className="na-check">
                  <input type="checkbox" checked={activeForm.prereqNA}
                    onChange={(e) => setActiveForm({ ...activeForm, prereqNA: e.target.checked, prereq: e.target.checked ? '' : activeForm.prereq })} />
                  <span className="cb-box" aria-hidden="true" />
                  N/A
                </label>
              </div>
            </label>
            <label className="field">
              <span>Co-requisite</span>
              <div className="na-row">
<ComboInput
                  value={activeForm.coreq}
                  onChange={(v) => setActiveForm({ ...activeForm, coreq: v })}
                  options={programCourses.map((c) => c.code)}
                  placeholder="Type or select co-requisite"
                  disabled={activeForm.coreqNA}
                />
                <label className="na-check">
                  <input type="checkbox" checked={activeForm.coreqNA}
                    onChange={(e) => setActiveForm({ ...activeForm, coreqNA: e.target.checked, coreq: e.target.checked ? '' : activeForm.coreq })} />
                  <span className="cb-box" aria-hidden="true" />
                  N/A
                </label>
              </div>
            </label>
            <div className="field">
              <span>Credit</span>
              <div className="credit-group">
                {creditField('Lecture', 'creditLecture')}
                {creditField('Laboratory', 'creditLaboratory')}
                <label className="field">
                  <span>Total</span>
                  <input className="input" type="number" readOnly value={totalCredits(activeForm)} />
                </label>
              </div>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea className="input" rows={3} placeholder="Optional description"
                value={activeForm.description}
                onChange={(e) => setActiveForm({ ...activeForm, description: e.target.value })} />
            </label>
            <div className="create-resource__submit">
              {editing ? (
                <>
                  <button className="btn btn--primary btn--sm" type="button" onClick={saveEdit} disabled={busy}>
                    {busy ? 'Saving...' : (<><Icon name="check" size={13} /> Save</>)}
                  </button>{' '}
                  <button className="btn btn--ghost btn--sm" type="button" onClick={cancelEdit} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
                  {busy ? 'Saving...' : (<><Icon name="plus" size={13} /> Add</>)}
                </button>
              )}
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
                  <div key={c.id} className={`resource-card ${isActive(c) ? '' : 'resource-card--archived'}`} onDoubleClick={() => startEdit(c)} title="Double-click to edit">
                    <div className="resource-card__body">
                      <h4>{c.code} — {c.title}</h4>
                      {c.description && <p>{c.description}</p>}
                      <div className="resource-card__meta">
                        <span className={`status-badge status-badge--${isActive(c) ? 'active' : 'archived'}`}>{isActive(c) ? 'Active' : 'Archived'}</span>
                        <span>{curriculumLabel(c.curriculum_id)}</span>
                        <span>{c.credit_lecture ?? 0} lec / {c.credit_laboratory ?? 0} lab</span>
                        <span>{instructorLabelOf(c.instructor_id) || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="resource-card__actions">
                      <select
                        className="input input--sm"
                        style={{ maxWidth: 160 }}
                        value={instructorIdOf(c.instructor_id)}
                        onChange={(e) => handleAssign(c.id, e.target.value)}
                        disabled={busy || !!editId || assignBusyId === c.id}
                        aria-label={`Assign instructor for ${c.code}`}
                      >
                        <option value="">Unassigned</option>
                        {faculty.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email} ({u.role})
                          </option>
                        ))}
                      </select>
                      <button className="btn btn--ghost btn--sm" onClick={() => onViewSubject?.(c.id)} disabled={!!editId} aria-label={`View ${c.code}`} title="View"><Icon name="eye" size={13} /></button>
                      <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)} disabled={busy || !!editId} aria-label={`Edit ${c.code}`} title="Edit"><Icon name="edit" size={13} /></button>
                      <button className={`btn btn--sm ${isActive(c) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleToggleStatus(c)} disabled={busy || !!editId} aria-label={isActive(c) ? `Archive ${c.code}` : `Restore ${c.code}`} title={isActive(c) ? 'Archive' : 'Restore'}>
                        <Icon name={isActive(c) ? 'archive' : 'restore'} size={13} />
                      </button>
                      {!isActive(c) && !hideDelete && (
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(c.id)} disabled={busy || !!editId} style={{ marginLeft: 'auto' }} aria-label={`Delete ${c.code}`} title="Delete"><Icon name="trash" size={13} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="program-grid" style={{ marginTop: 14 }}>
                {visible.map((c) => (
                  <div key={c.id} className="program-card--2026 card-enter" data-status={isActive(c) ? 'active' : 'archived'} onDoubleClick={() => startEdit(c)} title="Double-click to edit">
                    <div className="program-card__top">
                      <span className="program-card__code">{c.code}</span>
                      <span className={`program-card__status ${isActive(c) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                        <span className="program-card__status-dot" />{isActive(c) ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    <h3 className="program-card__name">{c.title}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', gap: 6 }}><span style={{ fontWeight: 700, color: '#64748b' }}>Curriculum:</span><span style={{ color: '#0f172a' }}>{curriculumLabel(c.curriculum_id)}</span></div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#64748b' }}>Instructor:</span>
                        <select
                          className="input input--sm"
                          style={{ flex: 1, minWidth: 0 }}
                          value={instructorIdOf(c.instructor_id)}
                          onChange={(e) => handleAssign(c.id, e.target.value)}
                          disabled={busy || !!editId || assignBusyId === c.id}
                          aria-label={`Assign instructor for ${c.code}`}
                        >
                          <option value="">Unassigned</option>
                          {faculty.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name || u.email} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <span style={{ color: '#475569' }}><strong style={{ color: '#64748b' }}>Pre-req:</strong> {c.prerequisite || 'N/A'}</span>
                        <span style={{ color: '#475569' }}><strong style={{ color: '#64748b' }}>Co-req:</strong> {c.corequisite || 'N/A'}</span>
                      </div>
                      <div style={{ color: '#475569' }}><strong style={{ color: '#64748b' }}>Credits:</strong> {c.credit_lecture ?? 0} lec / {c.credit_laboratory ?? 0} lab / {c.units ?? 0} total</div>
                    </div>
                    <p className="program-card__desc">{c.description || 'No description.'}</p>
                    <div className="program-card__actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => onViewSubject?.(c.id)} disabled={!!editId} aria-label={`View ${c.code}`} title="View"><Icon name="eye" size={13} /></button>
                      <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)} disabled={busy || !!editId} aria-label={`Edit ${c.code}`} title="Edit"><Icon name="edit" size={13} /></button>
                      <button className={`btn btn--sm ${isActive(c) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleToggleStatus(c)} disabled={busy || !!editId} aria-label={isActive(c) ? `Archive ${c.code}` : `Restore ${c.code}`} title={isActive(c) ? 'Archive' : 'Restore'}>
                        <Icon name={isActive(c) ? 'archive' : 'restore'} size={13} />
                      </button>
                      {!isActive(c) && !hideDelete && (
                        <button className="btn btn--danger btn--sm" onClick={() => handleDelete(c.id)} disabled={busy || !!editId} style={{ marginLeft: 'auto' }} aria-label={`Delete ${c.code}`} title="Delete"><Icon name="trash" size={13} /></button>
                      )}
                    </div>
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
// Admin Course page: manages courses linked to a program. Pick a program and
// curriculum, then create / edit / delete the courses inside it. Courses can
// reference a prerequisite and corequisite from the same program, and credits
// are split into lecture + laboratory (total is computed automatically).

import { useState, useEffect, useCallback } from 'react'
import {
  fetchPrograms,
  fetchResources,
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  addActivityLog,
} from '../../services/database'
import type { Program, Resource, Course } from '../../services/database'

interface CourseProps {
  profile?: { email?: string | null } | null
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

export default function Course({ profile }: CourseProps) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [curriculums, setCurriculums] = useState<Resource[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [programId, setProgramId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState<CourseForm>(blank)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CourseForm>(blank)

  const userEmail = profile?.email ?? 'unknown'

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
      setCurriculums(res.filter((r) => r.status !== 'archived' && (r.code || r.title)))
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

  const visible = courses.filter((c) =>
    typeof c.program_id === 'object' ? c.program_id.id === programId : c.program_id === programId,
  )

  const programCourses = visible.filter((c) => c.id !== editId)

  const pickPrereq = (code: string) => {
    if (!code) return
    setActiveForm((current: CourseForm) => ({ ...current, prereq: code }))
  }

  const pickCoreq = (code: string) => {
    if (!code) return
    setActiveForm((current: CourseForm) => ({ ...current, coreq: code }))
  }

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
      await addActivityLog(userEmail, 'course.created')
      setMessage('Course created.')
      setForm(blank)
      load()
    } catch (err) {
      setError('Failed to create course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (item: Course) => {
    setEditId(item.id)
    const pid = typeof item.program_id === 'object' ? item.program_id.id : item.program_id
    setProgramId(pid)
    setEditForm({
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
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await updateCourse(editId, buildPayload(editForm))
      await addActivityLog(userEmail, 'course.updated')
      setMessage('Course updated.')
      setEditId(null)
      setEditForm(blank)
      load()
    } catch (err) {
      setError('Failed to update course: ' + errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditForm(blank)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course permanently?')) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await deleteCourse(id)
      await addActivityLog(userEmail, 'course.deleted')
      setMessage('Course deleted.')
      load()
    } catch (err) {
      setError('Failed to delete course: ' + errMsg(err))
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
      <input className="input" type="number" min={0} value={activeForm[key]}
        onChange={(e) => setActiveForm({ ...activeForm, [key]: e.target.value })} />
    </label>
  )

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}
      {loading ? (
        <p>Loading courses...</p>
      ) : (
        <>
          <form className="panel create-resource" onSubmit={handleCreate}>
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
<input className="input" type="text" placeholder="e.g. IT12"
                  value={activeForm.prereqNA ? '' : activeForm.prereq}
                  onChange={(e) => setActiveForm({ ...activeForm, prereq: e.target.value })}
                  disabled={activeForm.prereqNA} />
                <select className="input" value="" onChange={(e) => pickPrereq(e.target.value)}
                  disabled={activeForm.prereqNA}>
                  <option value="">Pick…</option>
                  {programCourses.map((c) => (
                    <option key={c.id} value={c.code}>{c.code}</option>
                  ))}
                </select>
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
<input className="input" type="text" placeholder="e.g. IT13"
                  value={activeForm.coreqNA ? '' : activeForm.coreq}
                  onChange={(e) => setActiveForm({ ...activeForm, coreq: e.target.value })}
                  disabled={activeForm.coreqNA} />
                <select className="input" value="" onChange={(e) => pickCoreq(e.target.value)}
                  disabled={activeForm.coreqNA}>
                  <option value="">Pick…</option>
                  {programCourses.map((c) => (
                    <option key={c.id} value={c.code}>{c.code}</option>
                  ))}
                </select>
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
              <div className="create-resource__row">
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
                    {busy ? 'Saving...' : 'Save'}
                  </button>{' '}
                  <button className="btn btn--ghost btn--sm" type="button" onClick={cancelEdit} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
                  {busy ? 'Saving...' : 'Add'}
                </button>
              )}
            </div>
          </form>

          <div className="panel table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Title</th>
                  <th>Curriculum</th>
                  <th>Pre-req</th>
                  <th>Co-req</th>
                  <th>Credits (Lec / Lab / Total)</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={8}>No courses in this program yet.</td></tr>
                )}
                {visible.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.title}</td>
                    <td>{curriculumLabel(c.curriculum_id)}</td>
                    <td>{c.prerequisite || 'N/A'}</td>
                    <td>{c.corequisite || 'N/A'}</td>
                    <td>{c.credit_lecture ?? 0} / {c.credit_laboratory ?? 0} / {c.units ?? 0}</td>
                    <td>{c.description || '-'}</td>
                    <td>
                      <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)} disabled={busy || !!editId}>Edit</button>{' '}
                      <button className="btn btn--danger btn--sm" onClick={() => handleDelete(c.id)} disabled={busy || !!editId}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
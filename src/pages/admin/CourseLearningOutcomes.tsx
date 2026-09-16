// Admin Course Learning Outcomes: standalone CRUD for CLO records
// (admin_course_learning_outcomes table). Code + Description + Program Outcomes;
// the program-outcomes string is stored in the `title` column.

import { useState, useEffect, useCallback } from 'react'
import { useEntityCrud } from './curriculum/useEntityCrud.js'
import {
  fetchCourseLearningOutcomesStandalone,
  createCourseLearningOutcomeStandalone,
  updateCourseLearningOutcomeStandalone,
  deleteCourseLearningOutcomeStandalone,
  fetchProgramOutcomesStandalone,
  fetchCourses,
} from '../../services/database'
import type { CourseLearningOutcomeStandalone, Course } from '../../services/database'
import SuggestionInput, { type SuggestionOption } from '../../components/SuggestionInput'

const EMPTY = { code: '', course: '', description: '', programOutcomes: '' }

const toSuggestion = (i: { code: string; title: string }): SuggestionOption => ({
  value: i.code,
  label: `${i.code} - ${i.title}`.trim(),
})

export default function CourseLearningOutcomes({ userEmail }: { userEmail: string }) {
  const crud = useEntityCrud<CourseLearningOutcomeStandalone>({
    loadFn: fetchCourseLearningOutcomesStandalone,
    createFn: createCourseLearningOutcomeStandalone,
    updateFn: updateCourseLearningOutcomeStandalone,
    deleteFn: deleteCourseLearningOutcomeStandalone,
    scope: 'Course Learning Outcome',
  })
  const { items, loading, error, message, busy, handleCreate, handleUpdate, handleDelete, handleToggleStatus } = crud

  const [poSuggestions, setPoSuggestions] = useState<SuggestionOption[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [form, setForm] = useState(EMPTY)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [archived, setArchived] = useState(false)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const isActive = (i: CourseLearningOutcomeStandalone) => !i.status || i.status === 'active'
  const visible = items.filter((i) => (archived ? !isActive(i) : isActive(i)))
  const archivedCount = items.filter((i) => !isActive(i)).length

  useEffect(() => { crud.load() }, [crud.load])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [pos, crs] = await Promise.all([
          fetchProgramOutcomesStandalone(),
          fetchCourses(),
        ])
        const activePos = pos.filter((p) => !p.status || p.status === 'active')
        // Numeric PO order PO-1…PO-27 for the suggest dropdown
        activePos.sort((a, b) => {
          const n = (s: string) => { const m = s.match(/PO\D*(\d+)/i); return m ? parseInt(m[1], 10) : 9999 }
          const na = n(a.code || ''); const nb = n(b.code || '')
          return na !== nb ? na - nb : String(a.code).localeCompare(String(b.code))
        })
        const activeCourses = crs.filter((c) => !c.status || c.status === 'active')
        activeCourses.sort((a, b) => String(a.code).localeCompare(String(b.code)))
        if (!cancelled) {
          setPoSuggestions(activePos.map(toSuggestion))
          setCourses(activeCourses)
        }
      } catch {
        // suggestions are optional; leave the list empty on failure
      }
    })()
    return () => { cancelled = true }
  }, [])

  const outPayload = (f: typeof EMPTY) => ({
    code: f.code.trim(),
    course: f.course.trim(),
    title: f.programOutcomes.trim(),
    description: f.description.trim() || null,
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await handleCreate(outPayload(form), 'clo.created')) setForm(EMPTY)
  }

  const startEdit = (i: CourseLearningOutcomeStandalone) => {
    setEditingId(i.id)
    setEditForm({ code: i.code, course: i.course || '', description: i.description || '', programOutcomes: i.title || '' })
  }

  const saveEdit = async () => {
    if (await handleUpdate(editingId, outPayload(editForm), 'clo.updated')) setEditingId(null)
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={submit}>
        <h3>New Course Learning Outcome</h3>
        <label className="field">
          <span>Course (Subject Code)</span>
          <select className="input input--sm" value={form.course}
            onChange={(e) => setForm({ ...form, course: e.target.value })} required>
            <option value="">— Select course —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>{c.code} — {c.title}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>CLO Code</span>
          <input className="input input--sm" type="text" placeholder="e.g. CLO-1" value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea className="input input--sm" rows={2} placeholder="e.g. Compare and contrast..." ref={autoResize}
            value={form.description}
            onChange={(e) => { setForm({ ...form, description: e.target.value }); autoResize(e.target) }} />
        </label>
        <label className="field">
          <span>Program Outcomes</span>
          <SuggestionInput
            value={form.programOutcomes}
            onChange={(v) => setForm({ ...form, programOutcomes: v })}
            options={poSuggestions}
            placeholder="Type to search POs"
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Add'}</button>
        </div>
      </form>

      {loading ? (
        <p>Loading course learning outcomes...</p>
      ) : (
        <div className="panel table-wrap">
          <div className="sd-tabs">
            <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
            <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
          <table className="table">
            <thead><tr><th>Course (Subject Code)</th><th>Code</th><th>Description</th><th>Program Outcomes</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={6}>No course learning outcomes yet.</td></tr>}
              {visible.map((item) => (
                <tr key={item.id} className={!isActive(item) ? 'sd-archived' : ''}>
                  {editingId === item.id ? (
                    <>
                      <td>
                        <select className="input input--sm" value={editForm.course} onChange={(e) => setEditForm({ ...editForm, course: e.target.value })}>
                          <option value="">— Select course —</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.code}>{c.code} — {c.title}</option>
                          ))}
                        </select>
                      </td>
                      <td><input className="input input--sm" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></td>
                      <td><textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.description}
                        onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} /></td>
                      <td>
                        <SuggestionInput
                          value={editForm.programOutcomes}
                          onChange={(v) => setEditForm({ ...editForm, programOutcomes: v })}
                          options={poSuggestions}
                          placeholder="Type to search POs"
                        />
                      </td>
                      <td></td>
                      <td>
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>{' '}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{item.course || '—'}</strong></td>
                      <td><strong>{item.code}</strong></td>
                      <td>{item.description || '—'}</td>
                      <td>{item.title || '—'}</td>
                      <td>
                        <span className={`sd-status-badge ${isActive(item) ? 'sd-status-badge--active' : 'sd-status-badge--archived'}`}>
                          {isActive(item) ? 'active' : 'archived'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId}>Edit</button>{' '}
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--danger' : 'btn--ghost'}`}
                          onClick={() => handleUpdate(item.id, { status: isActive(item) ? 'archived' : 'active' }, 'clo.updated')} disabled={busy || !!editingId}>
                          {isActive(item) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(item) && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'clo.deleted')} disabled={busy || !!editingId}>Delete</button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

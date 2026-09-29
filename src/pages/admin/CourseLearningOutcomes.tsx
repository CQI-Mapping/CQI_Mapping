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
  const [query, setQuery] = useState('')

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const isActive = (i: CourseLearningOutcomeStandalone) => !i.status || i.status === 'active'
  const q = query.trim().toLowerCase()
  const visible = items
    .filter((i) => (archived ? !isActive(i) : isActive(i)))
    .filter((i) => !q || [i.course, i.code, i.description, i.title].some((v) => (v || '').toLowerCase().includes(q)))
  const archivedCount = items.filter((i) => !isActive(i)).length

  useEffect(() => { crud.load() }, [crud.load])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pos = (await fetchProgramOutcomesStandalone()).filter((p) => !p.status || p.status === 'active')
        // Numeric PO order PO-1…PO-27 for the suggest dropdown
        pos.sort((a, b) => {
          const n = (s: string) => { const m = s.match(/PO\D*(\d+)/i); return m ? parseInt(m[1], 10) : 9999 }
          const na = n(a.code || ''); const nb = n(b.code || '')
          return na !== nb ? na - nb : String(a.code).localeCompare(String(b.code))
        })
        if (!cancelled) setPoSuggestions(pos.map(toSuggestion))
      } catch {
        // suggestions are optional; leave the list empty on failure
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cs = await fetchCourses()
        // Only active courses, sorted by code for dropdown
        const active = cs.filter((c) => !c.status || c.status === 'active')
        active.sort((a, b) => String(a.code).localeCompare(String(b.code)))
        if (!cancelled) setCourses(active)
      } catch {
        // course list optional; leave empty on failure
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

  const totalCount = items.length
  const activeCount = items.filter(isActive).length

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">CLO</div>
          <div className="program-hero__titles">
            <h2>Course Learning Outcomes</h2>
            <p>Define CLOs per subject code and align them to Program Outcomes.</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{totalCount}</div>
          <div className="program-stat__sub">All CLOs</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Active</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="program-stat__sub">Currently mapped</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Archived</div>
          <div className="program-stat__value" style={{ color: '#64748b' }}>{archivedCount}</div>
          <div className="program-stat__sub">Hidden</div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {message && <p className="msg msg--success" role="status">{message}</p>}

      <form className="panel create-resource" onSubmit={submit} style={{ borderTop: '3px solid #16a34a' }}>
        <h3>New Course Learning Outcome</h3>
        <label className="field">
          <span>Course (Subject Code)</span>
          <select className="input input--sm" value={form.course}
            onChange={(e) => setForm({ ...form, course: e.target.value })} required>
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>{c.code}</option>
            ))}
            {courses.length === 0 && <option value="" disabled>No courses available — create one in Course page first</option>}
            {/* Preserve legacy/manual value if not in list so editing old rows doesn't blank out */}
            {form.course && !courses.some((c) => c.code === form.course) && (
              <option value={form.course}>{form.course} (legacy)</option>
            )}
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
        <div className="program-grid" style={{ marginTop: 8 }}>
          {[0,1,2].map((i)=> (
            <div key={i} className="program-card--2026" style={{ opacity: 0.6 }}>
              <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '40%' }} />
              <div style={{ height: 16, background: '#f1f5f9', borderRadius: 6 }} />
              <div style={{ height: 40, background: '#f8fafc', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="program-panel">
          <div className="program-toolbar">
            <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
              <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
              <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
                Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
              </button>
            </div>
            <label className="program-search" aria-label="Search CLOs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20L15.5 15.5"/></svg>
              <input className="input input--sm" type="search" placeholder="Search CLOs..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          {visible.length === 0 ? (
            <div className="program-empty" style={{ marginTop: 14 }}>
              <strong>No course learning outcomes yet.</strong>
              <span>{query ? `No results for "${query}"` : 'Add your first CLO above.'}</span>
            </div>
          ) : (
            <div className="program-grid" style={{ marginTop: 14 }}>
              {visible.map((item) => (
                <div key={item.id} className="program-card--2026 card-enter" data-status={isActive(item) ? 'active' : 'archived'}>
                  {editingId === item.id ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <select className="input input--sm" value={editForm.course} onChange={(e) => setEditForm({ ...editForm, course: e.target.value })}>
                          <option value="">Select course</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.code}>{c.code}</option>
                          ))}
                          {editForm.course && !courses.some((c) => c.code === editForm.course) && (
                            <option value={editForm.course}>{editForm.course} (legacy)</option>
                          )}
                        </select>
                        <input className="input input--sm" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} placeholder="CLO Code" />
                      </div>
                      <textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.description} onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} placeholder="Description" />
                      <SuggestionInput value={editForm.programOutcomes} onChange={(v) => setEditForm({ ...editForm, programOutcomes: v })} options={poSuggestions} placeholder="Type to search POs" />
                      <div className="program-card__actions">
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}>Save</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="program-card__top">
                        <span className="program-card__code">{item.code}</span>
                        <span className="program-card__status" style={{ background: '#f1f5f9', color: '#64748b', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>{item.course || '—'}</span>
                        <span className={`program-card__status ${isActive(item) ? 'program-card__status--active' : 'program-card__status--archived'}`}>
                          <span className="program-card__status-dot" />{isActive(item) ? 'Active' : 'Archived'}
                        </span>
                      </div>
                      <p className="program-card__desc">{item.description || 'No description.'}</p>
                      <div style={{ fontSize: 12.5, background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px', color: '#475569' }}>
                        <strong style={{ color: '#64748b' }}>POs:</strong> {item.title || '—'}
                      </div>
                      <div className="program-card__actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId}>Edit</button>
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleUpdate(item.id, { status: isActive(item) ? 'archived' : 'active' }, 'clo.updated')} disabled={busy || !!editingId}>
                          {isActive(item) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(item) && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'clo.deleted')} disabled={busy || !!editingId} style={{ marginLeft: 'auto' }}>Delete</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

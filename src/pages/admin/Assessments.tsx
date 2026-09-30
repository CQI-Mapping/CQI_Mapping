// Assessments — faculty single-save for Assessment Monitoring.
// Faculty (user role): pick Course -> CLO, enter Title/Term/Type/Max + aggregated
// results (total/passed/avg) in ONE save. Standardized Title/Term per course fixes
// multi-section variance (CQI V1 1.2). Attainment% = avg/max*100 feeds Attainment page.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchCourses,
  fetchCourseLearningOutcomes,
  fetchAssessmentsWithResults,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  upsertAssessmentResult,
  addActivityLog,
  calcAttainment,
} from '../../services/database'
import type { Course, CourseLearningOutcome, AssessmentWithResult } from '../../services/database'

interface AssessmentsProps {
  profile?: { email?: string | null; id?: string } | null
  hideDelete?: boolean
}

const EMPTY = {
  courseId: '',
  cloId: '',
  title: '',
  type: 'Enabling',
  term: 'Midterm',
  maxScore: '100',
  weight: '',
  method: 'direct',
  deadline: '',
  total: '35',
  passed: '',
  avg: '',
}

function attainmentColor(pct: number | null): string {
  if (pct == null) return '#64748b'
  if (pct >= 70) return '#16a34a'
  if (pct >= 50) return '#ca8a04'
  return '#dc2626'
}

export default function Assessments({ hideDelete }: AssessmentsProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [clos, setClos] = useState<CourseLearningOutcome[]>([])
  const [items, setItems] = useState<AssessmentWithResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [filterCourse, setFilterCourse] = useState('')
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [editingResults, setEditingResults] = useState<string | null>(null)
  const [resultForm, setResultForm] = useState({ total: '', passed: '', avg: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cs, list] = await Promise.all([
        fetchCourses(),
        fetchAssessmentsWithResults(filterCourse || null),
      ])
      setCourses(cs.filter((c) => !c.status || c.status === 'active'))
      setItems(list)
    } catch (e) {
      setError('Unable to load assessments: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [filterCourse])

  useEffect(() => { load() }, [load])

  // Load CLOs for selected course in the create form
  useEffect(() => {
    let cancelled = false
    if (!form.courseId) { setClos([]); return }
    fetchCourseLearningOutcomes(null)
      .then((all) => {
        if (cancelled) return
        // course_learning_outcomes has course_id; filter client-side
        setClos(all.filter((c) => c.course_id === form.courseId))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.courseId])

  const isActive = (i: AssessmentWithResult) => !i.status || i.status === 'active'
  const q = query.trim().toLowerCase()
  const visible = items
    .filter((i) => (archived ? !isActive(i) : isActive(i)))
    .filter((i) => !q || [i.title, i.type, i.term, i.method].some((v) => (v || '').toLowerCase().includes(q)))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!form.courseId || !form.cloId || !form.title.trim()) {
      setError('Course, CLO and Title are required.')
      return
    }
    const max = Number(form.maxScore)
    if (!max || max <= 0) { setError('Max score must be greater than 0.'); return }
    setBusy(true)
    try {
      const created = await createAssessment({
        course_id: form.courseId,
        clo_id: form.cloId,
        title: form.title.trim(),
        type: form.type as AssessmentWithResult['type'],
        term: form.term as AssessmentWithResult['term'],
        max_score: max,
        weight: form.weight ? Number(form.weight) : null,
        method: form.method as AssessmentWithResult['method'],
        deadline: form.deadline || null,
      })
      // Single-save: attach aggregated result if provided
      if (form.total || form.passed || form.avg) {
        await upsertAssessmentResult(
          created.id,
          Number(form.total) || 0,
          Number(form.passed) || 0,
          Number(form.avg) || 0
        )
      }
      await addActivityLog('assessment.created')
      setMessage('Assessment saved.')
      setForm({ ...EMPTY, courseId: form.courseId })
      load()
    } catch (err) {
      setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const saveResults = async (id: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await upsertAssessmentResult(id, Number(resultForm.total) || 0, Number(resultForm.passed) || 0, Number(resultForm.avg) || 0)
      await addActivityLog('assessment.results_updated')
      setMessage('Results updated.')
      setEditingResults(null)
      load()
    } catch (err) {
      setError('Failed to update results: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async (item: AssessmentWithResult) => {
    try {
      await updateAssessment(item.id, { status: isActive(item) ? 'archived' : 'active' })
      await addActivityLog('assessment.updated')
      load()
    } catch (err) {
      setError('Failed to update status: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this assessment permanently?')) return
    try {
      await deleteAssessment(id)
      await addActivityLog('assessment.deleted')
      setMessage('Assessment deleted.')
      load()
    } catch (err) {
      setError('Failed to delete: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const courseCode = (id: string) => courses.find((c) => c.id === id)?.code ?? id.slice(0, 8)

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">A</div>
          <div className="program-hero__titles">
            <h2>Assessments</h2>
            <p>Faculty single-save: define per CLO + enter aggregated results. Feeds Attainment.</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{items.length}</div>
          <div className="program-stat__sub">Assessments</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">With results</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{items.filter((i) => i.result).length}</div>
          <div className="program-stat__sub">Have scores</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Avg attainment</div>
          <div className="program-stat__value" style={{ color: '#15803d' }}>
            {(() => {
              const vals = items.map((i) => i.attainment_pct).filter((v): v is number => v != null)
              return vals.length ? (Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10) + '%' : '—'
            })()}
          </div>
          <div className="program-stat__sub">Across list</div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {message && <p className="msg msg--success" role="status">{message}</p>}

      <form className="panel create-resource" onSubmit={submit} style={{ borderTop: '3px solid #16a34a' }}>
        <h3>New Assessment (single-save with results)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label className="field">
            <span>Course*</span>
            <select className="input input--sm" value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value, cloId: '' })} required>
              <option value="">Select course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span>CLO*</span>
            <select className="input input--sm" value={form.cloId}
              onChange={(e) => setForm({ ...form, cloId: e.target.value })} required disabled={!form.courseId}>
              <option value="">{form.courseId ? 'Select CLO' : 'Pick course first'}</option>
              {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Title* e.g. Activity 4-Fetch API</span>
            <input className="input input--sm" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Midterm Assessment" />
          </label>
          <label className="field">
            <span>Type</span>
            <select className="input input--sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Enabling</option>
              <option>Summative</option>
              <option>Culminating</option>
            </select>
          </label>
          <label className="field">
            <span>Term</span>
            <select className="input input--sm" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
              <option>Prelim</option>
              <option>Midterm</option>
              <option>Finals</option>
            </select>
          </label>
          <label className="field">
            <span>Method</span>
            <select className="input input--sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="direct">direct</option>
              <option value="indirect">indirect</option>
            </select>
          </label>
          <label className="field">
            <span>Max score*</span>
            <input className="input input--sm" type="number" min={1} value={form.maxScore}
              onChange={(e) => setForm({ ...form, maxScore: e.target.value })} required />
          </label>
          <label className="field">
            <span>Weight % (30/35/35)</span>
            <input className="input input--sm" type="number" min={0} max={100} value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="20" />
          </label>
          <label className="field">
            <span>Students total</span>
            <input className="input input--sm" type="number" min={0} value={form.total}
              onChange={(e) => setForm({ ...form, total: e.target.value })} />
          </label>
          <label className="field">
            <span>Students passed</span>
            <input className="input input--sm" type="number" min={0} value={form.passed}
              onChange={(e) => setForm({ ...form, passed: e.target.value })} />
          </label>
          <label className="field">
            <span>Avg score</span>
            <input className="input input--sm" type="number" min={0} step="0.1" value={form.avg}
              onChange={(e) => setForm({ ...form, avg: e.target.value })} />
          </label>
          <label className="field">
            <span>Deadline</span>
            <input className="input input--sm" type="date" value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </label>
        </div>
        {form.avg && form.maxScore && (
          <p style={{ fontSize: 12, color: '#475569' }}>
            Preview attainment: <strong style={{ color: attainmentColor(calcAttainment(Number(form.avg), Number(form.maxScore))) }}>
              {calcAttainment(Number(form.avg), Number(form.maxScore)) ?? '—'}%
            </strong>
          </p>
        )}
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save assessment + results'}</button>
        </div>
      </form>

      <div className="program-panel">
        <div className="program-toolbar">
          <div className="sd-tabs" style={{ marginBottom: 0 }}>
            <button type="button" className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
            <button type="button" className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>Archive</button>
          </div>
          <select className="input input--sm" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)} aria-label="Filter by course">
            <option value="">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
          <label className="program-search" aria-label="Search assessments">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20L15.5 15.5" /></svg>
            <input className="input input--sm" type="search" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {loading ? (
          <p>Loading assessments...</p>
        ) : visible.length === 0 ? (
          <div className="program-empty" style={{ marginTop: 14 }}>
            <strong>No assessments yet.</strong>
            <span>{query ? `No results for "${query}"` : 'Add your first assessment above (e.g. IT21 Activity 4-Fetch API).'}</span>
          </div>
        ) : (
          <div className="program-grid" style={{ marginTop: 14 }}>
            {visible.map((item) => (
              <div key={item.id} className="program-card--2026 card-enter">
                <div className="program-card__top">
                  <span className="program-card__code">{courseCode(item.course_id)}</span>
                  <span className="program-card__status" style={{ background: '#f1f5f9', color: '#475569', fontSize: 11, padding: '3px 8px', borderRadius: 999 }}>
                    {item.type} · {item.term} · {item.method}
                  </span>
                  <span className="program-card__status" style={{ background: '#f8fafc', color: attainmentColor(item.attainment_pct), fontWeight: 800, fontSize: 12 }}>
                    {item.attainment_pct != null ? `${item.attainment_pct}%` : 'no scores'}
                  </span>
                </div>
                <strong style={{ fontSize: 13 }}>{item.title}</strong>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  max {item.max_score}{item.weight != null ? ` · weight ${item.weight}%` : ''} ·{' '}
                  {item.result ? `${item.result.students_passed}/${item.result.students_total} passed · avg ${item.result.avg_score}` : 'no results yet'}
                  {item.deadline ? ` · due ${item.deadline}` : ''}
                </div>
                {editingResults === item.id ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                    <input className="input input--sm" type="number" min={0} placeholder="Total" value={resultForm.total}
                      onChange={(e) => setResultForm({ ...resultForm, total: e.target.value })} />
                    <input className="input input--sm" type="number" min={0} placeholder="Passed" value={resultForm.passed}
                      onChange={(e) => setResultForm({ ...resultForm, passed: e.target.value })} />
                    <input className="input input--sm" type="number" min={0} step="0.1" placeholder="Avg" value={resultForm.avg}
                      onChange={(e) => setResultForm({ ...resultForm, avg: e.target.value })} />
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                      <button className="btn btn--primary btn--sm" onClick={() => saveResults(item.id)} disabled={busy}>Save</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditingResults(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="program-card__actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => {
                      setEditingResults(item.id)
                      setResultForm({
                        total: String(item.result?.students_total ?? ''),
                        passed: String(item.result?.students_passed ?? ''),
                        avg: String(item.result?.avg_score ?? ''),
                      })
                    }}>Results</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => toggleStatus(item)}>
                      {isActive(item) ? 'Archive' : 'Restore'}
                    </button>
                    {!hideDelete && !isActive(item) && (
                      <button className="btn btn--danger btn--sm" style={{ marginLeft: 'auto' }} onClick={() => remove(item.id)}>Delete</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

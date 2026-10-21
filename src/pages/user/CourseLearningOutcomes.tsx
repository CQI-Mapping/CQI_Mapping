// User Course Learning Outcomes: standalone CRUD for CLO records
// (admin_course_learning_outcomes table). Code + Description + Program Outcomes;
// the program-outcomes string is stored in the `title` column.
// Owned by the `user` role — the admin no longer has this page.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useEntityCrud } from '../admin/curriculum/useEntityCrud.js'
import { useViewMode } from '../../hooks/useViewMode'
import ViewModeToggle from '../../components/ViewModeToggle'
import Icon from '../../components/icons'
import {
  fetchCourseLearningOutcomesStandalone,
  createCourseLearningOutcomeStandalone,
  updateCourseLearningOutcomeStandalone,
  deleteCourseLearningOutcomeStandalone,
  fetchProgramOutcomesStandalone,
  fetchProgramEducationalObjectives,
  fetchStrategicGoals,
  fetchChedMemoOrders,
  fetchPoFeedback,
  recordPoFeedback,
  fetchCourses,
} from '../../services/database'
import type { CourseLearningOutcomeStandalone, Course, PoFeedback } from '../../services/database'
import SuggestionInput, { type SuggestionOption } from '../../components/SuggestionInput'
import { rankClosestPos, type PoText, type RankedPo } from '../../utils/poMatch'
import { rankSemantic } from '../../utils/poSemantic'
import { fuseRanked, toRelative } from '../../utils/poRank'
import { pickedBefore, recordPick, recordRejection, draftSig } from '../../utils/poMemory'
import CloViewModal from '../../components/CloViewModal'

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
  const [poTexts, setPoTexts] = useState<PoText[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [form, setForm] = useState(EMPTY)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  // List (default) or grid card style — the user decides per browser.
  const [viewMode, setViewMode] = useViewMode('cqi.viewMode.clo')
  // Bumps to re-render fused lists after local reject/memory writes.
  const [memTick, setMemTick] = useState(0)
  // Read-only details: the card's eye button opens this record in a modal.
  const [viewItem, setViewItem] = useState<CourseLearningOutcomeStandalone | null>(null)
  // Auto-fill guards: draft text already auto-applied (or dismissed) per form.
  const autoCreateFor = useRef<string | null>(null)
  const autoEditFor = useRef<string | null>(null)
  // Shared pick/reject log for curation (manager/admin readable; null = hidden).
  const [feedback, setFeedback] = useState<PoFeedback[] | null>(null)
  // Semantic (TensorFlow USE) re-rank, frontend-only. Null = not loaded / failed.
  const [createSemantic, setCreateSemantic] = useState<RankedPo[] | null>(null)
  const [editSemantic, setEditSemantic] = useState<RankedPo[] | null>(null)

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
        const [pos, peos, sgs, cmos] = await Promise.all([
          fetchProgramOutcomesStandalone(),
          fetchProgramEducationalObjectives().catch(() => []),
          fetchStrategicGoals().catch(() => []),
          fetchChedMemoOrders().catch(() => []),
        ])
        const active = pos.filter((p) => !p.status || p.status === 'active')
        // Numeric PO order PO-1…PO-27 for the suggest dropdown
        active.sort((a, b) => {
          const n = (s: string) => { const m = s.match(/PO\D*(\d+)/i); return m ? parseInt(m[1], 10) : 9999 }
          const na = n(a.code || ''); const nb = n(b.code || '')
          return na !== nb ? na - nb : String(a.code).localeCompare(String(b.code))
        })
        // Enrich thin POs with linked PEO/SG/CMO text so they can still match.
        const peoByCode = new Map(peos.map((p) => [p.code.trim().toLowerCase(), p.title ?? '']))
        const sgByCode = new Map(sgs.map((s) => [s.code.trim().toLowerCase(), s.description ?? '']))
        const cmoById = new Map(cmos.map((c) => [c.id, `${c.title ?? ''} ${c.code ?? ''}`.trim()]))
        const splitCodes = (v: string | null) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (!cancelled) setPoSuggestions(active.map(toSuggestion))
        if (!cancelled) setPoTexts(active.map((p) => {
          const rec = p as { description?: string | null; cmo_id?: string | null; peo_text?: string | null; sg_text?: string | null }
          const peoTitles = splitCodes(rec.peo_text ?? null).map((c) => peoByCode.get(c.toLowerCase()) ?? '').filter(Boolean)
          const sgDescs = splitCodes(rec.sg_text ?? null).map((c) => sgByCode.get(c.toLowerCase()) ?? '').filter(Boolean)
          const cmoText = (rec.cmo_id && cmoById.get(rec.cmo_id)) || ''
          const extra = [...peoTitles, ...sgDescs, cmoText].filter(Boolean).join(' | ') || null
          return { code: p.code, title: p.title, description: rec.description ?? null, extra }
        }))
      } catch {
        // suggestions are optional; leave the list empty on failure
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchPoFeedback()
      .then((rows) => { if (!cancelled) setFeedback(rows) })
      .catch(() => { if (!cancelled) setFeedback(null) })
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
    if (await handleCreate(outPayload(form), 'clo.created', { code: form.code.trim(), course: form.course.trim() })) {
      setForm(EMPTY)
      autoCreateFor.current = null
    }
  }

  const startEdit = (i: CourseLearningOutcomeStandalone) => {
    setEditingId(i.id)
    autoEditFor.current = null
    setEditForm({ code: i.code, course: i.course || '', description: i.description || '', programOutcomes: i.title || '' })
  }

  const saveEdit = async () => {
    const target = editingId ? items.find((i) => i.id === editingId) : undefined
    if (await handleUpdate(editingId, outPayload(editForm), 'clo.updated', target)) setEditingId(null)
  }

  // Bulk align: fused top-1 for visible filtered CLOs with empty PO.
  const bulkTargets = visible.filter((i) => !(i.title ?? '').trim() && (i.description ?? '').trim())
    .map((i) => {
      const [top] = fuseRanked(i.description ?? '', rankClosestPos(i.description ?? '', poTexts, Math.max(1, poTexts.length)), null, poTexts, 1)
      return { item: i, top }
    })
    .filter((t) => t.top && t.top.score > 0)

  const bulkApply = async () => {
    if (bulkTargets.length === 0 || bulkBusy || editingId !== null) return
    if (!window.confirm(`Apply top suggestion to ${bulkTargets.length} empty CLO${bulkTargets.length === 1 ? '' : 's'}?`)) return
    setBulkBusy(true)
    try {
      for (const t of bulkTargets) {
        await handleUpdate(t.item.id, { title: t.top.code }, 'clo.updated', t.item)
      }
    } finally {
      setBulkBusy(false)
    }
  }

  // Shared + local pick/reject logging for curation (fire-and-forget server).
  const logPick = (draft: string, code: string) => {
    recordPick(draft, code)
    const sig = draftSig(draft)
    if (sig) void recordPoFeedback(sig, code, 'picked')
    setMemTick((t) => t + 1)
  }
  const logReject = (draft: string, code: string) => {
    recordRejection(draft, code)
    const sig = draftSig(draft)
    if (sig) void recordPoFeedback(sig, code, 'rejected')
    setMemTick((t) => t + 1)
  }

  // Closest-PO suggestions: rank POs by word overlap with the typed description.
  // Clicking a suggestion appends its code to the Program Outcomes field.
  const appendPo = (current: string, code: string) => {
    const parts = current.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.some((p) => p.toLowerCase() === code.toLowerCase())) parts.push(code)
    return parts.join(', ')
  }

  const createClosest = rankClosestPos(form.description, poTexts, Math.max(3, poTexts.length))
  const editClosest = rankClosestPos(editForm.description, poTexts, Math.max(3, poTexts.length))
  // Hybrid fusion: keyword + semantic + exact-phrase + Bloom + click memory.
  // memTick re-runs fusion after local reject/memory writes (read sync).
  void memTick
  const createShown = fuseRanked(form.description, createClosest, createSemantic, poTexts, 3)
  const editShown = fuseRanked(editForm.description, editClosest, editSemantic, poTexts, 3)
  // Relative display only (top raw > 0 shows 100%). All gates read raw lists.
  const createDisplay = toRelative(createShown)
  const editDisplay = toRelative(editShown)

  // Debounced semantic re-rank for the create-form description.
  useEffect(() => {
    const draft = form.description.trim()
    if (draft.length < 4 || poTexts.length === 0) { setCreateSemantic(null); return }
    let cancelled = false
    const t = setTimeout(() => {
      rankSemantic(draft, poTexts, 3).then((res) => {
        if (cancelled) return
        setCreateSemantic(res && res.ranked.length > 0 ? res.ranked : null)
      })
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form.description, poTexts])

  // Debounced semantic re-rank for the edit-form description.
  useEffect(() => {
    const draft = editForm.description.trim()
    if (editingId === null || draft.length < 4 || poTexts.length === 0) { setEditSemantic(null); return }
    let cancelled = false
    const t = setTimeout(() => {
      rankSemantic(draft, poTexts, 3).then((res) => {
        if (cancelled) return
        setEditSemantic(res && res.ranked.length > 0 ? res.ranked : null)
      })
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [editForm.description, poTexts, editingId])

  // Top-1 auto-fill: score ≥85 with a ≥20 gap over #2 auto-fills an empty PO
  // field once per draft, with an Undo chip to revert.
  const autoFillGap = (shown: RankedPo[]) =>
    shown.length <= 1 ? 100 : shown[0].score - shown[1].score
  useEffect(() => {
    const draft = form.description
    if (!draft.trim() || form.programOutcomes.trim() || autoCreateFor.current === draft) return
    if (createShown.length === 0 || createShown[0].score < 85 || autoFillGap(createShown) < 20) return
    autoCreateFor.current = draft
    setForm((f) => (f.programOutcomes.trim() ? f : { ...f, programOutcomes: createShown[0].code }))
  }, [form.description, form.programOutcomes, createShown])
  useEffect(() => {
    const draft = editForm.description
    if (editingId === null || !draft.trim() || editForm.programOutcomes.trim() || autoEditFor.current === draft) return
    if (editShown.length === 0 || editShown[0].score < 85 || autoFillGap(editShown) < 20) return
    autoEditFor.current = draft
    setEditForm((f) => (f.programOutcomes.trim() ? f : { ...f, programOutcomes: editShown[0].code }))
  }, [editForm.description, editForm.programOutcomes, editShown, editingId])

  const totalCount = items.length
  const activeCount = items.filter(isActive).length

  // Shared edit form used by both grid and list card styles.
  const renderEdit = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {editForm.course ? (
          <div className="input input--sm subject-picker__chosen">
            <span className="subject-picker__text">
              {editForm.course}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditForm((f) => ({ ...f, course: '' }))}>
              Change
            </button>
          </div>
        ) : (
          <select className="input input--sm" value={editForm.course} onChange={(e) => setEditForm({ ...editForm, course: e.target.value })}>
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>{c.code} — {c.title}</option>
            ))}
          </select>
        )}
        <input className="input input--sm" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} placeholder="CLO Code" />
      </div>
      <textarea className="input input--sm" rows={2} ref={autoResize} value={editForm.description} onChange={(e) => { setEditForm({ ...editForm, description: e.target.value }); autoResize(e.target) }} placeholder="Description" />
      <SuggestionInput value={editForm.programOutcomes} onChange={(v) => setEditForm({ ...editForm, programOutcomes: v })} options={poSuggestions} placeholder="Type to search POs" />
      {editDisplay.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
          <span style={{ fontSize: 12, color: '#64748b', width: '100%' }}>
            {editDisplay[0].raw > 0 ? 'Closest for this description:' : 'Best guesses (low confidence):'}
          </span>
          {editDisplay.map((r) => (
            <span key={r.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button type="button" className="btn btn--ghost btn--sm"
                style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 3 }}
                title={`${r.matched.length > 0 ? `${r.label} — shown ${r.shown}% (raw ${r.raw}%: ${r.matched.join(', ')})` : `${r.label} — shown ${r.shown}% (raw ${r.raw}% semantic)`}${pickedBefore(editForm.description, r.code) ? ' • picked before' : ''}`}
                onClick={() => { logPick(editForm.description, r.code); setEditForm((f) => ({ ...f, programOutcomes: appendPo(f.programOutcomes, r.code) })) }}>
                <span>{r.raw > 0 ? `${r.code} · ${r.shown}%` : `~ ${r.code}`}</span>
                <span aria-hidden="true" style={{ height: 3, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                  <span style={{
                    display: 'block', height: '100%', width: `${Math.min(100, r.shown)}%`,
                    background: r.raw >= 60 ? '#16a34a' : r.raw >= 30 ? '#d97706' : '#94a3b8',
                  }} />
                </span>
              </button>
              <button type="button" className="btn btn--ghost btn--sm" title={`Not this PO for this description`}
                aria-label={`Reject ${r.code} for this description`}
                onClick={() => logReject(editForm.description, r.code)}>✕</button>
            </span>
          ))}
        </div>
      ) : editForm.description.trim().length >= 4 && (
        <div style={{ fontSize: 12, color: '#64748b', margin: '6px 0' }}>
          {poTexts.length === 0
            ? 'No Program Outcomes yet — create one on the Program Outcomes page first.'
            : 'No close match — try words like design, develop, evaluate, or pick manually above.'}
        </div>
      )}
      {autoEditFor.current === editForm.description && editForm.programOutcomes.trim() && (
        <div style={{ fontSize: 12, color: '#15803d', margin: '6px 0' }}>
          Auto-filled {editForm.programOutcomes.trim()} —{' '}
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => {
              autoEditFor.current = `dismissed:${editForm.description}`
              setEditForm((f) => ({ ...f, programOutcomes: '' }))
            }}>
            Undo
          </button>
        </div>
      )}
                      <div className="program-card__actions">
                        <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={busy}><Icon name="check" size={13} /> Save</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
    </>
  )

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
          {/* Once a subject is chosen the picker collapses to a read-only
              summary, so only the selected course shows. "Change" reopens it. */}
          {form.course ? (
            <div className="input input--sm subject-picker__chosen">
              <span className="subject-picker__text">
                {form.course}
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm((f) => ({ ...f, course: '' }))}>
                Change
              </button>
            </div>
          ) : (
            <select className="input input--sm" value={form.course}
              onChange={(e) => setForm({ ...form, course: e.target.value })} required>
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.code}>{c.code} — {c.title}</option>
              ))}
              {courses.length === 0 && <option value="" disabled>No courses available — create one in Course page first</option>}
            </select>
          )}
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
        {createDisplay.length > 0 ? (
          <div className="field" style={{ marginTop: -4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {createDisplay[0].raw > 0
                ? 'Closest Program Outcomes for this description:'
                : 'Best guesses (low confidence) — click or pick manually:'}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {createDisplay.map((r) => (
                <span key={r.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <button type="button" className="btn btn--ghost btn--sm"
                    style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 3 }}
                    title={`${r.matched.length > 0 ? `${r.label} — shown ${r.shown}% (raw ${r.raw}%: ${r.matched.join(', ')})` : `${r.label} — shown ${r.shown}% (raw ${r.raw}% semantic)`}${pickedBefore(form.description, r.code) ? ' • picked before' : ''}`}
                    onClick={() => { logPick(form.description, r.code); setForm((f) => ({ ...f, programOutcomes: appendPo(f.programOutcomes, r.code) })) }}>
                    <span>{r.raw > 0 ? `${r.code} · ${r.shown}%` : `~ ${r.code}`}</span>
                    <span aria-hidden="true" style={{ height: 3, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                      <span style={{
                        display: 'block', height: '100%', width: `${Math.min(100, r.shown)}%`,
                        background: r.raw >= 60 ? '#16a34a' : r.raw >= 30 ? '#d97706' : '#94a3b8',
                      }} />
                    </span>
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" title={`Not this PO for this description`}
                    aria-label={`Reject ${r.code} for this description`}
                    onClick={() => logReject(form.description, r.code)}>✕</button>
                </span>
              ))}
            </div>
          </div>
        ) : form.description.trim().length >= 4 && (
          <div className="field" style={{ marginTop: -4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {poTexts.length === 0
                ? 'No Program Outcomes yet — create one on the Program Outcomes page first.'
                : 'No close match — try words like design, develop, evaluate, or pick manually above.'}
            </span>
          </div>
        )}
        {autoCreateFor.current === form.description && form.programOutcomes.trim() && (
          <div className="field" style={{ marginTop: -4 }}>
            <span style={{ fontSize: 12, color: '#15803d' }}>
              Auto-filled {form.programOutcomes.trim()} —{' '}
              <button type="button" className="btn btn--ghost btn--sm"
                onClick={() => {
                  autoCreateFor.current = `dismissed:${form.description}`
                  setForm((f) => ({ ...f, programOutcomes: '' }))
                }}>
                Undo
              </button>
            </span>
          </div>
        )}
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : (<><Icon name="plus" size={13} /> Add</>)}</button>
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
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            <label className="program-search" aria-label="Search CLOs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M20 20L15.5 15.5"/></svg>
              <input className="input input--sm" type="search" placeholder="Search CLOs..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {bulkTargets.length > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={bulkApply} disabled={busy || bulkBusy || editingId !== null}
                title="Fill each empty CLO below with its top suggestion">
                {bulkBusy ? 'Applying…' : `Apply top to ${bulkTargets.length} empty`}
              </button>
            )}
            {feedback !== null && feedback.length > 0 && (
              <details style={{ fontSize: 12, color: '#64748b' }}>
                <summary style={{ cursor: 'pointer' }}>Feedback log ({feedback.length})</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                  {feedback.slice(0, 20).map((f) => (
                    <li key={f.id}>
                      <strong>{f.verdict === 'rejected' ? '✕' : '✓'} {f.po_code}</strong> — {f.draft_sig.slice(0, 60)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {visible.length === 0 ? (
            <div className="program-empty" style={{ marginTop: 14 }}>
              <strong>No course learning outcomes yet.</strong>
              <span>{query ? `No results for "${query}"` : 'Add your first CLO above.'}</span>
            </div>
          ) : viewMode === 'list' ? (
            <div className="resource-list">
              {visible.map((item) => (
                <div key={item.id} className={`resource-card ${isActive(item) ? '' : 'resource-card--archived'}`}>
                  {editingId === item.id ? renderEdit() : (
                    <>
                      <div className="resource-card__body">
                        <h4>{item.code} — {item.course || 'No course'}</h4>
                        {item.description && <p>{item.description}</p>}
                        <div style={{ fontSize: 12.5, background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px', color: '#475569', marginTop: 6 }}>
                          <strong style={{ color: '#64748b' }}>POs:</strong> {item.title || '—'}
                        </div>
                        <div className="resource-card__meta" style={{ marginTop: 6 }}>
                          <span className={`status-badge status-badge--${isActive(item) ? 'active' : 'archived'}`}>{isActive(item) ? 'Active' : 'Archived'}</span>
                        </div>
                      </div>
                      <div className="resource-card__actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => setViewItem(item)} disabled={busy || !!editingId} title="View"><Icon name="eye" size={13} /></button>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId} title="Edit"><Icon name="edit" size={13} /></button>
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleToggleStatus(item, `clo.${isActive(item) ? 'archived' : 'restored'}`)} disabled={busy || !!editingId} title={isActive(item) ? 'Archive' : 'Restore'}>
                          <Icon name={isActive(item) ? 'archive' : 'restore'} size={13} />
                        </button>
                        {!isActive(item) && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'clo.deleted', item)} disabled={busy || !!editingId} style={{ marginLeft: 'auto' }} title="Delete"><Icon name="trash" size={13} /></button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="program-grid" style={{ marginTop: 14 }}>
              {visible.map((item) => (
                <div key={item.id} className="program-card--2026 card-enter" data-status={isActive(item) ? 'active' : 'archived'}>
                  {editingId === item.id ? renderEdit() : (
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
                        <button className="btn btn--ghost btn--sm" onClick={() => setViewItem(item)} disabled={busy || !!editingId} title="View"><Icon name="eye" size={13} /></button>
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)} disabled={busy || !!editingId} title="Edit"><Icon name="edit" size={13} /></button>
                        <button className={`btn btn--sm ${isActive(item) ? 'btn--ghost' : 'btn--primary'}`} onClick={() => handleToggleStatus(item, `clo.${isActive(item) ? 'archived' : 'restored'}`)} disabled={busy || !!editingId} title={isActive(item) ? 'Archive' : 'Restore'}>
                          <Icon name={isActive(item) ? 'archive' : 'restore'} size={13} />
                        </button>
                        {!isActive(item) && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(item.id, 'clo.deleted', item)} disabled={busy || !!editingId} style={{ marginLeft: 'auto' }} title="Delete"><Icon name="trash" size={13} /></button>
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

      {viewItem && <CloViewModal item={viewItem} onClose={() => setViewItem(null)} />}
    </div>
  )
}

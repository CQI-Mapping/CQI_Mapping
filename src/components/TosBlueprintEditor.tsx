// One blueprint, edited end to end: the identifying fields, the paper tabs,
// the grid, and its own save.
//
// This exists so the saved-blueprints panel can show a document that is
// genuinely editable rather than a picture of one. Everything the page's own
// editor does, this does — the same debounced writes, the same pending marker,
// the same discard — but scoped to the exam it was handed instead of to
// whatever is open at the top of the page.
//
// Owning the state per instance is the whole point. The page's handlers are
// bound to a single activeId and a pair of timers; sharing them across cards
// would mean every card wrote to whichever blueprint was open, which is a
// silent data-loss bug rather than a visible one.
//
// The page's editor and every expanded card are then the same component, so
// the two cannot drift in behaviour.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPrograms,
  fetchCourses,
  fetchTosSheets,
  fetchTosTopics,
  createTosSheet,
  updateTosSheet,
  updateTosExam,
  replaceTosTopics,
  addActivityLog,
} from '../services/database'
import type { TosExamRow, TosTopicRow } from '../services/database'
import TosSheetGrid from './TosSheetGrid'
import { blankTopic, renumber, validateSheet, num } from '../utils/tosMath'
import type { BloomLevel, SheetKind, TosExam, TosSheet, TosTopic } from '../utils/tosMath'
import { downloadTosExcel } from '../utils/tosXlsx'
import {
  buildProgramOptions,
  buildCourseOptions,
  buildTermOptions,
  programIdForLabel,
} from '../utils/tosOptions'
import type { Course, Program } from '../services/database'

const SAVE_DEBOUNCE_MS = 600

const SHEET_KINDS: { kind: SheetKind; label: string }[] = [
  { kind: 'items', label: 'Multiple Choice' },
  { kind: 'points', label: 'Performance-based' },
]

/** Shared with the page so a card, its blueprint and the workbook agree. */
export const docTitle = (examType: string, kind: SheetKind) =>
  `Table of Specification${examType.trim() ? ` for ${examType.trim()}` : ''}${
    kind === 'items' ? ': Multiple Choice Type' : ': Performance-Based Type'
  }`

const newSheet = (kind: SheetKind): TosSheet => {
  const meta = SHEET_KINDS.find((s) => s.kind === kind)!
  return { id: '', kind, label: meta.label, total: kind === 'items' ? 20 : 50, note: '', topics: [] }
}

const toForm = (row: TosExamRow): TosExam => ({
  code: row.code,
  title: row.title,
  examType: row.exam_type,
  term: row.term,
  preparedBy: row.prepared_by ?? '',
  totalHours: num(row.total_hours),
})

const toTopic = (row: TosTopicRow): TosTopic => ({
  id: row.id,
  position: row.position,
  title: row.title,
  slo: row.slo ?? '',
  hours: num(row.hours),
  bloom: row.bloom ?? {},
})

export interface TosBlueprintEditorProps {
  exam: TosExamRow
  /** Fired after every successful write, so the card list can re-read. */
  onSaved?: () => void
  /** Fired when a rename lands, so a list showing that row can update it. */
  onRenamed?: (next: { code: string; title: string; term: string; total_hours: number }) => void
}

export default function TosBlueprintEditor({ exam, onSaved, onRenamed }: TosBlueprintEditorProps) {
  const [sheets, setSheets] = useState<TosSheet[]>([])
  const [form, setForm] = useState<TosExam>(() => toForm(exam))
  const [activeKind, setActiveKind] = useState<SheetKind>('items')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingKind, setCreatingKind] = useState<SheetKind | null>(null)
  /**
   * Option sources for the three identifying fields.
   *
   * Read once per mounted card rather than per keystroke, and built through the
   * shared helpers so a card's dropdowns offer exactly what the page's do.
   */
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  // Held in refs, not state: the debounced writers read them when the timer
  // fires, and re-rendering on every keystroke to keep a ref current would
  // defeat the point of the debounce.
  const sheetsRef = useRef(sheets)
  sheetsRef.current = sheets
  const sheetIds = useRef<Record<SheetKind, string | null>>({ items: null, points: null })
  const examTimer = useRef<number | null>(null)
  const sheetTimer = useRef<Record<SheetKind, number | null>>({ items: null, points: null })
  const topicsTimer = useRef<Record<SheetKind, number | null>>({ items: null, points: null })

  const fail = useCallback((e: unknown, fallback: string) => {
    setError(e instanceof Error && e.message ? e.message : fallback)
  }, [])

  const reportSaved = useCallback(() => {
    setSaving(false)
    setDirty(false)
    setSavedAt(new Date().toLocaleTimeString())
    setError(null)
    onSaved?.()
  }, [onSaved])

  const afterEdit = useCallback(() => {
    setSaving(true)
    setDirty(true)
  }, [])

  // ---- load ----
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchTosSheets(exam.id)
      const loaded: TosSheet[] = []
      for (const row of rows) {
        const topicRows = await fetchTosTopics(row.id)
        loaded.push({
          id: row.id,
          kind: row.kind,
          label: row.label,
          total: num(row.total),
          note: row.note ?? '',
          topics: topicRows.map(toTopic),
        })
      }
      // Open on the multiple choice paper, as the page does.
      const items = loaded.find((s) => s.kind === 'items')
      sheetIds.current = {
        items: items?.id ?? null,
        points: loaded.find((s) => s.kind === 'points')?.id ?? null,
      }
      setActiveKind('items')
      setSheets(loaded)
      setForm(toForm(exam))
      setDirty(false)
      setSaving(false)
      setSavedAt(null)
    } catch (e) {
      fail(e, 'Could not load this blueprint.')
    } finally {
      setLoading(false)
    }
  }, [exam, fail])

  useEffect(() => {
    load()
  }, [load])

  // Picker sources are auxiliary: the blueprint is fully usable without them,
  // so a failed read degrades to empty dropdowns rather than locking the card.
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchPrograms(), fetchCourses()])
      .then(([p, c]) => {
        if (cancelled) return
        setPrograms(p)
        setCourses(c)
      })
      .catch(() => { /* dropdowns stay empty; the fields below still save */ })
    return () => { cancelled = true }
  }, [])

  const selectedProgramId = useMemo(
    () => programIdForLabel(programs, form.code),
    [programs, form.code],
  )
  const programOptions = useMemo(
    () => buildProgramOptions(programs, form.code),
    [programs, form.code],
  )
  const courseOptions = useMemo(
    () => buildCourseOptions(courses, selectedProgramId, form.title),
    [courses, selectedProgramId, form.title],
  )
  const termOptions = useMemo(() => buildTermOptions(form.term), [form.term])

  const sheet = useMemo(
    () => sheets.find((s) => s.kind === activeKind) ?? newSheet(activeKind),
    [sheets, activeKind],
  )
  const issues = useMemo(() => validateSheet(sheet), [sheet])

  const clearTimers = useCallback(() => {
    for (const { kind } of SHEET_KINDS) {
      const sheetTimerId = sheetTimer.current[kind]
      if (sheetTimerId) {
        window.clearTimeout(sheetTimerId)
        sheetTimer.current[kind] = null
      }
      const topicsTimerId = topicsTimer.current[kind]
      if (topicsTimerId) {
        window.clearTimeout(topicsTimerId)
        topicsTimer.current[kind] = null
      }
    }
    if (examTimer.current) {
      window.clearTimeout(examTimer.current)
      examTimer.current = null
    }
  }, [])

  // ---- writers ----
  const patchExam = useCallback(
    (patch: Partial<TosExam>) => {
      setForm((prev) => {
        const next = { ...prev, ...patch }
        if (examTimer.current) window.clearTimeout(examTimer.current)
        examTimer.current = window.setTimeout(async () => {
          try {
            await updateTosExam(exam.id, {
              code: next.code,
              title: next.title,
              term: next.term,
              prepared_by: next.preparedBy,
              total_hours: num(next.totalHours),
            })
            onRenamed?.({
              code: next.code,
              title: next.title,
              term: next.term,
              total_hours: num(next.totalHours),
            })
            await addActivityLog('tos_exam.updated', {
              entity: 'tos_exam',
              entity_id: exam.id,
              label: [next.code, next.title].filter(Boolean).join(' — ') || 'Table of Specification',
            })
            reportSaved()
          } catch (e) {
            fail(e, 'Could not save the exam details.')
          }
        }, SAVE_DEBOUNCE_MS)
        return next
      })
      afterEdit()
    },
    [exam.id, afterEdit, fail, reportSaved, onRenamed],
  )

  const setTopics = useCallback(
    (kind: SheetKind, next: TosTopic[]) => {
      setSheets((prev) => prev.map((s) => (s.kind === kind ? { ...s, topics: next } : s)))
      if (topicsTimer.current[kind]) window.clearTimeout(topicsTimer.current[kind]!)
      topicsTimer.current[kind] = window.setTimeout(async () => {
        const id = sheetIds.current[kind]
        if (!id) return
        const target = sheetsRef.current.find((s) => s.kind === kind)
        try {
          await replaceTosTopics(
            id,
            (target?.topics ?? next).map((t) => ({
              id: t.id,
              title: t.title,
              slo: t.slo,
              hours: num(t.hours),
              bloom: t.bloom,
            })),
          )
          reportSaved()
        } catch (e) {
          fail(e, 'Could not save the topics.')
        }
      }, SAVE_DEBOUNCE_MS)
      afterEdit()
    },
    [afterEdit, fail, reportSaved],
  )

  const patchSheet = useCallback(
    (kind: SheetKind, patch: Partial<TosSheet>) => {
      setSheets((prev) => prev.map((s) => (s.kind === kind ? { ...s, ...patch } : s)))
      if (sheetTimer.current[kind]) window.clearTimeout(sheetTimer.current[kind]!)
      sheetTimer.current[kind] = window.setTimeout(async () => {
        const id = sheetIds.current[kind]
        const target = sheetsRef.current.find((s) => s.kind === kind)
        if (!id || !target) return
        try {
          await updateTosSheet(id, { total: num(target.total) })
          reportSaved()
        } catch (e) {
          fail(e, 'Could not save the blueprint total.')
        }
      }, SAVE_DEBOUNCE_MS)
      afterEdit()
    },
    [afterEdit, fail, reportSaved],
  )

  const patchTopic = useCallback(
    (id: string, patch: { title?: string; slo?: string; hours?: number }) => {
      setTopics(
        activeKind,
        sheet.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
    },
    [setTopics, activeKind, sheet.topics],
  )

  const setBloom = useCallback(
    (topicId: string, level: BloomLevel, raw: string) => {
      setTopics(
        activeKind,
        sheet.topics.map((t) =>
          t.id === topicId
            ? { ...t, bloom: { ...t.bloom, [level]: Math.max(0, Math.round(num(raw))) } }
            : t,
        ),
      )
    },
    [setTopics, activeKind, sheet.topics],
  )

  const addTopic = useCallback(() => {
    setTopics(activeKind, [...sheet.topics, blankTopic(sheet.topics.length + 1)])
  }, [setTopics, activeKind, sheet.topics])

  const removeTopic = useCallback(
    (id: string) => {
      setTopics(activeKind, renumber(sheet.topics.filter((t) => t.id !== id)))
    },
    [setTopics, activeKind, sheet.topics],
  )

  /** Write everything pending, on both papers. */
  const saveNow = useCallback(async () => {
    setSaving(true)
    setError(null)
    clearTimers()

    const writes: Promise<void>[] = []
    writes.push(
      updateTosExam(exam.id, {
        code: form.code,
        title: form.title,
        term: form.term,
        prepared_by: form.preparedBy,
        total_hours: num(form.totalHours),
      })
        .then(() => undefined)
        .catch((e) => fail(e, 'Could not save the exam details.')),
    )

    for (const { kind } of SHEET_KINDS) {
      const id = sheetIds.current[kind]
      const target = sheetsRef.current.find((s) => s.kind === kind)
      if (!id || !target) continue
      writes.push(
        updateTosSheet(id, { total: num(target.total) })
          .then(() => undefined)
          .catch((e) => fail(e, 'Could not save the blueprint total.')),
      )
      writes.push(
        replaceTosTopics(
          id,
          target.topics.map((t) => ({
            id: t.id,
            title: t.title,
            slo: t.slo,
            hours: num(t.hours),
            bloom: t.bloom,
          })),
        ).catch((e) => fail(e, 'Could not save the topics.')),
      )
    }

    await Promise.all(writes)
    reportSaved()
  }, [exam.id, form, clearTimers, fail, reportSaved])

  /** Throw unsaved edits away and re-read. Timers first, or they write back. */
  const discardPending = useCallback(async () => {
    clearTimers()
    await load()
  }, [clearTimers, load])

  /** Export carries the paper on screen, and only that one. */
  const exportExcel = useCallback(async () => {
    try {
      await downloadTosExcel({ ...form }, sheet)
      await addActivityLog('tos_exam.exported', {
        entity: 'tos_exam',
        entity_id: exam.id,
        label: [form.code, form.title].filter(Boolean).join(' — ') || 'Table of Specification',
      })
    } catch (e) {
      fail(e, 'Could not build the Excel file.')
    }
  }, [form, sheet, exam.id, fail])

  /** Open the other paper, creating its sheet the first time. */
  const switchTo = useCallback(
    async (kind: SheetKind) => {
      if (kind === activeKind) return
      const from = activeKind
      setActiveKind(kind)
      if (sheetIds.current[kind] || sheetsRef.current.some((s) => s.kind === kind)) return
      if (creatingKind) return
      setCreatingKind(kind)
      try {
        const created = await createTosSheet({
          exam_id: exam.id,
          kind,
          label: SHEET_KINDS.find((s) => s.kind === kind)!.label,
          total: kind === 'items' ? 20 : 50,
          position: 1,
        })
        sheetIds.current[kind] = created.id
        setSheets((prev) =>
          prev.some((s) => s.kind === kind) ? prev : [...prev, { ...newSheet(kind), id: created.id }],
        )
        reportSaved()
      } catch {
        // Nothing was written, so leave the paper that does exist rather than
        // showing an empty sheet that will not save.
        setActiveKind(from)
        setError('Could not create that blueprint sheet.')
      } finally {
        setCreatingKind(null)
      }
    },
    [activeKind, creatingKind, exam.id, fail, reportSaved],
  )

  const ready = !loading && !error

  if (loading) return <p className="tos-card__loading">Loading blueprint…</p>

  return (
    <div className="tos-card__editor">
      {/* ---- identifying fields ----
          Deliberately the page's own panel and field-grid classes, not a card-
          specific layout. A blueprint opened from a card has to look identical
          to the same blueprint opened at the top of the page; the earlier
          four-across row read as a different form for the same fields. */}
      <div className="panel tos-panel">
        <div className="tos-field-grid">
          <label className="field">
            <span>Program</span>
            <select
              className="input input--sm"
              value={form.code}
              disabled={!ready}
              onChange={(e) => patchExam({ code: e.target.value })}
            >
              <option value="">
                {programs.length === 0 ? 'No programs available' : '- select program -'}
              </option>
              {programOptions.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Course title</span>
            <select
              className="input input--sm"
              value={form.title}
              disabled={!ready}
              onChange={(e) => patchExam({ title: e.target.value })}
            >
              <option value="">
                {courses.length === 0
                  ? 'No courses available'
                  : selectedProgramId
                    ? '- select course -'
                    : '- select course (all programs) -'}
              </option>
              {courseOptions.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Semester</span>
            <select
              className="input input--sm"
              value={form.term}
              disabled={!ready}
              onChange={(e) => patchExam({ term: e.target.value })}
            >
              <option value="">- select semester -</option>
              {termOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="tos-savestate" role="status">
          {error ? (
            <span className="tos-savestate__error">{error}</span>
          ) : saving ? (
            <span>Saving…</span>
          ) : savedAt ? (
            <span>Saved {savedAt}</span>
          ) : null}
        </div>
      </div>

      {/* ---- paper tabs ----
          Same tab strip as the page, keyboard handling included, so the two
          behave identically rather than merely looking alike. */}
      <div
        className="tos-tabs no-print"
        role="tablist"
        aria-label="Blueprint paper"
        onKeyDown={(e) => {
          // The page's own handling: arrows move, Home/End jump to the ends,
          // written against SHEET_KINDS so a third paper needs no change here.
          const at = SHEET_KINDS.findIndex((s) => s.kind === sheet.kind)
          const last = SHEET_KINDS.length - 1
          let to: number
          if (e.key === 'ArrowRight') to = at + 1 > last ? 0 : at + 1
          else if (e.key === 'ArrowLeft') to = at - 1 < 0 ? last : at - 1
          else if (e.key === 'Home') to = 0
          else if (e.key === 'End') to = last
          else return

          e.preventDefault()
          switchTo(SHEET_KINDS[to].kind)
          e.currentTarget.querySelectorAll<HTMLButtonElement>('.tos-tab')[to]?.focus()
        }}
      >
        {SHEET_KINDS.map(({ kind, label }) => {
          const selected = sheet.kind === kind
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`tos-tab${selected ? ' tos-tab--on' : ''}`}
              disabled={!ready || creatingKind !== null}
              onClick={() => switchTo(kind)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <TosSheetGrid
        sheet={sheet}
        header={{
          courseTitle: form.title,
          term: form.term,
          title: docTitle(form.examType, sheet.kind),
        }}
        issues={issues}
        editable={ready && !creatingKind}
        onPatchSheet={(patch) => patchSheet(activeKind, patch)}
        onPatchTopic={patchTopic}
        onSetBloom={(id, level, value) => setBloom(id, level, value)}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onExportExcel={exportExcel}
        onSave={saveNow}
        saving={saving}
        dirty={dirty}
        onDiscard={discardPending}
      />
    </div>
  )
}
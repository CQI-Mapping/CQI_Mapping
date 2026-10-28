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
  fetchTosExam,
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
  buildSemesterOptions,
  buildSchoolYearOptions,
  buildExamTypeOptions,
  composeTerm,
  describeTosError,
  splitTerm,
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

const toForm = (row: TosExamRow): TosExam => {
  const split = splitTerm(row.term)
  return {
    code: row.code,
    title: row.title,
    examType: row.exam_type,
    semester: row.semester ?? split.semester,
    schoolYear: row.school_year ?? split.schoolYear,
    preparedBy: row.prepared_by ?? '',
    totalHours: num(row.total_hours),
  }
}

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
  /**
   * Fired once the explicit Save has landed and the panel has re-read, so the
   * page can close the editor and show the updated card. The debounced
   * autosaves never fire it — they keep the editor open while the user types.
   */
  onCommitted?: () => void | Promise<unknown>
  /** Fired when a rename lands, so a list showing that row can update it. */
  onRenamed?: (
    next: {
      code: string
      title: string
      examType: string
      semester: string
      schoolYear: string
      total_hours: number
    },
  ) => void
}

export default function TosBlueprintEditor({
  exam,
  onSaved,
  onRenamed,
  onCommitted,
}: TosBlueprintEditorProps) {
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
    setError(describeTosError(e, fallback))
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
      // The row this card was rendered from is the list's latest snapshot,
      // which can lag the newest autosave. Reading the row back from the
      // database here means the form starts from what is actually stored,
      // whatever the panel had not caught up with yet.
      const row = await fetchTosExam(exam.id)
      const rows = await fetchTosSheets(row.id)
      const loaded: TosSheet[] = []
      for (const sheetRow of rows) {
        const topicRows = await fetchTosTopics(sheetRow.id)
        loaded.push({
          id: sheetRow.id,
          kind: sheetRow.kind,
          label: sheetRow.label,
          total: num(sheetRow.total),
          note: sheetRow.note ?? '',
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
      setForm(toForm(row))
      setDirty(false)
      setSaving(false)
      setSavedAt(null)
    } catch (e) {
      fail(e, 'Could not load this blueprint.')
    } finally {
      setLoading(false)
    }
  }, [exam.id, fail])

  /**
   * Load once, when the card opens.
   *
   * `load` used to hang off the whole `exam` prop, whose object identity
   * changes with every refresh of the saved-blueprints panel -- and that panel
   * refreshes after every autosave anywhere, including this card's own. Each
   * refresh therefore re-ran load() and rebuilt the form from the row snapshot,
   * silently erasing whatever had been typed in the meantime: a Save pressed
   * afterwards then wrote the erased form back, and the card reverted to what
   * it was before the edit. Keying only on the row's id keeps the re-fetch at
   * the moment the card opens; the refetch reads current values anyway.
   */
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
  const semesterOptions = useMemo(() => buildSemesterOptions(form.semester), [form.semester])
  const schoolYearOptions = useMemo(() => buildSchoolYearOptions(form.schoolYear), [
    form.schoolYear,
  ])
  const examTypeOptions = useMemo(() => buildExamTypeOptions(form.examType), [form.examType])

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
            // Blank dropdowns store NULL rather than '' — the UNIQUE key
            // covers both columns, and '' twice would make two header-less
            // drafts duplicate keys. The NOT NULL term follows the selection:
            // '' when both are cleared, so a legacy term cannot outlive them.
            await updateTosExam(exam.id, {
              code: next.code,
              title: next.title,
              exam_type: next.examType,
              term:
                next.semester || next.schoolYear
                  ? composeTerm(next.semester, next.schoolYear)
                  : '',
              semester: next.semester || null,
              school_year: next.schoolYear || null,
              prepared_by: next.preparedBy,
              total_hours: num(next.totalHours),
            })
            onRenamed?.({
              code: next.code,
              title: next.title,
              examType: next.examType,
              semester: next.semester,
              schoolYear: next.schoolYear,
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
        exam_type: form.examType,
        // Same NULL-not-'' rule as page saveNow / patchExam, for the same
        // UNIQUE-key reason; this card's save stays flush-only, though — a
        // card's Save writes what is here without starting another draft.
        term:
          form.semester || form.schoolYear
            ? composeTerm(form.semester, form.schoolYear)
            : '',
        semester: form.semester || null,
        school_year: form.schoolYear || null,
        prepared_by: form.preparedBy,
        total_hours: num(form.totalHours),
      })
        .then(() => undefined)
        .catch((e) => {
          fail(e, 'Could not save the exam details.')
          throw e
        }),
    )

    for (const { kind } of SHEET_KINDS) {
      const id = sheetIds.current[kind]
      const target = sheetsRef.current.find((s) => s.kind === kind)
      if (!id || !target) continue
      writes.push(
        updateTosSheet(id, { total: num(target.total) })
          .then(() => undefined)
          .catch((e) => {
            fail(e, 'Could not save the blueprint total.')
            throw e
          }),
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
        ).catch((e) => {
          fail(e, 'Could not save the topics.')
          throw e
        }),
      )
    }

    // The catches only shape the message; the throw is what lets allSettled
    // see the failure. Without it every rejected write resolved anyway, this
    // reported Saved, and the panel showed a card the database does not hold.
    const results = await Promise.allSettled(writes)
    if (results.some((r) => r.status === 'rejected')) {
      // Keep the editor exactly as the user left it; `dirty` stays up, so the
      // pending marker keeps saying there is work that has not landed.
      setSaving(false)
      return
    }

    reportSaved()
    // The explicit Save is also the close. The page re-reads the list first,
    // then collapses this editor, so what is left on screen is the card as
    // the database now holds it.
    await onCommitted?.()
  }, [exam.id, form, clearTimers, fail, reportSaved, onCommitted])

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
                {courses.length === 0 ? 'No courses available' : '- select course -'}
              </option>
              {courseOptions.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Table of Specification for</span>
            <select
              className="input input--sm"
              value={form.examType}
              disabled={!ready}
              onChange={(e) => patchExam({ examType: e.target.value })}
            >
              <option value="">- select exam type -</option>
              {examTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {/* Semester and School Year sit side by side so the header stays compact. */}
          <div className="field-row">
            <label className="field">
              <span>Semester</span>
              <select
                className="input input--sm"
                value={form.semester}
                disabled={!ready}
                onChange={(e) => patchExam({ semester: e.target.value })}
              >
                <option value="">- select semester -</option>
                {semesterOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>School Year</span>
              <select
                className="input input--sm"
                value={form.schoolYear}
                disabled={!ready}
                onChange={(e) => patchExam({ schoolYear: e.target.value })}
              >
                <option value="">- select school year -</option>
                {schoolYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
          term: composeTerm(form.semester, form.schoolYear),
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
        // The card's Save writes everything pending and then closes the
        // editor, so its tooltip says both halves.
        saveTitle="Save this blueprint and close the editor"
      />
    </div>
  )
}
// Table of Specification workspace.
//
// The TOS is built first and the exam is written to match it, so this page is
// closer to a spreadsheet than a viewer: you type in the green cells, and the
// gray formula cells — the hour-weighted "Number of Item" column, the header
// percentages, the column totals — recompute as you go. The layout follows the
// faculty's workbook, green for inputs and gray for formulas.
//
// Persistence: exams, sheets, and topics live in Supabase under RLS scoped to
// the signed-in user, so a blueprint survives a refresh and nobody else can see
// it. Edits are optimistic — the grid updates on keystroke and the write follows,
// so typing never waits on the network.
//
// An exam owns its sheets; a sheet owns its topics. The hour weighting is never
// stored — it is derived from topic hours and the sheet total on every read, so
// editing either input moves every weight for free.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TosSheetGrid from '../../components/TosSheetGrid'
import {
  blankTopic,
  num,
  renumber,
  validateSheet,
  type BloomLevel,
  type TosExam,
  type TosSheet,
  type TosTopic,
} from '../../utils/tosMath'
import {
  createTosExam,
  createTosSheet,
  fetchPrograms,
  fetchTosExams,
  fetchTosSheets,
  fetchTosTopics,
  replaceTosTopics,
  updateTosExam,
  updateTosSheet,
  type Program,
  type TosExamRow,
} from '../../services/database'
import { supabase } from '../../utils/supabaseClient'

const SAVE_DEBOUNCE_MS = 600

/** A blank exam: identity left for the user, one empty blueprint sheet. */
const blankSheet = (): TosSheet => ({
  id: '',
  kind: 'items',
  label: 'Multiple Choice',
  total: 20,
  note: '',
  topics: [],
})

/**
 * The printed TOS header shows the program, so the picker stores and displays
 * both halves -- "BSCS - Bachelor of Science in Computer Science". One string
 * keeps tos_exams.code self-contained: no extra column, no lookup on print.
 */
const programLabel = (p: Program): string => `${p.code} - ${p.name}`

/**
 * PostgREST puts the actionable part of a failure in `hint` and its class in
 * `code` -- the package's own docs warn that logging only `message` hides the
 * hint. Reading the fields structurally also avoids leaning on
 * `instanceof Error`, which is a poor gate for a value that arrived over the wire.
 */
const messageOf = (e: unknown, fallback: string): string => {
  if (typeof e === 'string') return e
  if (!e || typeof e !== 'object') return fallback
  const { message, hint, code } = e as Record<string, unknown>
  const parts = [message, hint, code].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  )
  return parts.length > 0 ? parts.join(' — ') : fallback
}

/** The signed-in user's id, which the tos_exams insert requires. */
const currentUserId = async (): Promise<string> => {
  const { data, error } = await supabase!.auth.getUser()
  if (error) throw error
  const id = data.user?.id
  if (!id) throw new Error('You are not signed in.')
  return id
}

export default function TOS() {
  const [activeId, setActiveId] = useState('')
  const [exam, setExam] = useState<TosExam>(() => ({
    code: '',
    title: '',
    examType: 'Table of Specification for Prelim',
    term: '',
    coverage: '',
    preparedBy: '',
    totalHours: 8,
  }))
  const [sheet, setSheet] = useState<TosSheet>(blankSheet)
  const [programs, setPrograms] = useState<Program[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const sheetId = useRef<string | null>(null)
  const examTimer = useRef<number | null>(null)
  const sheetTimer = useRef<number | null>(null)
  const topicsTimer = useRef<number | null>(null)

  const issues = useMemo(() => validateSheet(sheet, exam.totalHours), [sheet, exam.totalHours])

  /**
   * Editing is only safe once the row exists: before that activeId is empty and
   * every debounced write is a silent no-op, which looks identical to saving.
   * A failed load therefore locks the form rather than pretending to work.
   */
  const ready = !loading && !error && Boolean(activeId)

  const fail = useCallback((e: unknown, fallback: string) => {
    setError(messageOf(e, fallback))
  }, [])

  const reportSaved = useCallback(() => {
    setSaving(false)
    setSavedAt(new Date().toLocaleTimeString())
    setError(null)
  }, [])

  // ---- loading an exam -------------------------------------------------

  /** Pull one exam's sheet and topics into the working copy. */
  const loadInto = useCallback(async (row: TosExamRow) => {
    const sheets = await fetchTosSheets(row.id)
    // 'items' first: the multiple choice paper is the one shown.
    const target = sheets.find((s) => s.kind === 'items') ?? sheets[0]
    if (!target) throw new Error('This exam has no blueprint sheet.')
    const topicRows = await fetchTosTopics(target.id)

    sheetId.current = target.id
    setExam({
      code: row.code,
      title: row.title,
      examType: `Table of Specification for ${row.exam_type}`,
      term: row.term,
      coverage: row.coverage ?? '',
      preparedBy: row.prepared_by ?? '',
      totalHours: num(row.total_hours),
    })
    setSheet({
      id: target.id,
      kind: target.kind,
      label: target.label,
      total: num(target.total),
      note: target.note ?? '',
      topics: topicRows.map((t) => ({
        id: t.id,
        position: t.position,
        title: t.title,
        slo: t.slo ?? '',
        hours: num(t.hours),
        bloom: t.bloom ?? {},
      })),
    })
  }, [])

  // First visit: create an empty blueprint rather than a sample one. Every
  // account used to open onto a copy of IT21, which meant a Manager got a
  // syllabus they do not teach. The sheet starts with zero topics, so
  // validateSheet reports NO_TOPICS until the first one is added -- which is
  // accurate feedback, not a failure.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        let rows = await fetchTosExams()
        if (rows.length === 0) {
          const created = await createTosExam(
            { code: '', title: '', exam_type: 'Prelim', term: '', total_hours: 8 },
            await currentUserId(),
          )
          await createTosSheet({
            exam_id: created.id,
            kind: 'items',
            label: 'Multiple Choice',
            total: 20,
            position: 0,
          })
          rows = [created]
        }
        if (cancelled) return
        setActiveId(rows[0].id)
        await loadInto(rows[0])
      } catch (e) {
        fail(e, 'Could not load your Table of Specification.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [fail, loadInto])

  // Only one exam is on screen. The schema still stores many per user --
  // fetchTosExams() orders by updated_at and the page opens the first -- so
  // nothing is lost by not offering a picker yet.

  // ---- program picker options ------------------------------------------

  // The program list is auxiliary: the blueprint is fully usable without it, so
  // a failed read degrades to an empty dropdown instead of locking the page the
  // way a failed exam load does. Only active programs are offered.
  useEffect(() => {
    let cancelled = false
    fetchPrograms()
      .then((rows) => {
        if (!cancelled) setPrograms(rows.filter((p) => p.status === 'active'))
      })
      .catch(() => {
        if (!cancelled) setPrograms([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * A stored code that matches no listed program -- the program was archived or
   * deleted, or the value was typed before this picker existed -- is kept as its
   * own option. Without it the <select> would fall back to the placeholder and
   * the next unrelated edit would overwrite the saved program.
   */
  const programOptions = useMemo(() => {
    const options = programs.map((p) => ({ id: p.id, value: programLabel(p) }))
    if (exam.code && !options.some((o) => o.value === exam.code)) {
      options.unshift({ id: 'unlisted', value: exam.code })
    }
    return options
  }, [programs, exam.code])

  // ---- debounced writes -----------------------------------------------

  // Every setter updates local state immediately and schedules a write, so a
  // burst of keystrokes in one cell collapses into a single request.

  const afterEdit = useCallback(() => setSaving(true), [])

  const patchExam = useCallback(
    (patch: Partial<TosExam>) => {
      setExam((prev) => {
        const next = { ...prev, ...patch }
        if (examTimer.current) window.clearTimeout(examTimer.current)
        examTimer.current = window.setTimeout(async () => {
          if (!activeId) return
          try {
            await updateTosExam(activeId, {
              code: next.code,
              title: next.title,
              exam_type: next.examType.replace(/^Table of Specification for\s+/i, ''),
              term: next.term,
              coverage: next.coverage,
              prepared_by: next.preparedBy,
              total_hours: num(next.totalHours),
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
    [activeId, afterEdit, fail, reportSaved],
  )

  const patchSheet = useCallback(
    (patch: Partial<TosSheet>) => {
      setSheet((prev) => {
        const next = { ...prev, ...patch }
        if (sheetTimer.current) window.clearTimeout(sheetTimer.current)
        sheetTimer.current = window.setTimeout(async () => {
          if (!sheetId.current) return
          try {
            await updateTosSheet(sheetId.current, { total: num(next.total) })
            reportSaved()
          } catch (e) {
            fail(e, 'Could not save the blueprint total.')
          }
        }, SAVE_DEBOUNCE_MS)
        return next
      })
      afterEdit()
    },
    [afterEdit, fail, reportSaved],
  )

  /** Topics are replaced wholesale — position is part of their unique key. */
  const setTopics = useCallback(
    (next: TosTopic[]) => {
      setSheet((prev) => ({ ...prev, topics: next }))
      if (topicsTimer.current) window.clearTimeout(topicsTimer.current)
      topicsTimer.current = window.setTimeout(async () => {
        if (!sheetId.current) return
        try {
          await replaceTosTopics(
            sheetId.current,
            next.map((t) => ({
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

  // Pending writes must not fire after unmount.
  useEffect(
    () => () => {
      for (const t of [examTimer, sheetTimer, topicsTimer]) {
        if (t.current) window.clearTimeout(t.current)
      }
    },
    [],
  )

  // ---- topic editing --------------------------------------------------

  const patchTopic = useCallback(
    (id: string, patch: { title?: string; slo?: string; hours?: number }) => {
      setTopics(sheet.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    },
    [sheet.topics, setTopics],
  )

  const setBloom = useCallback(
    (topicId: string, level: BloomLevel, raw: string) => {
      const topic = sheet.topics.find((t) => t.id === topicId)
      if (!topic) return
      const value = num(raw)
      const bloom = { ...topic.bloom }
      // Zero and blank both mean "nothing at this level", so the key is dropped
      // rather than stored as 0 — keeps the share maths and the grid honest.
      if (value > 0) bloom[level] = value
      else delete bloom[level]
      setTopics(sheet.topics.map((t) => (t.id === topicId ? { ...t, bloom } : t)))
    },
    [sheet.topics, setTopics],
  )

  const addTopic = useCallback(() => {
    setTopics([...sheet.topics, blankTopic(sheet.topics.length + 1)])
  }, [sheet.topics, setTopics])

  const removeTopic = useCallback(
    (id: string) => {
      setTopics(renumber(sheet.topics.filter((t) => t.id !== id)))
    },
    [sheet.topics, setTopics],
  )

  return (
    <div className="syllabus-doc">
      {/* ---- exam header ---- */}
      <div className="panel tos-panel no-print">
        <div className="tos-field-grid">
          <label className="field">
            <span>Program</span>
            <select
              className="input input--sm"
              value={exam.code}
              disabled={!ready || programs.length === 0}
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
            <input
              className="input input--sm"
              value={exam.title}
              placeholder="- type course title -"
              disabled={!ready}
              onChange={(e) => patchExam({ title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Term</span>
            <input
              className="input input--sm"
              value={exam.term}
              placeholder="- type term (e.g. 1st Semester, 2026-2027) -"
              disabled={!ready}
              onChange={(e) => patchExam({ term: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Exam type</span>
            <input
              className="input input--sm"
              value={exam.examType.replace(/^Table of Specification for\s+/i, '')}
              placeholder="- type exam type -"
              disabled={!ready}
              onChange={(e) =>
                patchExam({ examType: `Table of Specification for ${e.target.value}` })
              }
            />
          </label>
        </div>

        <div className="tos-savestate" role="status">
          {error ? (
            <span className="tos-savestate__error">
              {error}
              {ready === false && !loading && ' — nothing is being saved. Check the database connection.'}
            </span>
          ) : loading ? (
            <span>Loading…</span>
          ) : saving ? (
            <span>Saving…</span>
          ) : savedAt ? (
            <span>Saved {savedAt}</span>
          ) : null}
        </div>
      </div>

      {/* ---- the blueprint ---- */}
      <TosSheetGrid
        sheet={sheet}
        issues={issues}
        editable={ready}
        onPatchSheet={patchSheet}
        onPatchTopic={patchTopic}
        onSetBloom={setBloom}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onReset={() => window.location.reload()}
      />
    </div>
  )
}
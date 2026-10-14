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
  type SheetKind,
  type TosExam,
  type TosSheet,
  type TosTopic,
} from '../../utils/tosMath'
import {
  createTosExam,
  createTosSheet,
  fetchCourses,
  fetchPrograms,
  fetchTosExams,
  fetchTosSheets,
  fetchTosTopics,
  replaceTosTopics,
  updateTosExam,
  updateTosSheet,
  type Course,
  type Program,
  type TosExamRow,
} from '../../services/database'
import { supabase } from '../../utils/supabaseClient'
import { downloadTosExcel } from '../../utils/tosXlsx'

const SAVE_DEBOUNCE_MS = 600

/**
 * The two papers of an exam, in the order the workbook shows them. Each is a
 * tab, not a separate document: one exam carries both, which is what
 * UNIQUE (exam_id, kind) on tos_sheets describes.
 */
const SHEET_KINDS: { kind: SheetKind; label: string }[] = [
  { kind: 'items', label: 'Multiple Choice' },
  { kind: 'points', label: 'Performance-based' },
]

/**
 * The terms a blueprint can be filed under. Both semesters carry the same
 * academic year -- the usual Aug-July calendar puts 1st Sem in Aug-Dec 2026 and
 * 2nd Sem in Jan-May 2027, so they share 2026-2027. Spelled out in full because
 * this string is what the exported workbook prints.
 */
const SCHOOL_YEAR = '2026-2027'
const TERMS = [`1st Semester, ${SCHOOL_YEAR}`, `2nd Semester, ${SCHOOL_YEAR}`]

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
 * tos_sheets.total is NOT NULL CHECK (total > 0), so a lazily created sheet
 * cannot start at zero the way blankSheet() does. 20 matches the multiple
 * choice default; a performance sheet is seeded the same way and edited from
 * there.
 */
const newSheet = (kind: SheetKind): TosSheet => {
  const meta = SHEET_KINDS.find((s) => s.kind === kind)
  return {
    id: '',
    kind,
    label: meta?.label ?? kind,
    total: 20,
    note: '',
    topics: [],
  }
}

/**
 * The printed TOS header shows the program, so the picker stores and displays
 * both halves -- "BSCS - Bachelor of Science in Computer Science". One string
 * keeps tos_exams.code self-contained: no extra column, no lookup on print.
 */
const programLabel = (p: Program): string => `${p.code} - ${p.name}`

/** The course header follows the same shape as the program one. */
const courseLabel = (c: Course): string => `${c.code} - ${c.title}`

/**
 * fetchCourses() embeds the program join, so program_id arrives as an object on
 * a course that came through that select and as a bare uuid elsewhere.
 */
const relId = (v: string | { id: string } | null | undefined) =>
  v && typeof v === 'object' ? v.id : v || ''

/** Archived rows stay in the database but out of a new pick. */
const isActive = <T extends { status?: string }>(x: T) => !x.status || x.status === 'active'

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
    // Read-only: there is no field for it any more, but the exported workbook's
    // title line reads "Table of Specification for Prelim" and needs it.
    examType: 'Prelim',
    term: '',
    preparedBy: '',
    totalHours: 8,
  }))
  const [sheets, setSheets] = useState<TosSheet[]>([blankSheet()])
  const [activeKind, setActiveKind] = useState<SheetKind>('items')
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const sheetIds = useRef<Record<SheetKind, string | null>>({ items: null, points: null })
  const examTimer = useRef<number | null>(null)
  // One timer per sheet, not one per field: a pending write belongs to the
  // sheet it was made on, so switching tabs must not cancel it.
  const sheetTimer = useRef<Record<SheetKind, number | null>>({ items: null, points: null })
  const topicsTimer = useRef<Record<SheetKind, number | null>>({ items: null, points: null })

  /**
   * Every editor below works on the visible sheet. Deriving it rather than
   * holding a second copy means validateSheet, the grid and the topic handlers
   * stay written against one sheet, and only the setters need to know about the
   * other one.
   */
  const sheet = useMemo(
    () => sheets.find((s) => s.kind === activeKind) ?? sheets[0],
    [sheets, activeKind],
  )

  /**
   * Mirrors `sheets` so a debounced write can read the value as it stands when
   * the timer fires. Reading the state captured at schedule time instead would
   * drop every keystroke made inside the debounce window.
   */
  const sheetsRef = useRef(sheets)
  sheetsRef.current = sheets

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

  /**
   * Pull every sheet of an exam into the working copy, each with its topics.
   *
   * Both papers load even though only one is visible: an exam whose performance
   * sheet already exists must come back with it, or the tab would look empty
   * and re-creating it would trip UNIQUE (exam_id, kind).
   */
  const loadInto = useCallback(async (row: TosExamRow) => {
    const rows = await fetchTosSheets(row.id)
    const itemsRow = rows.find((s) => s.kind === 'items') ?? rows[0]
    if (!itemsRow) throw new Error('This exam has no blueprint sheet.')

    const loaded = await Promise.all(
      rows.map(async (s) => {
        const topicRows = await fetchTosTopics(s.id)
        return {
          id: s.id,
          kind: s.kind,
          label: s.label,
          total: num(s.total),
          note: s.note ?? '',
          topics: topicRows.map((t) => ({
            id: t.id,
            position: t.position,
            title: t.title,
            slo: t.slo ?? '',
            hours: num(t.hours),
            bloom: t.bloom ?? {},
          })),
        } satisfies TosSheet
      }),
    )

    // Open on the multiple choice paper, as before. Anything else would change
    // what the page looks like on every visit.
    sheetIds.current = {
      items: itemsRow.id,
      points: rows.find((s) => s.kind === 'points')?.id ?? null,
    }
    setActiveKind('items')
    setSheets(loaded)
    setExam({
      code: row.code,
      title: row.title,
      examType: row.exam_type,
      term: row.term,
      preparedBy: row.prepared_by ?? '',
      totalHours: num(row.total_hours),
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
          // exam_type is NOT NULL and sits in UNIQUE (user_id, code,
          // exam_type, term), but the header no longer offers a field for it.
          // A constant is therefore what every exam gets, and updates never
          // write the column again -- existing rows keep the value they had.
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

  // ---- picker options ---------------------------------------------------

  // The picker lists are auxiliary: the blueprint is fully usable without them,
  // so a failed read degrades to an empty dropdown instead of locking the page
  // the way a failed exam load does. allSettled keeps one dead table from
  // taking the other down with it. Only active rows are offered.
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([fetchPrograms(), fetchCourses()]).then(([p, c]) => {
      if (cancelled) return
      setPrograms(p.status === 'fulfilled' ? p.value.filter(isActive) : [])
      setCourses(c.status === 'fulfilled' ? c.value.filter(isActive) : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** The program the exam is currently filed under, or '' when none/unlisted. */
  const selectedProgramId = useMemo(
    () => programs.find((p) => programLabel(p) === exam.code)?.id ?? '',
    [programs, exam.code],
  )

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

  /**
   * Courses are scoped to the chosen program, but an exam saved before the
   * picker existed has no program to scope by -- listing every course keeps
   * those reachable instead of hiding them behind a prerequisite. A course that
   * is off-list (archived, or belonging to a program the user just switched
   * away from) stays visible as its own option, so changing Program never
   * silently discards a course the user already picked.
   */
  const courseOptions = useMemo(() => {
    const scoped = selectedProgramId
      ? courses.filter((c) => relId(c.program_id) === selectedProgramId)
      : courses
    const options = scoped.map((c) => ({ id: c.id, value: courseLabel(c) }))
    if (exam.title && !options.some((o) => o.value === exam.title)) {
      options.unshift({ id: 'unlisted', value: exam.title })
    }
    return options
  }, [courses, selectedProgramId, exam.title])

  /**
   * Terms saved before this picker existed read like "1st Semester, 2026-2027"
   * and match neither option, so the stored value stays as its own entry.
   * Dropping it would leave the select on the placeholder and overwrite the
   * saved term on the next unrelated edit.
   */
  const termOptions = useMemo(() => {
    const options = [...TERMS]
    if (exam.term && !options.includes(exam.term)) options.unshift(exam.term)
    return options
  }, [exam.term])

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
              term: next.term,
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

  /**
   * The sheet id and the payload are both read when the timer fires, not when
   * it is scheduled. An edit made on the multiple choice sheet and then a tab
   * switch inside the debounce window must still write to the sheet it was made
   * on, with the value that was last typed.
   */
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

  /** Topics are replaced wholesale — position is part of their unique key. */
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

  // Pending writes must not fire after unmount.
  useEffect(
    () => () => {
      if (examTimer.current) window.clearTimeout(examTimer.current)
      for (const kind of ['items', 'points'] as SheetKind[]) {
        if (sheetTimer.current[kind]) window.clearTimeout(sheetTimer.current[kind]!)
        if (topicsTimer.current[kind]) window.clearTimeout(topicsTimer.current[kind]!)
      }
    },
    [],
  )

  // ---- topic editing --------------------------------------------------

  // These all act on the visible sheet, so they pass activeKind straight
  // through to setTopics rather than each re-deriving which sheet they mean.

  const patchTopic = useCallback(
    (id: string, patch: { title?: string; slo?: string; hours?: number }) => {
      setTopics(activeKind, sheet.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    },
    [activeKind, sheet.topics, setTopics],
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
      setTopics(
        activeKind,
        sheet.topics.map((t) => (t.id === topicId ? { ...t, bloom } : t)),
      )
    },
    [activeKind, sheet.topics, setTopics],
  )

  const addTopic = useCallback(() => {
    setTopics(activeKind, [...sheet.topics, blankTopic(sheet.topics.length + 1)])
  }, [activeKind, sheet.topics, setTopics])

  const removeTopic = useCallback(
    (id: string) => {
      setTopics(activeKind, renumber(sheet.topics.filter((t) => t.id !== id)))
    },
    [activeKind, sheet.topics, setTopics],
  )

  // ---- switching papers -----------------------------------------------

  /**
   * The performance sheet is created the first time it is opened rather than
   * on first visit, so an account that only ever writes multiple choice exams
   * never grows a second row. The create is immediate, not debounced, which
   * makes creatingKind a real guard: UNIQUE (exam_id, kind) rejects the second
   * insert, so rapid toggling must not fire two.
   */
  const [creatingKind, setCreatingKind] = useState<SheetKind | null>(null)

  const switchTo = useCallback(
    async (kind: SheetKind) => {
      if (kind === activeKind) return
      const from = activeKind
      setActiveKind(kind)

      if (sheetIds.current[kind] || sheetsRef.current.some((s) => s.kind === kind)) return
      if (creatingKind || !activeId) return

      const meta = SHEET_KINDS.find((s) => s.kind === kind)
      setCreatingKind(kind)
      try {
        const created = await createTosSheet({
          exam_id: activeId,
          kind,
          label: meta?.label ?? kind,
          total: 20,
          position: SHEET_KINDS.findIndex((s) => s.kind === kind),
        })
        sheetIds.current[kind] = created.id
        setSheets((prev) =>
          prev.some((s) => s.kind === kind)
            ? prev
            : [...prev, { ...newSheet(kind), id: created.id }],
        )
        reportSaved()
      } catch (e) {
        // Nothing was written, so leave the tab that does exist rather than
        // showing an empty sheet that will not save.
        setActiveKind(from)
        fail(e, 'Could not create that blueprint sheet.')
      } finally {
        setCreatingKind(null)
      }
    },
    [activeId, activeKind, creatingKind, fail, reportSaved],
  )

  /**
 * Export carries the paper on screen, and only that one. The other sheet stays
 * in the database and can be exported by switching to it first.
 */
  const exportExcel = useCallback(async () => {
    try {
      await downloadTosExcel(exam, sheet)
    } catch (e) {
      fail(e, 'Could not build the Excel file.')
    }
  }, [exam, sheet, fail])

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
            <select
              className="input input--sm"
              value={exam.title}
              disabled={!ready || courses.length === 0}
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
            <span>Term</span>
            <select
              className="input input--sm"
              value={exam.term}
              disabled={!ready}
              onChange={(e) => patchExam({ term: e.target.value })}
            >
              <option value="">- select term -</option>
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

      {/* ---- which paper of the exam ---- */}
      {/* Navigation, not document content, so it does not print — the printed
          sheet is whichever paper is on screen. */}
      <div
        className="tos-tabs no-print"
        role="tablist"
        aria-label="Blueprint paper"
        onKeyDown={(e) => {
          // The tab pattern expects the arrow keys to move between tabs, with
          // Home and End jumping to the ends. Written generally so adding a
          // third paper later needs no change here.
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
          const exists = Boolean(sheetIds.current[kind]) || sheets.some((s) => s.kind === kind)
          const selected = sheet.kind === kind
          const creating = creatingKind === kind
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
              {creating ? (
                <span className="tos-tab__new">…</span>
              ) : (
                !exists && <span className="tos-tab__new">new</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ---- the blueprint ---- */}
      {/* Held read-only while a paper is being created: the tab can appear
          before its row exists, and an edit made in that gap would debounce
          into a null sheet id and drop silently. */}
      <TosSheetGrid
        sheet={sheet}
        header={{
          courseTitle: exam.title,
          term: exam.term,
          // Same line the exported workbook writes at A8.
          title: `Table of Specification${exam.examType.trim() ? ` for ${exam.examType.trim()}` : ''}${
            sheet.kind === 'items' ? ': Multiple Choice Type' : ''
          }`,
        }}
        issues={issues}
        editable={ready && !creatingKind}
        onPatchSheet={(patch) => patchSheet(activeKind, patch)}
        onPatchTopic={patchTopic}
        onSetBloom={setBloom}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onExportExcel={exportExcel}
        onReset={() => window.location.reload()}
      />
    </div>
  )
}
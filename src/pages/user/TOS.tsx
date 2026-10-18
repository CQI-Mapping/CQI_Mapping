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
  addActivityLog,
  fetchCourses,
  fetchPrograms,
  fetchTosExams,
  fetchTosSheets,
  fetchTosSheetsByExam,
  fetchTosTopics,
  replaceTosTopics,
  updateTosExam,
  updateTosSheet,
  type Course,
  type Program,
  type TosExamRow,
  type TosSheetRow,
} from '../../services/database'
import { supabase } from '../../utils/supabaseClient'
import { downloadTosExcel } from '../../utils/tosXlsx'
import Icon from '../../components/icons'
import TosBlueprintEditor from '../../components/TosBlueprintEditor'

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
 * The document's title line: "Table of Specification for Prelim: Multiple
 * Choice Type".
 *
 * Shared by the grid's header and the library panel's cards so a card is
 * titled exactly as its blueprint and its exported workbook are. Written once
 * here because it was already inline in the grid and is easy to drift the
 * moment a second place needs it.
 */
const docTitle = (examType: string, kind: SheetKind) =>
  `Table of Specification${examType.trim() ? ` for ${examType.trim()}` : ''}${
    kind === 'items' ? ': Multiple Choice Type' : ': Performance-Based Type'
  }`

/** Every paper an exam carries, as its own title line. */
const docTitlesFor = (examType: string, sheets: { kind: SheetKind }[]) =>
  sheets.length > 0 ? sheets.map((s) => docTitle(examType, s.kind)) : [docTitle(examType, 'items')]

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
  /**
   * True from the first keystroke until the write lands.
   *
   * Separate from `saving`, which is set at the same moment but is really
   * "an edit is in flight somewhere". The Save button needs the other question:
   * is there anything I have not written yet.
   */
  const [dirty, setDirty] = useState(false)
  /** Every blueprint this account owns, refreshed after each save. */
  const [examList, setExamList] = useState<TosExamRow[]>([])
  const [archived, setArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  /**
   * The card whose blueprint is open inline, or null.
   *
   * Only one at a time: each open card mounts a full editor with its own
   * pending writes, and two of those side by side is more DOM than the list
   * needs to carry. A single id rather than a set for that reason.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Each exam's papers, so a card can be titled the way its document is. */
  const [examSheets, setExamSheets] = useState<Record<string, TosSheetRow[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const sheetIds = useRef<Record<SheetKind, string | null>>({ items: null, points: null })
  const examTimer = useRef<number | null>(null)
  /**
   * True only for the blueprint this session auto-created on first visit.
   *
   * Creating an empty exam is a page-load side effect, not something the user
   * did, so it is not logged from the loader. It exists to let the first
   * debounced write in patchExam be recorded as tos_exam.created — the first
   * moment there is a code or title worth recording.
   */
  const createdThisSession = useRef(false)
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
    setDirty(false)
    setSavedAt(new Date().toLocaleTimeString())
    setError(null)
    // Re-read the list on every save so the panel below proves the write
    // landed. Declared below and reached through a ref to keep this callback's
    // identity stable for the debounced writers that depend on it.
    refreshListRef.current?.()
  }, [])

  // reportSaved() is a dependency of every debounced write, so it must not
  // depend on refreshList directly — that would rebuild all of them whenever
  // the list callback's identity changed.
  const refreshListRef = useRef<(() => void) | null>(null)

  /**
   * Write everything that is pending, right now.
   *
   * Every edit on this page autosaves on a 600ms debounce, so there is a window
   * after you stop typing where nothing has reached the database yet. This
   * cancels that window: each pending timer is cleared and its write is run
   * immediately against the current refs.
   *
   * It writes every sheet, not just the visible one. A pending topic change on
   * the paper you cannot see is still pending, and a Save button that silently
   * dropped it would be worse than having none.
   *
   * The write bodies are repeated rather than extracted, because each debounce
   * closure already carries its own `id` and `kind`. Sharing one helper across
   * all three call sites means threading those through, for a page this size
   * the duplication is cheaper than the indirection.
   */
  const saveNow = useCallback(async () => {
    if (!ready) return
    setSaving(true)
    setError(null)

    // Clear first, so a debounce that fires while this runs cannot start a
    // second, identical write after this one has already read the state.
    if (examTimer.current) {
      window.clearTimeout(examTimer.current)
      examTimer.current = null
    }
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

    const writes: Promise<void>[] = []

    if (activeId && exam) {
      writes.push(
        updateTosExam(activeId, {
          code: exam.code,
          title: exam.title,
          term: exam.term,
          prepared_by: exam.preparedBy,
          total_hours: num(exam.totalHours),
        }).then(() => undefined).catch((e) => fail(e, 'Could not save the exam details.')),
      )
    }

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
  }, [ready, exam, activeId, fail, reportSaved])

  // A failed write leaves the edit unsaved, so the pending marker must stay up.
  // setError already covers the diagnosis; this covers "your work is still
  // only on this screen".

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
          // Marks the next debounced write as the create. The exam exists at
          // this point, but it is empty and nothing has been typed, so there is
          // no code or title worth putting in the entry yet.
          createdThisSession.current = true
        }
        if (cancelled) return
        setActiveId(rows[0].id)
        await loadInto(rows[0])
        refreshListRef.current?.()
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

  /**
   * Refresh the saved-blueprints panel.
   *
   * Runs after every save so the panel is proof the write landed, which is the
   * whole point of having it: before, a successful save was indistinguishable
   * from a keystroke that had not yet been written.
   *
   * Both tabs are counted on every refresh, so the Archive tab can show how
   * many are hidden without a second round trip when it is opened.
   */
  const refreshList = useCallback(async () => {
    try {
      const [all, archivedRows] = await Promise.all([
        fetchTosExams('all'),
        fetchTosExams('archived'),
      ])
      // One extra query for every card's papers, rather than one per card.
      const sheets = await fetchTosSheetsByExam(all.map((r) => r.id))
      setExamList(all)
      setExamSheets(sheets)
      setArchivedCount(archivedRows.length)
    } catch {
      // A failed list must not take the editor down with it — the blueprint on
      // screen is the user's work and is unaffected.
    }
  }, [])

  // Wired here rather than making reportSaved depend on refreshList, which
  // would rebuild every debounced writer whenever the list callback changed.
  refreshListRef.current = refreshList

  /** Archive or restore, then re-read whichever tab is on screen. */
  const setExamStatus = useCallback(
    async (id: string, next: 'active' | 'archived') => {
      const row = examList.find((r) => r.id === id)
      try {
        await updateTosExam(id, { status: next })
        const all = await fetchTosExams('all')
        setExamList(all)
        setArchivedCount(all.filter((r) => r.status === 'archived').length)
        // Archive and restore are separate actions, not one "status changed",
        // so the log can tell which happened. Archiving a blueprint you are
        // editing underneath is worth recording.
        await addActivityLog(
          next === 'archived' ? 'tos_exam.archived' : 'tos_exam.restored',
          {
            entity: 'tos_exam',
            entity_id: id,
            label: [row?.code, row?.title].filter(Boolean).join(' — ') || 'Table of Specification',
          },
        )
      } catch (e) {
        fail(e, 'Could not change the blueprint status.')
      }
    },
    [examList, fail],
  )

  /** Open a different blueprint in the editor above. */
  const openExam = useCallback(
    async (row: TosExamRow) => {
      if (row.id === activeId) return
      if (dirty && !window.confirm('You have unsaved edits on this blueprint. Open another one and lose them?')) {
        return
      }
      setActiveId(row.id)
      await loadInto(row)
      setDirty(false)
      setSaving(false)
    },
    [activeId, dirty, loadInto],
  )

  /** Open a card's blueprint inline, or close the one that is open. */
  const toggleCardEdit = useCallback((row: TosExamRow) => {
    setEditingId((prev) => (prev === row.id ? null : row.id))
  }, [])

  const cancelCardEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  // The panel's tab decides which half of the list it shows, the same way the
  // Curriculum page's Active/Archive tabs do.
  const visibleExams = useMemo(
    () => examList.filter((r) => (archived ? r.status === 'archived' : r.status !== 'archived')),
    [examList, archived],
  )

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

  const afterEdit = useCallback(() => {
    setSaving(true)
    // `saving` alone cannot carry the Save button. It is set the moment a
    // keystroke lands and cleared when the write resolves, so it reads as
    // "saving" for the whole debounce window whether or not a request is
    // actually in flight. `dirty` is what the button asks about: is there an
    // edit that has not reached the database yet.
    setDirty(true)
  }, [])

  /**
   * Throw away edits that have not been saved and re-read the blueprint.
   *
   * This is what the old "Reset" button pretended to be. Reloading is not
   * enough on its own: the pending debounce timer would still fire and write
   * the discarded state straight back, so every timer is cancelled first.
   */
  const discardPending = useCallback(async () => {
    for (const kind of ['items', 'points'] as const) {
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

    setLoading(true)
    setError(null)
    try {
      const rows = await fetchTosExams()
      if (rows.length === 0) return
      setActiveId(rows[0].id)
      await loadInto(rows[0])
      setDirty(false)
      setSaving(false)
      setSavedAt(null)
    } catch (e) {
      fail(e, 'Could not reload the blueprint.')
    } finally {
      setLoading(false)
    }
  }, [loadInto, fail])

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
            // Debounced, so this fires once per burst of typing rather than per
            // keystroke. `created` covers the first write of a freshly
            // auto-created exam, which has no meaningful edit to describe.
            await addActivityLog(
              createdThisSession.current ? 'tos_exam.created' : 'tos_exam.updated',
              {
                entity: 'tos_exam',
                entity_id: activeId,
                label: [next.code, next.title].filter(Boolean).join(' — ') || 'Table of Specification',
              },
            )
            // Only the first save reports a create; every later one is an edit.
            createdThisSession.current = false
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
      // An export is the most defensible thing a blueprint page can be asked to
      // do — it is the point where the work leaves the app — so it is recorded
      // rather than treated as a read.
      await addActivityLog('tos_exam.exported', {
        entity: 'tos_exam',
        // The on-screen TosExam is the form's shape, not the row — it carries no
        // id. activeId is the row's primary key and the only id available here.
        entity_id: activeId ?? undefined,
        label: [exam?.code, exam?.title].filter(Boolean).join(' — ') || 'Table of Specification',
      })
    } catch (e) {
      fail(e, 'Could not build the Excel file.')
    }
  }, [exam, sheet, fail, activeId])

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
            {/* Labelled Semester, matching how the options actually read
                ("1st Semester, 2026-2027") and how the faculty says it. The
                column and the variable stay `term` — that is the stored name
                and the exported workbook's own wording. */}
            <span>Semester</span>
            <select
              className="input input--sm"
              value={exam.term}
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
            <span className="tos-savestate__error">
              {error}
              {/* Only when the exam row itself never loaded. The old test was
                  `ready === false`, and ready already includes `!error` -- so it
                  fired on *every* failure, appending a database diagnosis to
                  things like a failed Excel export, which is not one. */}
              {!loading && !activeId && ' — nothing is being saved. Check the database connection.'}
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
          title: docTitle(exam.examType, sheet.kind),
        }}
        issues={issues}
        editable={ready && !creatingKind}
        onPatchSheet={(patch) => patchSheet(activeKind, patch)}
        onPatchTopic={patchTopic}
        onSetBloom={setBloom}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onExportExcel={exportExcel}
        onSave={saveNow}
        saving={saving}
        dirty={dirty}
        onDiscard={discardPending}
      />

      {/* ---- saved blueprints ----
          The panel is the visible proof that a save landed. Before this, a
          successful write and a keystroke that had not yet been written looked
          identical, so "did that save?" had no answer on screen.

          It re-reads itself after every save rather than assuming success, so
          what is listed is what is actually in the database.

          Last on the page, below the blueprint it describes: the editor is the
          thing you came here to use, and the list is a record of what you have
          used. */}
      <div className="panel table-wrap tos-library no-print">
        <div className="program-toolbar">
          <div className="sd-tabs" style={{ marginBottom: 0, flex: 1 }}>
            <button
              className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`}
              onClick={() => setArchived(false)}
            >
              Active
            </button>
            <button
              className={`sd-tab ${archived ? 'sd-tab--active' : ''}`}
              onClick={() => setArchived(true)}
            >
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
        </div>

        <div className="resource-list">
          {visibleExams.length === 0 && (
            <div className="program-empty" style={{ marginTop: 14 }}>
              <strong>No {archived ? 'archived' : 'saved'} blueprints yet.</strong>
              <span>
                {archived
                  ? 'Archived blueprints stay here — nothing is deleted.'
                  : 'Name the blueprint above and press Save.'}
              </span>
            </div>
          )}

          {visibleExams.map((row) => (
            <div
              key={row.id}
              className={`resource-card ${
                row.status === 'archived' ? 'resource-card--archived' : ''
              } ${row.id === activeId ? 'resource-card--selected' : ''}`}
            >
              {editingId === row.id ? (
                /* The whole blueprint, editable in place — its own component
                   so its writes are scoped to this card rather than to whatever
                   is open at the top of the page. */
                <div className="resource-card__edit tos-card__expanded">
                  <div className="tos-card__editorhead">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={cancelCardEdit}
                      aria-label="Close this blueprint"
                      title="Close"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                  <TosBlueprintEditor
                    exam={row}
                    onSaved={refreshListRef.current ?? undefined}
                    onRenamed={(next) =>
                      setExamList((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, ...next } : r)),
                      )
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="resource-card__body">
                    {/* Mirrors the blueprint's own two header lines —
                        "Course Title: …" then the semester — so a card
                        identifies a blueprint the same way the document and
                        the exported workbook do.

                        The program used to head this card, because the
                        Program field is stored in `code` (see programOptions),
                        which read as a natural title and is not one. It is
                        context, so it moves down to the meta line. */}
                    <h4>
                      <span className="tos-card__label">Course Title:</span>{' '}
                      {row.title || 'No course title yet'}
                    </h4>
                    <p>{row.term || 'No semester set'}</p>
                    {/* The document's own title line, so the card, the
                        blueprint and the exported workbook all name the paper
                        the same way. */}
                    <p className="tos-card__doctitle">
                      {docTitlesFor(row.exam_type, examSheets[row.id] ?? [])
                        .join(' · ')}
                    </p>
                    <div className="resource-card__meta">
                      <span className={`status-badge status-badge--${row.status}`}>{row.status}</span>
                      {row.code && <span>{row.code}</span>}
                      <span>{row.total_hours} hrs</span>
                      <span>
                        {new Date(row.updated_at).toLocaleString()}
                        {row.id === activeId && dirty ? ' · edited' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="resource-card__actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => toggleCardEdit(row)}
                      aria-label={`Edit ${row.code || row.title || 'blueprint'}`}
                      title="Edit"
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    {row.id !== activeId && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => openExam(row)}
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setExamStatus(row.id, row.status === 'archived' ? 'active' : 'archived')}
                    >
                      {row.status === 'archived' ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
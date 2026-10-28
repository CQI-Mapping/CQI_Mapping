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
  deleteTosExam,
  fetchCourses,
  fetchPrograms,
  fetchTosExam,
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
} from '../../utils/tosOptions'
import Icon from '../../components/icons'
import TosBlueprintEditor from '../../components/TosBlueprintEditor'
import PageBanner from '../../components/PageBanner'

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
 * Choice Type". The exam type is now picked from a dropdown, so the "for ..."
 * clause varies with the choice.
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
/** Archived rows stay in the database but out of a new pick. */
const isActive = <T extends { status?: string }>(x: T) => !x.status || x.status === 'active'

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
    examType: 'Prelim',
    semester: '',
    schoolYear: '',
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
    setError(describeTosError(e, fallback))
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
   * Stop every debounced write that has not run yet.
   *
   * saveNow calls it before flushing the writes by hand, discardPending before
   * re-reading the row, and syncTop before the top editor re-reads what a card
   * editor has just written to the same row — in each case, a timer firing
   * afterwards would write back values the caller has already replaced.
   */
  const cancelPendingWrites = useCallback(() => {
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
  }, [])

  /**
   * Write everything that is pending, then file the blueprint as its own card
   * and hand the editor a fresh blank draft.
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
   * Once those writes land, the save proper begins: anything typed — a course
   * title, a semester, a single topic row — makes what is on screen a finished
   * blueprint, so the editor is pointed at a new empty row the way the first
   * visit is. The blueprint just saved keeps its place in the list below; this
   * is how one press of Save adds one card without disturbing the others.
   *
   * A draft with nothing in it is not filed again: Save then only flushes and
   * reports, because an empty exam is already sitting in the database and
   * saving has to keep it that way rather than stack a second one.
   *
   * A failed write aborts before any of that: the editor stays on the draft as
   * it stands and the pending marker stays up — a hiccup must never wipe the
   * form the user filled, nor file half of it.
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
    cancelPendingWrites()

    const writes: Promise<void>[] = []

    if (activeId && exam) {
      writes.push(
        updateTosExam(activeId, {
          code: exam.code,
          title: exam.title,
          exam_type: exam.examType,
          // An unselected semester or year is stored as NULL, not '' — the
          // UNIQUE key covers both columns, and two drafts both storing ''
          // would be duplicate keys. Postgres treats NULLs as distinct, so
          // successive empty drafts never collide. The NOT NULL `term`
          // recomposes only from a real selection; writing '' instead keeps a
          // legacy row's last term from outliving a cleared dropdown.
          term: exam.semester || exam.schoolYear ? composeTerm(exam.semester, exam.schoolYear) : '',
          semester: exam.semester || null,
          school_year: exam.schoolYear || null,
          prepared_by: exam.preparedBy,
          total_hours: num(exam.totalHours),
        })
          .then(() => undefined)
          .catch((e) => {
            fail(e, 'Could not save the exam details.')
            throw e
          }),
      )
    }

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

    // allSettled rather than all: every write gets to finish so a second
    // failure is diagnosed too, and one rejection must not turn the results
    // the rest carry into an unhandled throw.
    const results = await Promise.allSettled(writes)
    if (results.some((r) => r.status === 'rejected')) {
      // Back out with the form as the user left it — the pending marker stays
      // up because dirty was never cleared.
      setSaving(false)
      return
    }

    // Anything typed — a course title, a semester, a single topic row — makes
    // this a blueprint worth keeping as it was just written, and the editor
    // moves to a fresh row. A completely untouched draft skips this: Save on
    // an empty form has no second empty form to file.
    const hasContent =
      Boolean(exam.code || exam.title || exam.semester || exam.schoolYear) ||
      sheetsRef.current.some((s) => s.topics.length > 0)

    if (hasContent) {
      try {
        // The same two inserts the first-visit loader makes: an empty exam
        // row, then its multiple choice sheet. A fresh draft is the same
        // arrangement reached through Save instead of a page load.
        const created = await createTosExam(
          {
            code: '',
            title: '',
            exam_type: 'Prelim',
            term: '',
            semester: null,
            school_year: null,
            total_hours: 8,
          },
          await currentUserId(),
        )
        const itemsSheet = await createTosSheet({
          exam_id: created.id,
          kind: 'items',
          label: 'Multiple Choice',
          total: 20,
          position: 0,
        })
        sheetIds.current = { items: itemsSheet.id, points: null }
        // The first debounced write on this row is its first edit, and a row
        // with nothing typed has nothing worth logging — the same arrangement
        // the first-visit loader relies on.
        createdThisSession.current = true
        setActiveId(created.id)
        setActiveKind('items')
        setSheets([{ ...blankSheet(), id: itemsSheet.id }])
        setExam({
          code: '',
          title: '',
          examType: 'Prelim',
          semester: '',
          schoolYear: '',
          preparedBy: '',
          totalHours: 8,
        })
      } catch (e) {
        // The flush landed — the blueprint just saved is already its card —
        // but the next draft could not be started. Stay on the saved work
        // rather than a row that may not exist.
        fail(e, 'The blueprint saved, but starting the next blank one failed.')
        setSaving(false)
        return
      }
    }

    reportSaved()
  }, [ready, exam, activeId, cancelPendingWrites, fail, reportSaved])

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
    const split = splitTerm(row.term)
    setExam({
      code: row.code,
      title: row.title,
      examType: row.exam_type,
      semester: row.semester ?? split.semester,
      schoolYear: row.school_year ?? split.schoolYear,
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
          // The draft starts with everything blank. The semester and year are
          // stored as NULL rather than '' because UNIQUE (user_id, code,
          // exam_type, semester, school_year) decides this table's equality:
          // Postgres reads NULLs as distinct from everything, including each
          // other, so a later blank draft saved beside this one is a new row
          // and not a duplicate-key error. The NOT NULL term follows suit with
          // '' -- composed from nothing, equal to nothing worth showing.
          const created = await createTosExam(
            {
              code: '',
              title: '',
              exam_type: 'Prelim',
              term: '',
              semester: null,
              school_year: null,
              total_hours: 8,
            },
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

  /**
   * Bring the top editor back in step with the row it has open, after the
   * card editor for that same row has written to the database.
   *
   * Since Save started handing the editor its own fresh draft, the row open at
   * the top is also a card in the list below, so one blueprint can have two
   * editors on screen. The card's writes land straight in the database; the
   * top editor's form would otherwise keep whatever it held before them — and
   * its next debounced write would file those stale values back over the
   * card's work, which is how a blueprint you just filled ends up reading
   * empty again. Re-reading the row keeps the two from contradicting each
   * other: one row, one truth, whichever editor wrote to it last.
   *
   * Skipped while the top editor itself has unsaved edits: the user is
   * typing there, and their values are newer than the card's for the fields
   * they touched. Reloading would yank the text out from under the cursor.
   */
  const syncTop = useCallback(
    async (id: string) => {
      if (id !== activeId || dirty) return
      cancelPendingWrites()
      try {
        const row = await fetchTosExam(id)
        await loadInto(row)
        setDirty(false)
        setSaving(false)
      } catch (e) {
        fail(e, 'Could not bring the editor above up to date with the card changes.')
      }
    },
    [activeId, dirty, cancelPendingWrites, loadInto, fail],
  )

  /** Open a card's blueprint inline, or close the one that is open. */
  const toggleCardEdit = useCallback((row: TosExamRow) => {
    setEditingId((prev) => (prev === row.id ? null : row.id))
  }, [])

  const cancelCardEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  /**
   * Delete a library blueprint outright — archive is the soft path, this is
   * the hard one. The row's papers and its topics belong to it, so one delete
   * clears the whole document.
   *
   * When the blueprint being deleted is the one open in the editor above, the
   * debounced writers have to stand down first: a cleared row would eat the
   * next pending write and squawk a save error for a document that no longer
   * exists. So the timers are dropped and the editor is parked on the next
   * exam (or an empty form when none is left) before the delete lands.
   */
  const deleteExam = useCallback(
    async (row: TosExamRow) => {
      if (
        !window.confirm(
          'Delete this blueprint permanently? Its papers and topics are removed with it, and this cannot be undone.',
        )
      )
        return
      try {
        if (row.id === activeId) {
          cancelPendingWrites()
          // Park on the next active exam, or an empty form when none remains.
          // Not a fresh auto-created row: deleting the last blueprint is a
          // cleanup, not the setup for a new one.
          const remaining = examList.filter((r) => r.id !== row.id && r.status !== 'archived')
          if (remaining.length > 0) {
            setActiveId(remaining[0].id)
            await loadInto(remaining[0])
          } else {
            setActiveId('')
            setSheets([blankSheet()])
            setExam((e) => ({
              ...e,
              code: '',
              title: '',
              semester: '',
              schoolYear: '',
              preparedBy: '',
            }))
            createdThisSession.current = false
          }
          setDirty(false)
          setSaving(false)
        }
        await deleteTosExam(row.id)
        await addActivityLog('tos_exam.deleted', {
          entity: 'tos_exam',
          entity_id: row.id,
          label: [row.code, row.title].filter(Boolean).join(' — ') || 'Table of Specification',
        })
        await refreshList()
      } catch (e) {
        fail(e, 'Could not delete the blueprint.')
      }
    },
    [activeId, examList, loadInto, refreshList, fail],
  )

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
    () => programIdForLabel(programs, exam.code),
    [programs, exam.code],
  )

  // Built by the shared helpers so the page and an expanded card offer the same
  // lists; see utils/tosOptions.ts for why an unmatched saved value is kept.
  const programOptions = useMemo(
    () => buildProgramOptions(programs, exam.code),
    [programs, exam.code],
  )

  const courseOptions = useMemo(
    () => buildCourseOptions(courses, selectedProgramId, exam.title),
    [courses, selectedProgramId, exam.title],
  )

  const semesterOptions = useMemo(() => buildSemesterOptions(exam.semester), [exam.semester])
  const schoolYearOptions = useMemo(() => buildSchoolYearOptions(exam.schoolYear), [
    exam.schoolYear,
  ])
  const examTypeOptions = useMemo(() => buildExamTypeOptions(exam.examType), [exam.examType])

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
    cancelPendingWrites()

    setLoading(true)
    setError(null)
    try {
      // Reload the row the editor has open, not whatever the list says is
      // newest: with every Save starting a fresh draft, the newest row and
      // the open one are the same only until another card is touched.
      if (!activeId) return
      const row = await fetchTosExam(activeId)
      await loadInto(row)
      setDirty(false)
      setSaving(false)
      setSavedAt(null)
    } catch (e) {
      fail(e, 'Could not reload the blueprint.')
    } finally {
      setLoading(false)
    }
  }, [activeId, cancelPendingWrites, loadInto, fail])

  const patchExam = useCallback(
    (patch: Partial<TosExam>) => {
      setExam((prev) => {
        const next = { ...prev, ...patch }
        if (examTimer.current) window.clearTimeout(examTimer.current)
        examTimer.current = window.setTimeout(async () => {
          if (!activeId) return
          try {
            // Same NULL-not-'' rule saveNow uses: blank dropdowns store NULL,
            // so successive empty drafts can never collide on the UNIQUE key,
            // and the stored term vanishes with them instead of sticking.
            await updateTosExam(activeId, {
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
      {/* Screen-only page banner; the document's own letterhead follows. */}
      <PageBanner title="Generate TOS" sub="Build the table of specifications for every exam you write." />

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
            <span>Table of Specification for</span>
            <select
              className="input input--sm"
              value={exam.examType}
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
                value={exam.semester}
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
                value={exam.schoolYear}
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
          term: composeTerm(exam.semester, exam.schoolYear),
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
        // This is not the flush the tooltip defaults to: saveNow commits the
        // blueprint and starts the next draft, so the button says what it does.
        saveTitle="Save this blueprint and start a blank one for the next"
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
                    onSaved={() => {
                      refreshListRef.current?.()
                      /* When the card being edited IS the blueprint the top
                         editor has open, the top editor must not be left
                         holding its older copy of the row — re-read it, or
                         its next debounced write would undo the card's. */
                      if (row.id === activeId) void syncTop(row.id)
                    }}
                    onRenamed={(next) =>
                      setExamList((prev) =>
                        prev.map((r) =>
                          r.id === row.id
                            ? {
                                ...r,
                                code: next.code,
                                title: next.title,
                                exam_type: next.examType,
                                semester: next.semester,
                                school_year: next.schoolYear,
                                term: composeTerm(next.semester, next.schoolYear),
                                total_hours: next.total_hours,
                              }
                            : r,
                        ),
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
                    <p>
                      {row.semester || row.school_year
                        ? composeTerm(row.semester ?? '', row.school_year ?? '')
                        : row.term || 'No semester set'}
                    </p>
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
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => deleteExam(row)}
                      aria-label={`Delete ${row.code || row.title || 'blueprint'}`}
                      title="Delete"
                    >
                      <Icon name="trash" size={13} />
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
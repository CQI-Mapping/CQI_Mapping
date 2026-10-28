// Table of Specification workspace.
//
// The TOS is built first and the exam is written to match it, so this page is
// closer to a spreadsheet than a viewer: you type in the green cells, and the
// gray formula cells — the hour-weighted "Number of Item" column, the header
// percentages, the column totals — recompute as you go. The layout follows the
// faculty's workbook, green for inputs and gray for formulas.
//
// Persistence has one rule: the editor at the top is a draft, and a draft is
// not in the database until Save is pressed. Nothing is created on page load —
// the draft lives in local state, mirrored to localStorage so a refresh costs
// nothing — and Save files the whole thing as one blueprint: the exam row, its
// papers, their topics. Saved blueprints are then edited on their own cards in
// the panel below, which autosave as they are typed into. One writer per
// blueprint means the two can never disagree about what is stored.
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
  fetchTosExams,
  fetchTosSheetsByExam,
  replaceTosTopics,
  updateTosExam,
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
  programIdForLabel,
} from '../../utils/tosOptions'
import Icon from '../../components/icons'
import TosBlueprintEditor from '../../components/TosBlueprintEditor'
import PageBanner from '../../components/PageBanner'

/**
 * Where the unsaved draft is mirrored, so a refresh or a closed tab does not
 * cost the user their typing. Versioned, so a change to the draft's shape
 * cannot resurrect something saved by an older build of the page.
 */
const DRAFT_KEY = 'cqic.tos.draft.v1'

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

/** A blank exam: identity left for the user to fill in. */
const blankExam = (): TosExam => ({
  code: '',
  title: '',
  examType: 'Prelim',
  semester: '',
  schoolYear: '',
  preparedBy: '',
  totalHours: 8,
})

/** A blank draft: the exam above, plus one empty multiple choice sheet. */
const blankSheet = (): TosSheet => ({
  id: '',
  kind: 'items',
  label: 'Multiple Choice',
  total: 20,
  note: '',
  topics: [],
})

/**
 * A second paper, added locally when its tab is first opened.
 *
 * tos_sheets.total is NOT NULL CHECK (total > 0), so the sheet cannot start at
 * zero. 20 matches the multiple choice default; a performance sheet is seeded
 * the same way and edited from there.
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

/**
 * The draft a previous visit left behind, if there is one.
 *
 * Deliberately sceptical: storage can hold anything, and the page must open on
 * a blank draft rather than crash because a half-written object came back.
 * Anything unreadable, incomplete, or empty restores as nothing, and the blank
 * draft the state initialisers fall back to takes over.
 */
const readDraft = (): { exam: TosExam; sheets: TosSheet[]; activeKind: SheetKind } | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      exam?: Partial<TosExam>
      sheets?: TosSheet[]
      activeKind?: SheetKind
    }
    if (!parsed.exam || !Array.isArray(parsed.sheets) || parsed.sheets.length === 0) return null
    return {
      exam: { ...blankExam(), ...parsed.exam },
      sheets: parsed.sheets,
      activeKind: parsed.activeKind ?? 'items',
    }
  } catch {
    return null
  }
}

export default function TOS() {
  // The draft, restored from localStorage when a previous visit left one.
  // Each initialiser reads once at mount, so the three come back consistent
  // with whatever was last written together.
  const [exam, setExam] = useState<TosExam>(() => readDraft()?.exam ?? blankExam())
  const [sheets, setSheets] = useState<TosSheet[]>(() => readDraft()?.sheets ?? [blankSheet()])
  const [activeKind, setActiveKind] = useState<SheetKind>(
    () => readDraft()?.activeKind ?? 'items',
  )
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /**
   * True from the first keystroke until Save files the draft.
   *
   * Separate from `saving`, which is true only while the Save request itself
   * is in flight. `dirty` is what the Save button's pending marker asks
   * about: is there anything on screen the library does not hold yet.
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

  // Reached through a ref so the card editors' onSaved does not have to change
  // identity whenever refreshList does.
  const refreshListRef = useRef<(() => void) | null>(null)

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

  const issues = useMemo(() => validateSheet(sheet, exam.totalHours), [sheet, exam.totalHours])

  /**
   * Editing the draft is safe at any time — nothing writes as you type. The
   * gate exists for the first read of the library and for failures, so an
   * error sits visibly instead of being buried under more typing.
   */
  const ready = !loading && !error

  const fail = useCallback((e: unknown, fallback: string) => {
    setError(describeTosError(e, fallback))
  }, [])

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
      // A failed list must not take the editor down with it — the draft on
      // screen is the user's work and is unaffected.
    }
  }, [])

  // Wired here rather than handing the card editors a dependency on
  // refreshList's identity.
  refreshListRef.current = refreshList

  // On load: read the library once, then release the form. The editor opens on
  // the draft — restored from localStorage when one was left behind — and
  // creates nothing: an account with no saved blueprints shows an empty panel
  // and a blank editor, and no row is born until Save is pressed.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await refreshList()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshList])

  // The draft is mirrored to localStorage on every change, so a refresh or an
  // accidental tab close costs nothing. Clearing needs no separate step: a
  // save or a discard resets this state, and the blank draft that follows
  // overwrites what was stored through this same effect.
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ exam, sheets, activeKind }))
    } catch {
      // Storage can be unavailable (private mode, quota). The draft still
      // works; it just does not survive a refresh.
    }
  }, [exam, sheets, activeKind])

  /**
   * Save the draft: everything on screen becomes one saved blueprint.
   *
   * The top editor is not a database row — nothing here writes as you type.
   * Save is the single write: the exam row is created with the header as
   * typed, then every paper the draft carries is created with its topics, in
   * tab order. When it all lands, the library grows by one card at its bottom
   * and the editor hands over a fresh blank draft.
   *
   * A draft with nothing in it has nothing to file; Save says so and leaves
   * the form alone rather than stacking an empty card.
   *
   * A failure keeps the draft exactly as it stands — nothing is wiped, nothing
   * is half-filed, the pending marker stays up, and pressing Save again retries
   * the whole thing. A duplicate header (same program, course, exam type,
   * semester and school year as a blueprint already filed) is rejected by the
   * UNIQUE key and explained in plain words by describeTosError: edit that
   * blueprint's card instead of saving a second one.
   */
  const saveNow = useCallback(async () => {
    if (!ready) return
    setSaving(true)
    setError(null)

    const hasContent =
      Boolean(exam.code || exam.title || exam.semester || exam.schoolYear) ||
      sheets.some((s) => s.topics.length > 0)

    if (!hasContent) {
      setSaving(false)
      setError('Nothing to save yet — choose a program or course, or add a topic row first.')
      return
    }

    // tos_sheets.total is CHECK (total > 0); a paper left at zero would reject
    // the whole save with a raw database message. Said here, it names the paper.
    const badTotal = sheets.find((s) => num(s.total) <= 0)
    if (badTotal) {
      setSaving(false)
      setError(
        `The ${badTotal.label.toLowerCase()} paper needs a total above zero before this blueprint can be saved.`,
      )
      return
    }

    try {
      const created = await createTosExam(
        {
          code: exam.code,
          title: exam.title,
          exam_type: exam.examType,
          // An unselected semester or year is stored as NULL, not '' — the
          // UNIQUE key covers both columns, and NULLs never equal each other,
          // so a header-less blueprint never collides with another. `term`
          // recomposes only from a real selection; '' keeps nothing stale.
          term: exam.semester || exam.schoolYear ? composeTerm(exam.semester, exam.schoolYear) : '',
          semester: exam.semester || null,
          school_year: exam.schoolYear || null,
          prepared_by: exam.preparedBy,
          total_hours: num(exam.totalHours),
        },
        await currentUserId(),
      )

      for (const s of sheets) {
        const createdSheet = await createTosSheet({
          exam_id: created.id,
          kind: s.kind,
          label: s.label,
          total: num(s.total),
          position: SHEET_KINDS.findIndex((k) => k.kind === s.kind),
        })
        if (s.topics.length > 0) {
          await replaceTosTopics(
            createdSheet.id,
            s.topics.map((t) => ({
              // No ids sent: these are fresh rows on a fresh sheet, and
              // replaceTosTopics numbers positions from the array's order.
              title: t.title,
              slo: t.slo,
              hours: num(t.hours),
              bloom: t.bloom,
            })),
          )
        }
      }

      // A create is what just happened, unlike the card editors' writes, which
      // log updates: this blueprint did not exist until this press of Save.
      await addActivityLog('tos_exam.created', {
        entity: 'tos_exam',
        entity_id: created.id,
        label: [exam.code, exam.title].filter(Boolean).join(' — ') || 'Table of Specification',
      })

      // Filed. The editor starts the next draft; the library re-reads so the
      // card is there to prove it.
      setSheets([blankSheet()])
      setExam(blankExam())
      setActiveKind('items')
      setDirty(false)
      setSaving(false)
      setSavedAt(new Date().toLocaleTimeString())
      refreshListRef.current?.()
    } catch (e) {
      fail(e, 'Could not save the blueprint.')
      setSaving(false)
    }
  }, [ready, exam, sheets, fail])

  /**
   * Throw the draft away and start blank.
   *
   * Nothing here was ever in the database, so discarding means the whole
   * draft — hence the confirm: there is no saved copy to fall back on.
   */
  const discardDraft = useCallback(() => {
    if (!window.confirm('Throw away this draft? Nothing in it has been saved yet.')) return
    setSheets([blankSheet()])
    setExam(blankExam())
    setActiveKind('items')
    setDirty(false)
    setSaving(false)
    setSavedAt(null)
    setError(null)
  }, [])

  // ---- draft editing ---------------------------------------------------

  // Every edit updates local state only and raises the pending marker; the
  // database hears about none of it until Save is pressed.

  const afterEdit = useCallback(() => {
    setDirty(true)
  }, [])

  const patchExam = useCallback(
    (patch: Partial<TosExam>) => {
      setExam((prev) => ({ ...prev, ...patch }))
      afterEdit()
    },
    [afterEdit],
  )

  const patchSheet = useCallback(
    (kind: SheetKind, patch: Partial<TosSheet>) => {
      setSheets((prev) => prev.map((s) => (s.kind === kind ? { ...s, ...patch } : s)))
      afterEdit()
    },
    [afterEdit],
  )

  const setTopics = useCallback(
    (kind: SheetKind, next: TosTopic[]) => {
      setSheets((prev) => prev.map((s) => (s.kind === kind ? { ...s, topics: next } : s)))
      afterEdit()
    },
    [afterEdit],
  )

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

  // ---- switching papers ------------------------------------------------

  /**
   * The performance sheet joins the draft the first time its tab is opened —
   * locally, like every draft edit. It reaches the database when Save files
   * the whole blueprint, so an account that only ever writes multiple choice
   * exams never grows a second sheet row either.
   */
  const switchTo = useCallback((kind: SheetKind) => {
    setActiveKind(kind)
    setSheets((prev) =>
      prev.some((s) => s.kind === kind) ? prev : [...prev, newSheet(kind)],
    )
  }, [])

  /**
   * Export carries the paper on screen, and only that one. The other sheet
   * stays in the draft and can be exported by switching to it first.
   */
  const exportExcel = useCallback(async () => {
    try {
      await downloadTosExcel(exam, sheet)
      // An export is the most defensible thing a blueprint page can be asked to
      // do — it is the point where the work leaves the app — so it is recorded
      // rather than treated as a read. A draft export has no row to point at
      // yet, so the entry carries no entity id.
      await addActivityLog('tos_exam.exported', {
        entity: 'tos_exam',
        label: [exam?.code, exam?.title].filter(Boolean).join(' — ') || 'Table of Specification',
      })
    } catch (e) {
      fail(e, 'Could not build the Excel file.')
    }
  }, [exam, sheet, fail])

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
        // so the log can tell which happened.
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
   * clears the whole document. The editor at the top is a draft of its own and
   * holds no copy of this row, so a delete never has to touch it.
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
    [refreshList, fail],
  )

  // The panel's tab decides which half of the list it shows, the same way the
  // Curriculum page's Active/Archive tabs do.
  const visibleExams = useMemo(
    () => examList.filter((r) => (archived ? r.status === 'archived' : r.status !== 'archived')),
    [examList, archived],
  )

  // ---- picker options ---------------------------------------------------

  // The picker lists are auxiliary: the blueprint is fully usable without them,
  // so a failed read degrades to an empty dropdown instead of locking the page.
  // allSettled keeps one dead table from taking the other down with it. Only
  // active rows are offered.
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
            <span className="tos-savestate__error">{error}</span>
          ) : loading ? (
            <span>Loading…</span>
          ) : saving ? (
            <span>Saving…</span>
          ) : dirty ? (
            /* The draft's own state, distinct from the last save's timestamp:
                this says there is work on screen the library does not hold. */
            <span>Draft — not saved yet</span>
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
          const exists = sheets.some((s) => s.kind === kind)
          const selected = sheet.kind === kind
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`tos-tab${selected ? ' tos-tab--on' : ''}`}
              disabled={!ready}
              onClick={() => switchTo(kind)}
            >
              {label}
              {!exists && <span className="tos-tab__new">new</span>}
            </button>
          )
        })}
      </div>

      {/* ---- the draft ---- */}
      <TosSheetGrid
        sheet={sheet}
        header={{
          courseTitle: exam.title,
          term: composeTerm(exam.semester, exam.schoolYear),
          // Same line the exported workbook writes at A8.
          title: docTitle(exam.examType, sheet.kind),
        }}
        issues={issues}
        editable={ready}
        onPatchSheet={(patch) => patchSheet(activeKind, patch)}
        onPatchTopic={patchTopic}
        onSetBloom={setBloom}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onExportExcel={exportExcel}
        onSave={saveNow}
        saving={saving}
        dirty={dirty}
        onDiscard={discardDraft}
        // This is not the flush the tooltip defaults to: Save files the whole
        // draft as one blueprint and starts the next, so the button says so.
        saveTitle="Save this blueprint into the library and start a blank draft"
        discardTitle="Throw away this draft — nothing in it has been saved yet"
      />

      {/* ---- saved blueprints ----
          The panel is the visible proof that a save landed. Before this, a
          successful write and a keystroke that had not yet been written looked
          identical, so "did that save?" had no answer on screen.

          It re-reads itself after every save rather than assuming success, so
          what is listed is what is actually in the database. Cards file oldest
          first, so each new blueprint appends at the bottom.

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
                  : 'Fill in the blueprint above and press Save.'}
              </span>
            </div>
          )}

          {visibleExams.map((row) => (
            <div
              key={row.id}
              className={`resource-card ${
                row.status === 'archived' ? 'resource-card--archived' : ''
              }`}
            >
              {editingId === row.id ? (
                /* The whole blueprint, editable in place — its own component
                   so its writes are scoped to this card. This is the only
                   editor a saved blueprint has. */
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
                      <span>{new Date(row.updated_at).toLocaleString()}</span>
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

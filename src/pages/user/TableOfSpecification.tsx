// Table of Specification workspace.
//
// The TOS is built first and the exam is written to match it, so this page is
// closer to a spreadsheet than a viewer. It opens on the IT21 Prelim blueprint
// the faculty authored, laid out exactly like their workbook: you type in the
// green cells, and the gray formula cells — the hour-weighted "Number of Item"
// column, the header percentages, the column totals — recompute as you go.
//
// State is local React only for now; a refresh discards edits. The intended
// next step is Supabase persistence (tos_exams / tos_sheets / tos_topics under
// RLS scoped to the signed-in user), which is why the data lives in
// tosSampleData.ts rather than inline here: that file becomes the seed and the
// useState becomes a fetch, with no change to TosSheetGrid or tosMath.

import { useCallback, useMemo, useState } from 'react'
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
import { TOS_EXAM_META, TOS_SHEETS } from '../../utils/tosSampleData'

/** A deep enough copy that editing topics never mutates the sample constant. */
const freshSheets = (): TosSheet[] =>
  TOS_SHEETS.map((s) => ({
    ...s,
    topics: s.topics.map((t) => ({ ...t, bloom: { ...t.bloom } })),
  }))

export default function TableOfSpecification() {
  const [exam, setExam] = useState<TosExam>(() => ({ ...TOS_EXAM_META }))
  const [sheets, setSheets] = useState<TosSheet[]>(freshSheets)
  const [activeId] = useState(TOS_SHEETS[0].id)

  const sheet = useMemo(
    () => sheets.find((s) => s.id === activeId) ?? sheets[0],
    [sheets, activeId],
  )

  const issues = useMemo(() => validateSheet(sheet, exam.totalHours), [sheet, exam.totalHours])

  const patchExam = useCallback((patch: Partial<TosExam>) => {
    setExam((prev) => ({ ...prev, ...patch }))
  }, [])

  const patchSheet = useCallback((patch: Partial<TosSheet>) => {
    setSheets((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, ...patch } : s)),
    )
  }, [activeId])

  // ---- topic editing -------------------------------------------------

  const replaceSheet = useCallback(
    (topics: TosTopic[]) => {
      setSheets((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, topics } : s)),
      )
    },
    [activeId],
  )

  const patchTopic = useCallback(
    (id: string, patch: { title?: string; slo?: string; hours?: number }) => {
      replaceSheet(
        sheet.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
    },
    [sheet.topics, replaceSheet],
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
      replaceSheet(sheet.topics.map((t) => (t.id === topicId ? { ...t, bloom } : t)))
    },
    [sheet.topics, replaceSheet],
  )

  const addTopic = useCallback(() => {
    replaceSheet([...sheet.topics, blankTopic(sheet.topics.length + 1)])
  }, [sheet.topics, replaceSheet])

  const removeTopic = useCallback(
    (id: string) => {
      replaceSheet(renumber(sheet.topics.filter((t) => t.id !== id)))
    },
    [sheet.topics, replaceSheet],
  )

  const moveTopic = useCallback(
    (id: string, delta: number) => {
      const topics = [...sheet.topics]
      const index = topics.findIndex((t) => t.id === id)
      const target = index + delta
      if (index < 0 || target < 0 || target >= topics.length) return
      const [moved] = topics.splice(index, 1)
      topics.splice(target, 0, moved)
      replaceSheet(renumber(topics))
    },
    [sheet.topics, replaceSheet],
  )

  return (
    <div className="syllabus-doc">
      {/* ---- exam header ---- */}
      <div className="panel tos-panel no-print">
        <div className="tos-field-grid">
          <label className="field">
            <span>Course code</span>
            <input
              className="input input--sm"
              value={exam.code}
              onChange={(e) => patchExam({ code: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Course title</span>
            <input
              className="input input--sm"
              value={exam.title}
              onChange={(e) => patchExam({ title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Exam type</span>
            <input
              className="input input--sm"
              value={exam.examType.replace(/^Table of Specification for\s+/i, '')}
              onChange={(e) =>
                patchExam({ examType: `Table of Specification for ${e.target.value}` })
              }
            />
          </label>
          <label className="field">
            <span>Term</span>
            <input
              className="input input--sm"
              value={exam.term}
              onChange={(e) => patchExam({ term: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* ---- the blueprint ---- */}
      <TosSheetGrid
        exam={exam}
        sheet={sheet}
        issues={issues}
        editable
        onPatchExam={patchExam}
        onPatchSheet={patchSheet}
        onPatchTopic={patchTopic}
        onSetBloom={setBloom}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onMoveTopic={moveTopic}
      />
    </div>
  )
}
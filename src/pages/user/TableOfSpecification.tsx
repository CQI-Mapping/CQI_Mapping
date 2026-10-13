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
  BLOOM_DESCRIPTIONS,
  BLOOM_LABELS,
  BLOOM_LEVELS,
  bloomTotals,
  blankTopic,
  fmt,
  num,
  placedTotal,
  renumber,
  shares,
  totalHours,
  validateSheet,
  type BloomLevel,
  type TosExam,
  type TosSheet,
  type TosTopic,
} from '../../utils/tosMath'
import { TOS_EXAM_META, TOS_SHEETS } from '../../utils/tosSampleData'

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

/** A deep enough copy that editing topics never mutates the sample constant. */
const freshSheets = (): TosSheet[] =>
  TOS_SHEETS.map((s) => ({
    ...s,
    topics: s.topics.map((t) => ({ ...t, bloom: { ...t.bloom } })),
  }))

export default function TableOfSpecification() {
  const [exam, setExam] = useState<TosExam>(() => ({ ...TOS_EXAM_META }))
  const [sheets, setSheets] = useState<TosSheet[]>(freshSheets)
  const [activeId, setActiveId] = useState(TOS_SHEETS[0].id)
  const [editMode, setEditMode] = useState(true)
  const [showGuide, setShowGuide] = useState(false)

  const sheet = useMemo(
    () => sheets.find((s) => s.id === activeId) ?? sheets[0],
    [sheets, activeId],
  )

  const totals = useMemo(() => bloomTotals(sheet.topics), [sheet])
  const share = useMemo(() => shares(sheet.topics, sheet.total), [sheet, sheet.topics])
  const hours = useMemo(() => totalHours(sheet.topics), [sheet])
  const placed = useMemo(() => placedTotal(sheet.topics), [sheet])
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

  const unit = sheet.kind === 'points' ? 'points' : 'items'
  const singular = sheet.kind === 'points' ? 'Point' : 'Item'

  return (
    <div className="syllabus-doc">
      {/* ---- toolbar ---- */}
      <div className="syllabus-doc__toolbar no-print">
        <span className="syllabus-doc__meta">
          {exam.code} &middot; {exam.term}
        </span>
        <div className="sd-toolbar-controls">
          <button
            type="button"
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
          >
            {editMode ? 'Done editing' : 'Edit'}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>
      </div>

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
          <label className="field">
            <span>Total hours</span>
            <input
              className="input input--sm"
              type="number"
              min="0"
              step="0.5"
              value={exam.totalHours}
              onChange={(e) => patchExam({ totalHours: num(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Prepared by</span>
            <input
              className="input input--sm"
              value={exam.preparedBy}
              onChange={(e) => patchExam({ preparedBy: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          <span>Coverage</span>
          <input
            className="input input--sm"
            value={exam.coverage}
            onChange={(e) => patchExam({ coverage: e.target.value })}
          />
        </label>
      </div>

      {/* ---- sheet tabs ---- */}
      <div className="sd-tabs no-print">
        {sheets.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`sd-tab ${s.id === sheet.id ? 'sd-tab--active' : ''}`}
            onClick={() => setActiveId(s.id)}
          >
            {s.label}
            <span className="sd-tab__count">{placedTotal(s.topics)}</span>
          </button>
        ))}
      </div>

      {/* ---- live readouts ---- */}
      <div className="tos-summary no-print">
        <div className="tos-summary__stats">
          <div className="tos-summary__stat">
            <span className="tos-summary__label">Declared total</span>
            <span className="tos-summary__value">{fmt(sheet.total)}</span>
            <span className="tos-summary__sub">{unit} on this sheet</span>
          </div>
          <div className="tos-summary__stat">
            <span className="tos-summary__label">Placed</span>
            <span
              className={`tos-summary__value${
                Math.abs(placed - num(sheet.total)) > 0.001 ? ' tos-summary__value--off' : ''
              }`}
            >
              {fmt(placed)}
            </span>
            <span className="tos-summary__sub">sum of all Bloom columns</span>
          </div>
          <div className="tos-summary__stat">
            <span className="tos-summary__label">Hours</span>
            <span className="tos-summary__value">{fmt(hours)}</span>
            <span className="tos-summary__sub">exam declares {fmt(exam.totalHours)}</span>
          </div>
        </div>

        <div className="tos-summary__bloom">
          {BLOOM_LEVELS.map((level) => (
            <div key={level} className="tos-bloom">
              <span className="tos-bloom__name">{BLOOM_LABELS[level]}</span>
              <span className="tos-bloom__count">{fmt(totals[level])}</span>
              <span
                className="tos-bloom__bar"
                style={{ width: `${Math.min(100, share[level] * 100)}%` }}
              />
              <span className="tos-bloom__share">{pct(share[level])}</span>
            </div>
          ))}
        </div>

        {issues.length === 0 ? (
          <p className="msg msg--success" role="status">
            This sheet adds up and every topic matches its hour allotment.
          </p>
        ) : (
          issues.map((issue) => (
            <p
              key={issue.code}
              className={`msg msg--${issue.level === 'error' ? 'error' : 'info'}`}
              role="status"
            >
              {issue.message}
            </p>
          ))
        )}
      </div>

      {/* ---- the blueprint ---- */}
      <TosSheetGrid
        exam={exam}
        sheet={sheet}
        issues={issues}
        editable={editMode}
        onPatchExam={patchExam}
        onPatchSheet={patchSheet}
        onPatchTopic={patchTopic}
        onSetBloom={setBloom}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        onMoveTopic={moveTopic}
      />

      {/* ---- explainer ---- */}
      <div className="panel tos-guide no-print">
        <button
          type="button"
          className="tos-guide__toggle"
          onClick={() => setShowGuide((v) => !v)}
          aria-expanded={showGuide}
        >
          What is a Table of Specification?
          <span className="tos-guide__chevron">{showGuide ? '−' : '+'}</span>
        </button>

        {showGuide && (
          <div className="tos-guide__body">
            <p>
              A TOS is the exam&rsquo;s blueprint, built before any question is written. It
              maps each syllabus topic to a cognitive level and a count, so the exam is a
              fair sample of the course rather than a test of whichever chapter was
              covered last.
            </p>

            <div className="sd-details__section">
              <strong>Why some cells are green and some are gray</strong>
              <p>
                <strong>Green</strong> cells are the ones a person decides: topic names,
                SLOs, hours, Bloom counts, the exam total. <strong>Gray</strong> cells hold
                formulas and are not typed into. The <em>Number of {singular}</em> column is
                gray because it is computed from the hours —
                <code>(total {unit} &divide; total hours) &times; topic hours</code>, the
                workbook&rsquo;s <code>=($C$19/$B$20)*B13</code>. The percentages in the header
                are gray because they fall out of the column sums.
              </p>
            </div>

            <div className="sd-details__section">
              <strong>1. Weight follows hours</strong>
              <p>
                Items are distributed in proportion to the time each topic gets, so a topic
                taught for twice as long earns twice as much of the exam. Change an hour
                figure or the total and every gray weight in the column moves with it.
              </p>
            </div>

            <div className="sd-details__section">
              <strong>2. Bloom&rsquo;s Revised Taxonomy sets the difficulty mix</strong>
              <p>
                Every item sits at one of six cognitive levels. Spreading items across the
                ladder stops a student from passing on memorization alone.
              </p>
              <ul className="tos-guide__list">
                {BLOOM_LEVELS.map((level) => (
                  <li key={level}>
                    <strong>{BLOOM_LABELS[level]}</strong> &mdash;{' '}
                    {BLOOM_DESCRIPTIONS[level]}
                  </li>
                ))}
              </ul>
            </div>

            <div className="sd-details__section">
              <strong>3. Three checks keep it honest</strong>
              <ul className="tos-guide__list">
                <li>
                  <strong>The columns must add up.</strong> Every item across every Bloom
                  column has to equal the declared total, or the exam is longer or shorter
                  than advertised.
                </li>
                <li>
                  <strong>The hours must match.</strong> Topic hours should sum to the
                  course&rsquo;s declared hours.
                </li>
                <li>
                  <strong>Placement must match weight.</strong> If a topic is weighted for
                  2.5 items but places 3, the exam over-tests it relative to the time spent
                  on it. Drifting rows are outlined in the grid.
                </li>
              </ul>
              <p>All three run on every keystroke, so mistakes surface while the sheet is being built.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
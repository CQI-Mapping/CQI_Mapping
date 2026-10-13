// Table of Specification workspace.
//
// The TOS is built first and the exam is written to match it, so this page is
// closer to a form than a viewer: you state the syllabus hours and where each
// item sits on Bloom's ladder, and the derived weighted column, the column
// totals, the target percentages, and the consistency checks all fall out of
// that as you type.
//
// State is local React only for now — a refresh discards edits. The intended
// next step is Supabase persistence (tos_exams / tos_sheets / tos_topics under
// RLS scoped to the signed-in user), which is why the data lives in
// tosSampleData.ts rather than inline here: that file becomes the seed and the
// useState becomes a fetch, with no change to TosSheetGrid, tosMath, or the
// markup below.

import { useCallback, useMemo, useState } from 'react'
import TosSheetGrid from '../../components/TosSheetGrid'
import {
  BLOOM_DESCRIPTIONS,
  BLOOM_LABELS,
  BLOOM_LEVELS,
  BLOOM_SHORT,
  bloomTotals,
  blankTopic,
  fmt,
  num,
  placedTotal,
  renumber,
  shares,
  totalHours,
  validateSheet,
  weightedFor,
  type BloomLevel,
  type TosExam,
  type TosIssue,
  type TosSheet,
  type TosTopic,
} from '../../utils/tosMath'
import { TOS_EXAM_META, TOS_SHEETS } from '../../utils/tosSampleData'

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

const ISSUE_CLASS: Record<TosIssue['level'], string> = {
  error: 'msg msg--error',
  warn: 'msg msg--info',
  info: 'msg msg--info',
}

/** A deep enough copy that editing topics never mutates the sample constant. */
const freshSheets = (): TosSheet[] =>
  TOS_SHEETS.map((s) => ({ ...s, topics: s.topics.map((t) => ({ ...t, bloom: { ...t.bloom } })) }))

export default function TableOfSpecification() {
  const [exam, setExam] = useState<TosExam>(() => ({ ...TOS_EXAM_META }))
  const [sheets, setSheets] = useState<TosSheet[]>(freshSheets)
  const [activeId, setActiveId] = useState(sheets[0]?.id ?? '')
  const [editMode, setEditMode] = useState(false)
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

  // ---- topic editing -------------------------------------------------

  const replaceSheet = useCallback((next: TosSheet) => {
    setSheets((prev) => prev.map((s) => (s.id === next.id ? next : s)))
  }, [])

  const patchTopic = useCallback(
    (id: string, patch: Partial<TosTopic>) => {
      replaceSheet({
        ...sheet,
        topics: sheet.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })
    },
    [sheet, replaceSheet],
  )

  const setBloom = useCallback(
    (id: string, level: BloomLevel, raw: string) => {
      const value = num(raw)
      const topic = sheet.topics.find((t) => t.id === id)
      if (!topic) return
      const bloom = { ...topic.bloom }
      if (value > 0) bloom[level] = value
      else delete bloom[level]
      patchTopic(id, { bloom })
    },
    [sheet.topics, patchTopic],
  )

  const addTopic = useCallback(() => {
    replaceSheet({
      ...sheet,
      topics: [...sheet.topics, blankTopic(sheet.topics.length + 1)],
    })
  }, [sheet, replaceSheet])

  const removeTopic = useCallback(
    (id: string) => {
      replaceSheet({
        ...sheet,
        topics: renumber(sheet.topics.filter((t) => t.id !== id)),
      })
    },
    [sheet, replaceSheet],
  )

  const moveTopic = useCallback(
    (id: string, delta: number) => {
      const topics = [...sheet.topics]
      const index = topics.findIndex((t) => t.id === id)
      const target = index + delta
      if (index < 0 || target < 0 || target >= topics.length) return
      const [moved] = topics.splice(index, 1)
      topics.splice(target, 0, moved)
      replaceSheet({ ...sheet, topics: renumber(topics) })
    },
    [sheet, replaceSheet],
  )

  const unit = sheet.kind === 'points' ? 'points' : 'items'
  const columns = BLOOM_LEVELS.length

  return (
    <div className="syllabus-doc">
      {/* ---- toolbar ---- */}
      <div className="syllabus-doc__toolbar no-print">
        <span className="syllabus-doc__meta">
          {exam.code} &middot; {exam.title} &middot; {exam.term}
        </span>
        <div className="sd-toolbar-controls">
          <button
            type="button"
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setEditMode((v) => !v)}
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

      {/* ---- exam header form ---- */}
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
        {sheets.map((s) => {
          const sTotals = bloomTotals(s.topics)
          return (
            <button
              key={s.id}
              type="button"
              className={`sd-tab ${s.id === sheet.id ? 'sd-tab--active' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              {s.label}
              <span className="sd-tab__count">{sTotals ? placedTotal(s.topics) : 0}</span>
            </button>
          )
        })}
      </div>

      {/* ---- derived readouts + checks ---- */}
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

        {issues.length > 0 && (
          <div className="tos-issues">
            {issues.map((issue) => (
              <p key={issue.code} className={ISSUE_CLASS[issue.level]} role="status">
                {issue.message}
              </p>
            ))}
          </div>
        )}
        {issues.length === 0 && (
          <p className="msg msg--success" role="status">
            This sheet adds up and every topic matches its hour allotment.
          </p>
        )}
      </div>

      {/* ---- the document ---- */}
      <TosSheetGrid exam={exam} sheet={sheet} />

      {/* ---- topic editor ---- */}
      {editMode && (
        <div className="panel tos-editor no-print">
          <div className="tos-editor__head">
            <h3>Topics</h3>
            <button type="button" className="btn btn--ghost btn--sm" onClick={addTopic}>
              Add topic
            </button>
          </div>

          <div className="table-wrap">
            <table className="table tos-editor__table">
              <thead>
                <tr>
                  <th className="tos-editor__num">#</th>
                  <th>Topic with SLO</th>
                  <th className="tos-editor__hours">Hrs</th>
                  <th className="tos-editor__weighted">By hours</th>
                  {BLOOM_LEVELS.map((level) => (
                    <th key={level} className="tos-editor__bloom" title={BLOOM_LABELS[level]}>
                      {BLOOM_SHORT[level]}
                    </th>
                  ))}
                  <th className="tos-editor__actions">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {sheet.topics.map((topic) => {
                  const weighted = weightedFor(sheet, topic)
                  const topicPlaced = BLOOM_LEVELS.reduce(
                    (sum, level) => sum + num(topic.bloom[level]),
                    0,
                  )
                  const drift = Math.abs(topicPlaced - weighted) > 0.25
                  return (
                    <tr key={topic.id}>
                      <td className="tos-editor__num">{topic.position}</td>
                      <td>
                        <input
                          className="input input--sm"
                          value={topic.title}
                          placeholder="Topic title"
                          aria-label={`Topic ${topic.position} title`}
                          onChange={(e) => patchTopic(topic.id, { title: e.target.value })}
                        />
                        <textarea
                          className="input input--sm tos-editor__slo"
                          value={topic.slo}
                          rows={2}
                          placeholder="SLO: Student Learning Outcome"
                          aria-label={`Topic ${topic.position} SLO`}
                          onChange={(e) => patchTopic(topic.id, { slo: e.target.value })}
                        />
                      </td>
                      <td className="tos-editor__hours">
                        <input
                          className="input input--sm"
                          type="number"
                          min="0"
                          step="0.5"
                          value={topic.hours}
                          aria-label={`Topic ${topic.position} hours`}
                          onChange={(e) =>
                            patchTopic(topic.id, { hours: num(e.target.value) })
                          }
                        />
                      </td>
                      <td className="tos-editor__weighted">
                        <span className={drift ? 'tos-drift' : ''}>{fmt(weighted)}</span>
                      </td>
                      {BLOOM_LEVELS.map((level) => (
                        <td key={level} className="tos-editor__bloom">
                          <input
                            className="input input--sm"
                            type="number"
                            min="0"
                            step="1"
                            value={topic.bloom[level] ?? ''}
                            placeholder="0"
                            aria-label={`${BLOOM_LABELS[level]} items for topic ${topic.position}`}
                            onChange={(e) => setBloom(topic.id, level, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="tos-editor__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={topic.position === 1}
                          onClick={() => moveTopic(topic.id, -1)}
                          aria-label={`Move topic ${topic.position} up`}
                        >
                          &uarr;
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={topic.position === sheet.topics.length}
                          onClick={() => moveTopic(topic.id, 1)}
                          aria-label={`Move topic ${topic.position} down`}
                        >
                          &darr;
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => removeTopic(topic.id)}
                          aria-label={`Delete topic ${topic.position}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {sheet.topics.length === 0 && (
                  <tr>
                    <td colSpan={columns + 5} className="program-empty">
                      No topics yet. Add one to start building this sheet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="tos-editor__foot">
            &ldquo;By hours&rdquo; is derived: (total {unit} &divide; {fmt(hours)} hrs) &times;
            topic hours. It is the weight the syllabus asks for; the Bloom columns are what
            you actually placed. A gap between them is flagged above.
          </p>
        </div>
      )}

      {/* ---- explainer ---- */}
      <div className="panel tos-guide no-print">
        <button
          type="button"
          className="tos-guide__toggle"
          onClick={() => setShowGuide((v) => !v)}
          aria-expanded={showGuide}
        >
          {showGuide ? 'Hide' : 'What'} is a Table of Specification?
          <span className="tos-guide__chevron">{showGuide ? '−' : '+'}</span>
        </button>

        {showGuide && (
          <div className="tos-guide__body">
            <p>
              A TOS is the exam&rsquo;s blueprint, built before any question is written. It
              maps each syllabus topic to a cognitive level and a count, so the exam is a
              fair sample of the course rather than a test of whichever chapter was covered
              last.
            </p>

            <div className="sd-details__section">
              <strong>1. Weight follows hours</strong>
              <p>
                Items are distributed in proportion to the time each topic gets. The{' '}
                <em>No. of {unit}</em> column is{' '}
                <code>(total {unit} &divide; total hours) &times; topic hours</code> — the
                workbook&rsquo;s <code>=($C$19/$B$20)*B13</code>. Change the hours or the
                total and every weight moves.
              </p>
            </div>

            <div className="sd-details__section">
              <strong>2. Bloom&rsquo;s Revised Taxonomy sets the difficulty mix</strong>
              <p>
                Every item sits at one of six cognitive levels. Spreading items across the
                ladder stops a student from passing on memorization alone — the target
                percentages on this sheet cap how much of the exam can be simple recall.
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
                  2.5 items but places 3, the exam over-tests that topic relative to the
                  time spent on it.
                </li>
              </ul>
              <p>
                These three checks run automatically on every keystroke above, so mistakes
                surface while the sheet is being built rather than after the exam is printed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
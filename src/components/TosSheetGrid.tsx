// One sheet of a Table of Specification, laid out as the faculty workbook it
// came from — and editable in place, the way the spreadsheet is.
//
// The colouring carries the meaning:
//   GREEN  cells are inputs. Type in them.
//   GRAY   cells are formulas. They recompute from the inputs and cannot be
//          typed into — the "Number of Item" column is derived from the hour
//          allotment, and the header percentages are derived from the column
//          sums.
//
// That distinction is the whole design: a TOS holds an intent (hours imply a
// weight) and a reality (items placed on Bloom levels). The intent column is
// gray because you never type it; the Bloom cells are green because you always
// do. When they disagree, tosMath reports the drift.
//
// Controlled from above — the page owns the state and passes the setters down,
// so this file stays a pure view with no fetching of its own.

import {
  BLOOM_LEVELS,
  BLOOM_LABELS,
  bloomTotals,
  fmt,
  fmt1,
  num,
  shares,
  totalHours,
  weightedFor,
  type BloomLevel,
  type TosIssue,
  type TosSheet,
} from '../utils/tosMath'

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

/**
 * The block that sits above the grid and identifies the blueprint, in the
 * order the faculty workbook puts it: course, term, then the title line and the
 * Bloom note. Read-only -- it is the document, not a form.
 */
export interface TosDocHeader {
  courseTitle: string
  term: string
  /** "Table of Specification for Prelim: Multiple Choice Type" */
  title: string
}

export interface TosSheetGridProps {
  sheet: TosSheet
  header: TosDocHeader
  issues: TosIssue[]
  /** False renders the document read-only for printing or review. */
  editable: boolean
  onPatchSheet: (patch: Partial<TosSheet>) => void
  onPatchTopic: (id: string, patch: { title?: string; slo?: string; hours?: number }) => void
  onSetBloom: (topicId: string, level: BloomLevel, value: string) => void
  onAddTopic: () => void
  onRemoveTopic: (id: string) => void
  /** Write the paper on screen out as a workbook. */
  onExportExcel: () => void
  /**
   * Write every pending edit now.
   *
   * Edits already autosave on a debounce, so this is not the only way data
   * reaches the database — it closes the window between "I stopped typing" and
   * the debounce firing, and tells you it landed.
   */
  onSave: () => void
  /** True while a write is in flight, for the button's own state. */
  saving?: boolean
}

/** A green input cell that reads as a flat cell until you click it. */
function Cell({
  value,
  onChange,
  type = 'text',
  step,
  min,
  placeholder,
  label,
  multiline,
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  step?: string
  min?: string
  placeholder?: string
  label: string
  multiline?: boolean
}) {
  const cls = `tos-cell__input${multiline ? ' tos-cell__input--multi' : ''}`
  return multiline ? (
    <textarea
      className={cls}
      value={value}
      rows={2}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  ) : (
    <input
      className={cls}
      type={type}
      step={step}
      min={min}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default function TosSheetGrid({
  sheet,
  header,
  issues,
  editable,
  onPatchSheet,
  onPatchTopic,
  onSetBloom,
  onAddTopic,
  onRemoveTopic,
  onExportExcel,
  onSave,
  saving,
}: TosSheetGridProps) {
  const totals = bloomTotals(sheet.topics)
  const share = shares(sheet.topics, sheet.total)
  const shareTotal = BLOOM_LEVELS.reduce((sum, level) => sum + share[level], 0)
  const unit = sheet.kind === 'points' ? 'Point' : 'Item'

  /**
   * WEIGHT_DRIFT stays computed -- it still decides which rows get the drift
   * highlight on the weighted column -- but it is not worth saying out loud.
   * Hour-weighted intent and placed items disagreeing is normal while a sheet
   * is being built, and the row marking already carries that signal without a
   * paragraph of numbers under the table.
   */
  const visibleIssues = issues.filter((i) => i.code !== 'WEIGHT_DRIFT')

  // Drift per topic, so the grid can mark the offending rows without the page
  // having to pass a lookup table down.
  const drifted = new Set(
    sheet.topics
      .filter((t) => {
        const placed = BLOOM_LEVELS.reduce((s, l) => s + num(t.bloom[l]), 0)
        return Math.abs(placed - weightedFor(sheet, t)) > 0.25
      })
      .map((t) => t.id),
  )

  return (
    <>
      <div className="panel tos-sheet">
        {/* ---- letterhead ---- */}
        <div className="tos-doc">
          {header.courseTitle && (
            <p className="tos-doc__line tos-doc__course">Course Title: {header.courseTitle}</p>
          )}
          {header.term && <p className="tos-doc__line">{header.term}</p>}
          <p className="tos-doc__line tos-doc__title">{header.title}</p>
          <p className="tos-doc__line tos-doc__blooms">Blooms Revised Taxonomy</p>
        </div>

        <table className="tos-table">
        <thead>
          <tr>
            <th className="tos-th--topic">Topic with SLO</th>
            <th className="tos-th--hrs">No. of hrs</th>
            <th className="tos-th--weight">Number of {unit}</th>
            {BLOOM_LEVELS.map((level) => (
              <th key={level} className="tos-th--bloom">
                <span className="tos-th__name">{BLOOM_LABELS[level]}</span>
                <span className="tos-th__share">{pct(share[level])}</span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sheet.topics.map((topic) => (
            <tr key={topic.id} className={drifted.has(topic.id) ? 'tos-row--drift' : ''}>
              <td className="tos-td--topic">
                <div className="tos-topic__title">
                  <span className="tos-topic__num">{topic.position}.</span>
                  {editable ? (
                    <Cell
                      label={`Topic ${topic.position} title`}
                      value={topic.title}
                      placeholder="Topic title"
                      onChange={(v) => onPatchTopic(topic.id, { title: v })}
                    />
                  ) : (
                    <span>{topic.title}</span>
                  )}
                </div>
                <div className="tos-topic__slo">
                  <strong>SLO: </strong>
                  {editable ? (
                    <Cell
                      multiline
                      label={`Topic ${topic.position} SLO`}
                      value={topic.slo}
                      placeholder="Student Learning Outcome"
                      onChange={(v) => onPatchTopic(topic.id, { slo: v })}
                    />
                  ) : (
                    <span>{topic.slo}</span>
                  )}
                </div>
              </td>

              <td className="tos-td--num">
                {editable ? (
                  <Cell
                    type="number"
                    min="0"
                    step="0.5"
                    label={`Topic ${topic.position} hours`}
                    value={topic.hours}
                    onChange={(v) => onPatchTopic(topic.id, { hours: num(v) })}
                  />
                ) : (
                  fmt(topic.hours)
                )}
              </td>

              {/* GRAY — derived from the hours, never typed. */}
              <td className="tos-td--num tos-td--formula">{fmt1(weightedFor(sheet, topic))}</td>

              {BLOOM_LEVELS.map((level) => (
                <td key={level} className="tos-td--num">
                  {editable ? (
                    <Cell
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      label={`${BLOOM_LABELS[level]} items for topic ${topic.position}`}
                      value={topic.bloom[level] ?? ''}
                      onChange={(v) => onSetBloom(topic.id, level, v)}
                    />
                  ) : (
                    (topic.bloom[level] ?? '') || ''
                  )}
                </td>
              ))}
            </tr>
          ))}

          {sheet.topics.length === 0 && (
            <tr>
              <td colSpan={9} className="tos-empty">
                No topics yet.{' '}
                {editable && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={onAddTopic}>
                    Add the first one
                  </button>
                )}
              </td>
            </tr>
          )}
        </tbody>

        <tfoot>
          {/* GREEN — you set the exam total; everything else follows from it. */}
          <tr className="tos-total">
            <th scope="row">Total Number of {sheet.kind === 'points' ? 'Points' : 'Items'}</th>
            <td className="tos-td--formula" />
            <td className="tos-td--num">
              {editable ? (
                <Cell
                  type="number"
                  min="0"
                  step="1"
                  label={`Total number of ${unit}s on this sheet`}
                  value={sheet.total}
                  onChange={(v) => onPatchSheet({ total: num(v) })}
                />
              ) : (
                fmt(sheet.total)
              )}
            </td>
            {/* GRAY — these are the SUM of the columns above, not inputs. */}
            {BLOOM_LEVELS.map((level) => (
              <td key={level} className="tos-td--num tos-td--formula">
                {totals[level] || ''}
              </td>
            ))}
          </tr>

          <tr className="tos-total">
            <th scope="row">Total Number of Hours</th>
            {/* GRAY — the SUM of the hours column above, not an input. */}
            <td className="tos-td--num tos-td--formula">{fmt(totalHours(sheet.topics))}</td>
            <td className="tos-td--formula" />
            {BLOOM_LEVELS.map((level) => (
              <td key={level} className="tos-td--formula" />
            ))}
          </tr>

          {/* GRAY — SUM of the header percentages, per =SUM(D12:I12). That only reads
            100% when the columns add up to the declared total; with items
            unassigned it reads less, which is the point. */}
          <tr className="tos-total">
            <th scope="row">Total Percentage</th>
            <td
              className={`tos-td--num tos-td--formula${
                Math.abs(shareTotal - 1) > 0.001 ? ' tos-td--formula--off' : ''
              }`}
            >
              {pct(shareTotal)}
            </td>
            {Array.from({ length: BLOOM_LEVELS.length + 1 }).map((_, i) => (
              <td key={i} className="tos-td--formula" />
            ))}
          </tr>
        </tfoot>
      </table>

      {/* Caption between the table and its Add button. */}
      <div className="tos-foot">
        <em>Note: Only those highlighted with green are editable cells. Gray colored cells
        contains the formula.</em>
      </div>

      {/* Add sits directly under the table it adds a row to, right-aligned.
          Reset and Export sit alongside it. */}
      {editable && (
        <div className="tos-addrow no-print">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onSave}
            disabled={saving}
            title="Write every pending edit to the database now"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onExportExcel}
          >
            Export Excel
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onAddTopic}>
            Add topic
          </button>
        </div>
      )}

      {visibleIssues.length > 0 && editable && (
        <div className="tos-sheet__issues no-print">
          {visibleIssues.map((issue) => (
            <p
              key={issue.code}
              className={`msg msg--${issue.level === 'error' ? 'error' : 'info'}`}
              role="status"
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>

      {/* Row controls get their own panel, clear of the blueprint, so the
          document above stays a document. Nothing here prints.

          Each row renames in place. The title is also editable in the grid
          above, but that cell is inside a wide row several columns deep — with
          a dozen topics the list here is the natural place to scan and fix
          them, and scrolling back up to find the right row is the part that
          made the list feel read-only. Same onPatchTopic the grid uses, so
          both routes write one debounced save. */}
      {editable && (
        <div className="panel tos-rows no-print">
          {sheet.topics.map((topic) => (
            <span key={topic.id} className="tos-rows__item">
              <span className="tos-rows__label">{topic.position}.</span>
              <input
                className="tos-rows__input"
                type="text"
                value={topic.title}
                placeholder="Untitled topic"
                aria-label={`Topic ${topic.position} title`}
                onChange={(e) => onPatchTopic(topic.id, { title: e.target.value })}
              />
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => onRemoveTopic(topic.id)}
                aria-label={`Delete topic ${topic.position}`}
              >
                Delete
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
// The alignment matrix: every program outcome against every institutional
// document it could be aligned to.
//
// A table, not an SVG grid: the rows carry outcome codes and titles, which is
// text a screen reader should read and a printer should keep. Colour is the
// quick read, and every cell also carries a tick or a dash so the chart is never
// the only way to get the answer.
//
// This is the shape the CLO-to-PO matrix wanted to be, on data that exists.
// The whole row of dashes under the CMO column is the finding: 25 of 27
// outcomes are anchored, but 14 of them reach nothing else.

import { FAMILY_LABELS } from '../utils/alignment'
import type { PoOutcome } from '../utils/alignment'

interface OutcomeAnchorMatrixProps {
  outcomes: PoOutcome[]
  /** One column per document, grouped by family. */
  columns: { family: string; code: string }[]
}

function OutcomeAnchorMatrix({ outcomes, columns }: OutcomeAnchorMatrixProps) {
  const alignedIn = (o: PoOutcome, family: string) =>
    (o as unknown as Record<string, string[]>)[family] ?? []

  return (
    <div className="oamx">
      <div className="table-wrap oamx__scroll">
        <table className="table oamx__table">
          <thead>
            <tr>
              <th className="oamx__code">Outcome</th>
              <th className="oamx__title">Title</th>
              {columns.map((c) => (
                <th key={`${c.family}:${c.code}`} className="oamx__anchor">
                  {c.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.key}>
                <td className="oamx__code">{o.code}</td>
                <td className="oamx__title">{o.title}</td>
                {columns.map((c) => {
                  const on = alignedIn(o, c.family).includes(c.code)
                  return (
                    <td
                      key={`${c.family}:${c.code}`}
                      className={
                        on
                          ? 'oamx__cell oamx__cell--on oamx__cell--' + c.family
                          : 'oamx__cell oamx__cell--none'
                      }
                    >
                      {on ? '✓' : '–'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="oamx__legend">
        {(['cmo', 'peo', 'sg'] as const).map((f) => (
          <li className="oamx__legend-item" key={f}>
            <span className={`oamx__cell oamx__cell--on oamx__cell--${f} oamx__swatch`}>✓</span>
            Aligned to a {FAMILY_LABELS[f]}
          </li>
        ))}
        <li className="oamx__legend-item">
          <span className="oamx__cell oamx__cell--none oamx__swatch">–</span> Not aligned
        </li>
      </ul>
    </div>
  )
}

export default OutcomeAnchorMatrix

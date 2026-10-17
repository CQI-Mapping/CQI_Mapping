// The CLO-to-PO alignment matrix: every learning outcome against every program
// outcome it is mapped to.
//
// A table, not an SVG grid: the rows carry outcome codes and descriptions,
// which is text a screen reader should read and a printer should keep. Colour
// is the quick read, and every cell also carries a tick or a dash so the matrix
// is never the only way to get the answer.
//
// Rows are built from the learning outcome list rather than from the mappings, so
// an outcome mapped to nothing still gets a row of dashes -- a matrix built only
// from the mappings would hide exactly what it exists to expose.
//
// There is no M / D / I level here, because the schema's clo_po_matrix.level
// has no rows to read it from and the mapping lives in a text field. Inventing a
// depth would be a claim the data cannot support, so the cells say whether an
// outcome is mapped and the legend says only that.

import type { MatrixLine } from '../utils/cloPoMapping'

interface CloPoMatrixProps {
  rows: MatrixLine[]
  /** Outcome codes, in the order the columns should appear. */
  columns: string[]
  /** Outcome key behind each column, parallel to `columns`. */
  columnKeys: string[]
}

function CloPoMatrix({ rows, columns, columnKeys }: CloPoMatrixProps) {
  return (
    <div className="cpx">
      <div className="table-wrap cpx__scroll">
        <table className="table cpx__table">
          <thead>
            <tr>
              <th className="cpx__clo">CLO</th>
              {columns.map((code, i) => (
                <th key={columnKeys[i]} className="cpx__po" title={code}>
                  {code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td className="cpx__clo" title={row.description}>
                  {row.code}
                </td>
                {columnKeys.map((key) => (
                  <td
                    key={key}
                    className={
                      row.poKeys.includes(key)
                        ? 'cpx__cell cpx__cell--on'
                        : 'cpx__cell cpx__cell--none'
                    }
                  >
                    {row.poKeys.includes(key) ? '✓' : '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="cpx__legend">
        <li className="cpx__legend-item">
          <span className="cpx__cell cpx__cell--on cpx__swatch">✓</span> Mapped to this outcome
        </li>
        <li className="cpx__legend-item">
          <span className="cpx__cell cpx__cell--none cpx__swatch">–</span> No mapping
        </li>
      </ul>
    </div>
  )
}

export default CloPoMatrix

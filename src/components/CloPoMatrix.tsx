// The CLO-to-PO alignment matrix: a heatmap of every learning outcome in a
// program against every Program Outcome, cell by cell.
//
// A table, not an SVG grid: the rows are CLOs that carry a course code and a
// code of their own, which is text a screen reader should read and a printer
// should keep. Colour is the quick read; the letters are the citable one, so
// every cell carries both and the chart is never the only way to get the value.
//
// Rows come from the CLO list, not from the mappings, so an entirely unmapped
// outcome still appears -- as a row of dashes, which is the finding.

import { LEVEL_LETTERS } from '../utils/coverage'
import type { MappingLevel, MatrixRow } from '../utils/coverage'

interface CloPoMatrixProps {
  rows: MatrixRow[]
  poCodes: string[]
}

/** Cell tone per level, mirroring the mapping papers: deepest = darkest. */
const LEVEL_CLASS: Record<MappingLevel, string> = {
  3: 'clopom__cell--m',
  2: 'clopom__cell--d',
  1: 'clopom__cell--i',
}

function CloPoMatrix({ rows, poCodes }: CloPoMatrixProps) {
  return (
    <div className="clopom">
      <div className="table-wrap clopom__scroll">
        <table className="table clopom__table">
          <thead>
            <tr>
              <th className="clopom__course">Course</th>
              <th>CLO</th>
              {poCodes.map((code) => (
                <th key={code} className="clopom__po">
                  {code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clo.id}>
                <td className="clopom__course">{row.courseCode}</td>
                <td className="clopom__clo">{row.clo.code}</td>
                {row.levels.map((level, i) => (
                  <td
                    key={poCodes[i]}
                    className={
                      level === null ? 'clopom__cell clopom__cell--none' : `clopom__cell ${LEVEL_CLASS[level]}`
                    }
                  >
                    {level === null ? '–' : LEVEL_LETTERS[level]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="clopom__legend">
        <li className="clopom__legend-item">
          <span className="clopom__cell clopom__cell--m clopom__swatch">M</span> Mastered
        </li>
        <li className="clopom__legend-item">
          <span className="clopom__cell clopom__cell--d clopom__swatch">D</span> Developed
        </li>
        <li className="clopom__legend-item">
          <span className="clopom__cell clopom__cell--i clopom__swatch">I</span> Introduced
        </li>
        <li className="clopom__legend-item">
          <span className="clopom__cell clopom__cell--none clopom__swatch">–</span> No mapping
        </li>
      </ul>
    </div>
  )
}

export default CloPoMatrix

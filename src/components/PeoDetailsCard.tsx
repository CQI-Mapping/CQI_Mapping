// PeoDetailsCard: the compact connected-details panel the Subject Graph shows
// when the graph is rooted at a Program Educational Objective. Deliberately not
// a report document (no letterhead, title block, bands or tables) — just the
// PEO's own code, title and description plus the Program Outcomes it aligns to.
import type {
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
} from '../services/database'

interface PeoDetailsCardProps {
  peo: ProgramEducationalObjective
  /** POs aligned to this PEO (by peo_id or a PEO token in peo_text), pre-sorted. */
  pos: ProgramOutcomeStandalone[]
}

export default function PeoDetailsCard({ peo, pos }: PeoDetailsCardProps) {
  return (
    <div className="peo-details">
      <h3 className="peo-details__title">
        <span className="peo-details__code">{peo.code}</span>
        {peo.title ? ` — ${peo.title}` : ''}
      </h3>

      {peo.description && <p className="peo-details__desc">{peo.description}</p>}

      <div className="peo-details__section">
        <span className="peo-details__label">
          Connected Program Outcome{pos.length === 1 ? '' : 's'}
          <em className="peo-details__count">{pos.length}</em>
        </span>

        {pos.length === 0 ? (
          <p className="peo-details__empty">No program outcome aligns to this PEO yet.</p>
        ) : (
          <ul className="peo-details__list">
            {pos.map((p) => (
              <li key={p.id} className="peo-details__item">
                <span className="peo-details__po-code">{p.code}</span>
                <span className="peo-details__po-text">{p.title || p.description || p.code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
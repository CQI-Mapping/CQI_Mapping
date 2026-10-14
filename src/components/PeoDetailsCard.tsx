// PeoDetailsCard: the compact connected-details panel the Subject Graph shows
// when the graph is rooted at a Program Educational Objective. Deliberately not
// a report document (no letterhead, title block, bands or tables) — just the
// PEO's own code, title and description, followed by every node connected to it
// grouped by category (POs, CLOs, Subjects, PEOs, Strategic Goals, CMOs).
import type { ProgramEducationalObjective } from '../services/database'

export interface PeoConnectedItem {
  code: string
  text: string
  /** True when the reference could not be resolved to a real record. */
  unresolved: boolean
}

export type PeoConnectedKind = 'po' | 'clo' | 'subject' | 'peo' | 'sg' | 'cmo'

export interface PeoConnectedGroup {
  kind: PeoConnectedKind
  label: string
  items: PeoConnectedItem[]
}

interface PeoDetailsCardProps {
  peo: ProgramEducationalObjective
  /** Connected nodes, already grouped by category in display order. */
  groups: PeoConnectedGroup[]
}

export default function PeoDetailsCard({ peo, groups }: PeoDetailsCardProps) {
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  // Categories with nothing attached are noise — only render populated groups.
  const populated = groups.filter((g) => g.items.length > 0)

  return (
    <div className="peo-details">
      <h3 className="peo-details__title">
        <span className="peo-details__code">{peo.code}</span>
        {peo.title ? ` — ${peo.title}` : ''}
      </h3>

      {peo.description && <p className="peo-details__desc">{peo.description}</p>}

      <div className="peo-details__section">
        <span className="peo-details__label">
          Connected
          <em className="peo-details__count">{total}</em>
        </span>

        {populated.length === 0 ? (
          <p className="peo-details__empty">
            Nothing is connected to this PEO yet. Add aligned program outcomes to build the map.
          </p>
        ) : (
          <div className="peo-connected">
            {populated.map((g) => (
              <section key={g.kind} className="peo-connected__group">
                <span className="peo-details__label">
                  {g.label}
                  <em className="peo-details__count">{g.items.length}</em>
                </span>
                <ul className="peo-details__list">
                  {g.items.map((item) => (
                    <li
                      key={`${g.kind}-${item.code}-${item.text}`}
                      className={`peo-details__item${item.unresolved ? ' peo-details__item--unresolved' : ''}`}
                    >
                      <span className="peo-details__item-code">{item.code}</span>
                      <span className="peo-details__item-text">{item.text}</span>
                      {item.unresolved && <span className="peo-details__flag">Unresolved</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
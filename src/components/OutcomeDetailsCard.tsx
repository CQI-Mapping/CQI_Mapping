// OutcomeDetailsCard: the compact connected-details panel the Subject Graph
// shows for whichever node is the root — a subject, a Program Outcome or a
// Program Educational Objective. Deliberately not a report document (no
// letterhead, title block, bands or tables) — just the root's own code, title
// and description, followed by every node connected to it grouped by category
// (curriculum, pre-reqs, co-reqs, CLOs, POs, Subjects, PEOs, Strategic Goals,
// CHED Memorandum Orders).

export interface ConnectedItem {
  code: string
  text: string
  /** True when the reference could not be resolved to a real record. */
  unresolved: boolean
}

export type ConnectedKind =
  | 'curriculum'
  | 'prerequisite'
  | 'corequisite'
  | 'clo'
  | 'po'
  | 'subject'
  | 'peo'
  | 'sg'
  | 'cmo'

export interface ConnectedGroup {
  kind: ConnectedKind
  label: string
  items: ConnectedItem[]
}

interface OutcomeDetailsCardProps {
  /** Root code, e.g. "PO 1" or "PEO 1". */
  heading: string
  /** Root name, shown after the code. */
  title?: string | null
  /** Root statement. */
  description?: string | null
  /** Connected nodes, already grouped by category in display order. */
  groups: ConnectedGroup[]
  /** Shown when no category has any items. */
  emptyHint: string
}

export default function OutcomeDetailsCard({
  heading,
  title,
  description,
  groups,
  emptyHint,
}: OutcomeDetailsCardProps) {
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  // Categories with nothing attached are noise — only render populated groups.
  const populated = groups.filter((g) => g.items.length > 0)

  return (
    <div className="outcome-details">
      <h3 className="outcome-details__title">
        <span className="outcome-details__code">{heading}</span>
        {title ? ` — ${title}` : ''}
      </h3>

      {description && <p className="outcome-details__desc">{description}</p>}

      <div className="outcome-details__section">
        <span className="outcome-details__label">
          Connected
          <em className="outcome-details__count">{total}</em>
        </span>

        {populated.length === 0 ? (
          <p className="outcome-details__empty">{emptyHint}</p>
        ) : (
          <div className="outcome-connected">
            {populated.map((g) => (
              <section key={g.kind} className="outcome-connected__group">
                <span className="outcome-details__label">
                  {g.label}
                  <em className="outcome-details__count">{g.items.length}</em>
                </span>
                <ul className="outcome-details__list">
                  {g.items.map((item) => (
                    <li
                      key={`${g.kind}-${item.code}-${item.text}`}
                      className={`outcome-details__item${item.unresolved ? ' outcome-details__item--unresolved' : ''}`}
                    >
                      <span className="outcome-details__item-code">{item.code}</span>
                      <span className="outcome-details__item-text">{item.text}</span>
                      {item.unresolved && <span className="outcome-details__flag">Unresolved</span>}
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
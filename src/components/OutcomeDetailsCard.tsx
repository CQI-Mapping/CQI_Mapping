// OutcomeDetailsCard: the compact connected-details panel the Subject Graph
// shows for whichever node is in focus. That is normally the root — a subject, a
// Program Outcome or a Program Educational Objective — but clicking any branch
// node in the map points the card at that branch instead, so the user can see
// what hangs off it without the tree re-rooting. Deliberately not a report
// document (no letterhead, title block, bands or tables) — just the focused
// node's own code, title and description, followed by every node connected to it
// grouped by category (curriculum, pre-reqs, co-reqs, CLOs, POs, Subjects, PEOs,
// Strategic Goals, CHED Memorandum Orders).

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
  /** Code of whatever node is in focus — the root, or a clicked branch. */
  heading: string
  /** Name of that node, shown after the code. */
  title?: string | null
  /** Statement. Only the roots carry one. */
  description?: string | null
  /** Connected nodes, already grouped by category in display order. */
  groups: ConnectedGroup[]
  /** Shown when no category has any items. */
  emptyHint: string
  /** True when a branch below the root is in focus rather than the root itself. */
  inspecting?: boolean
  /** Root's code, used to label the way back. Shown only while inspecting. */
  rootCode?: string
  /** Clears the inspected branch so the card falls back to the root. */
  onBackToRoot?: () => void
}

export default function OutcomeDetailsCard({
  heading,
  title,
  description,
  groups,
  emptyHint,
  inspecting = false,
  rootCode,
  onBackToRoot,
}: OutcomeDetailsCardProps) {
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  // Categories with nothing attached are noise — only render populated groups.
  const populated = groups.filter((g) => g.items.length > 0)

  return (
    <div className="outcome-details">
      {inspecting && (
        <div className="outcome-details__inspect">
          <span className="outcome-details__inspect-text">
            Showing what&rsquo;s connected to this branch
          </span>
          {onBackToRoot && (
            <button type="button" className="outcome-details__inspect-btn" onClick={onBackToRoot}>
              Back to {rootCode || 'root'}
            </button>
          )}
        </div>
      )}

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
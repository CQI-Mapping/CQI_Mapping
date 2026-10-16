// Lets any list row jump to the Activity Logs page pre-scoped to that record.
//
// The app has no router — `setActivePage` in App.tsx is the only navigation —
// so the focus travels through React context instead of a URL. The state itself
// lives in App.tsx alongside `activePage` (so navigating anywhere else can
// clear it); this file is just the transport plus the row button, which keeps
// ~10 list pages from each growing their own `onViewActivity` prop.

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import Icon from './icons'

/** A record the activity log should be narrowed down to. */
export interface ActivityFocus {
  /**
   * Record family, always the prefix of the `action` string ('program',
   * 'course', 'clo', 'user', ...). Required, because it is the only field
   * every audit entry for that record is guaranteed to carry.
   */
  entity: string
  /**
   * Primary key of the row. Preferred over `label`: it survives a rename, so
   * a record edited after the fact still matches its own earlier entries.
   */
  entityId?: string
  /**
   * Name shown in the banner, and used to match entries recorded without an id
   * (every `*.created` call logs only a label — see useEntityCrud's create path).
   */
  title: string
}

export interface ActivityFocusApi {
  /** The record the log is currently scoped to, or null for the full log. */
  focus: ActivityFocus | null
  /** Scope the log to a record and navigate to it. */
  showActivity: (focus: ActivityFocus) => void
  /** Drop the scope and return to the unfiltered log. */
  clearActivity: () => void
}

const ActivityFocusContext = createContext<ActivityFocusApi | null>(null)

export function ActivityFocusProvider({
  value,
  children,
}: {
  value: ActivityFocusApi
  children: ReactNode
}) {
  return <ActivityFocusContext.Provider value={value}>{children}</ActivityFocusContext.Provider>
}

/**
 * Falls back to a no-op context so a page rendered outside the provider (a test
 * harness, a storybook-style mount) renders normally instead of crashing.
 */
export function useActivityFocus(): ActivityFocusApi {
  return (
    useContext(ActivityFocusContext) ?? {
      focus: null,
      showActivity: () => {},
      clearActivity: () => {},
    }
  )
}

/**
 * The per-row "show me this record's history" button.
 *
 * Deliberately icon-only and `btn--ghost`, matching the sibling Edit/Archive
 * buttons it sits next to. Callers pass the entity id and display name; the
 * button owns the navigation so no page has to wire a handler.
 */
export function ActivityButton({ focus }: { focus: ActivityFocus }) {
  const { showActivity } = useActivityFocus()
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={() => showActivity(focus)}
      title={`Activity for ${focus.title}`}
      aria-label={`View activity for ${focus.title}`}
    >
      <Icon name="history" size={13} />
    </button>
  )
}

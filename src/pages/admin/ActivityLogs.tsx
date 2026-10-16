// Activity Logs — enhanced activity logs view shared by admin and manager.
// Fetches the latest 100 activity entries on mount, then filters client-side
// by search text, action type, and date range. Shows human-readable action
// labels and the `details` blob recorded with each entry (which record was
// touched, what it was called, and why a sign-in failed).
//
// When the page is reached from a record's "activity" button it arrives
// scoped to that record (see components/ActivityFocus): the fetch is narrowed
// to the record family and a further pass matches the individual row, so you
// see that record's whole history rather than the last 100 rows overall.

import { useState, useEffect, useMemo } from 'react'
import { fetchActivityLogs } from '../../services/database'
import type { ActivityLogEntry } from '../../services/database'
import { useActivityFocus } from '../../components/ActivityFocus'
import type { ActivityFocus } from '../../components/ActivityFocus'
import Icon from '../../components/icons'
import { labelAction, labelReason } from './ActivityLabels'

function uniqueActions(entries: ActivityLogEntry[]): string[] {
  const set = new Set(entries.map((e) => e.action))
  return [...set].sort()
}

// The `label` is the only part of details a person would search for. The raw
// id and entity key are machine identifiers and would just add noise.
function searchableDetails(entry: ActivityLogEntry): string {
  return [entry.details?.label ?? '', entry.details?.reason ? labelReason(entry.details.reason) : '']
    .join(' ')
    .toLowerCase()
}

// Row labels and audit labels are written independently from the same fields,
// so they are compared loosely rather than byte-for-byte.
const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// Does this entry belong to the focused record?
//
// `details.entity` is the authority for "which record family is this", because
// it does not always agree with the action prefix: a role change logs
// `role.updated` while pointing at entity 'user', so that it reads as history
// on the person whose role changed. Gating on the prefix alone would hide it.
// Entries written before `details` existed carry no entity, so the prefix is
// the fallback for those.
//
// Then narrow to the single row. Two fields could do that and neither is
// filled in everywhere: every `*.created` call logs only a label (the row's
// id is not known until after the insert returns), while `View.tsx` logs only
// an id. So either one matching is enough.
function matchesFocus(entry: ActivityLogEntry, focus: ActivityFocus): boolean {
  const family = entry.details?.entity
  const inFamily = family
    ? family === focus.entity
    : entry.action.split('.')[0] === focus.entity
  if (!inFamily) return false

  if (focus.entityId && entry.details?.entity_id === focus.entityId) return true
  if (norm(entry.details?.label) && norm(entry.details?.label) === norm(focus.title)) return true
  // An entity-only focus has nothing finer to match on, so it takes the lot.
  return !focus.entityId
}

interface ActivityLogsViewProps {
  title?: string
  description?: string
}

function ActivityLogsView({ title = 'Activity Logs', description }: ActivityLogsViewProps = {}) {
  const { focus, clearActivity } = useActivityFocus()
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // A scoped view asks for far more than the headline 100: the record being
  // inspected is old by definition, otherwise there would be nothing to see.
  // Only the family drives the fetch — narrowing to the single row is done
  // below, against rows already in hand.
  const focusEntity = focus?.entity

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchActivityLogs({ entity: focusEntity, limit: focusEntity ? 500 : 100 })
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch((e) => {
        if (!cancelled) setError('Unable to load activity logs: ' + e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [focusEntity])

  const filtered = useMemo(() => {
    let result = entries

    // The record scope is the outer bound; the filters below narrow within it.
    if (focus) {
      result = result.filter((e) => matchesFocus(e, focus))
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((e) => {
        const haystack = [e.user_email, e.action, labelAction(e.action), searchableDetails(e)]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }

    if (actionFilter) {
      result = result.filter((e) => e.action === actionFilter)
    }

    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter((e) => new Date(e.created_at) >= from)
    }

    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter((e) => new Date(e.created_at) <= to)
    }

    return result
  }, [entries, focus, search, actionFilter, dateFrom, dateTo])

  const actions = useMemo(() => uniqueActions(entries), [entries])

  // Failed sign-ins are the one entry type worth flagging at a glance.
  const failedCount = useMemo(
    () => filtered.filter((e) => e.action === 'auth.login_failed').length,
    [filtered]
  )

  const hasFilters = search || actionFilter || dateFrom || dateTo

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // An empty table has three quite different causes here, and conflating them
  // is how "nothing has happened yet" ends up shown for a record that has a
  // full history the filters happen to exclude.
  const emptyMessage = () => {
    if (hasFilters) return 'No entries match the current filters.'
    if (focus) return `No activity recorded for ${focus.title} yet.`
    return 'No activity recorded yet.'
  }

  // Details rendered as the secondary line under the action badge.
  function DetailLine({ entry }: { entry: ActivityLogEntry }) {
    const d = entry.details
    if (!d) return null
    const reason = d.reason ? labelReason(d.reason) : ''
    const label = d.label
    if (!label && !reason) return null
    return (
      <span className="activity-detail">
        {label && <span className="activity-detail__label">{label}</span>}
        {reason && <span className="activity-detail__reason">reason: {reason}</span>}
      </span>
    )
  }

  if (loading) return <p>Loading activity logs...</p>

  return (
    <div className="programs-page activity-logs">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">A</div>
          <div className="program-hero__titles">
            <h2>{title}</h2>
            <p>
              {description ||
                (focus
                  ? `Every action recorded against ${focus.title}.`
                  : `Audit trail of ${entries.length} actions — searchable and filterable.`)}
            </p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{entries.length}</div>
          <div className="program-stat__sub">{focus ? `All ${focus.entity.replace(/_/g, ' ')} entries` : 'Latest 100'}</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Filtered</div>
          <div className="program-stat__value" style={{ color: '#16a34a' }}>{filtered.length}</div>
          <div className="program-stat__sub">Matching current view</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Actions</div>
          <div className="program-stat__value" style={{ color: '#0f172a', fontSize: 16 }}>{actions.length}</div>
          <div className="program-stat__sub">Distinct types</div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Failed sign-ins</div>
          <div
            className="program-stat__value"
            style={{ color: failedCount > 0 ? '#b91c1c' : '#0f172a' }}
          >
            {failedCount}
          </div>
          <div className="program-stat__sub">In current view</div>
        </div>
      </div>

      {error && <p className="msg msg--error">{error}</p>}

      {/* Record scope — set by the per-row "activity" buttons on the list
          pages. Kept separate from the filters below so clearing those does
          not silently drop the user back into the whole log. */}
      {focus && (
        <div className="activity-scope">
          <Icon name="history" size={15} />
          <span className="activity-scope__text">
            Showing activity for <strong>{focus.title}</strong>
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearActivity}>
            Show all activity
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="panel activity-filters program-panel" style={{ borderTop: '3px solid #16a34a' }}>
        <div className="activity-filters__row">
          <label className="activity-filter">
            <span>Search</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="User, action, or record..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="activity-filter">
            <span>Action</span>
            <select
              className="input input--sm"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>{labelAction(a)}</option>
              ))}
            </select>
          </label>

          <label className="activity-filter">
            <span>From</span>
            <input
              className="input input--sm"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>

          <label className="activity-filter">
            <span>To</span>
            <input
              className="input input--sm"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>

          {hasFilters && (
            <button className="btn btn--ghost btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        {hasFilters && (
          <p className="activity-filters__count">
            Showing {filtered.length} of {entries.length} entries
          </p>
        )}
      </div>

      <div className="panel table-wrap program-panel">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3}>{emptyMessage()}</td>
              </tr>
            )}
            {filtered.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.created_at).toLocaleString()}</td>
                <td>{entry.user_email || '—'}</td>
                <td>
                  <span className={`action-badge action-badge--${entry.action.split('.')[0]}`}>
                    {labelAction(entry.action)}
                  </span>
                  <DetailLine entry={entry} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ActivityLogsView
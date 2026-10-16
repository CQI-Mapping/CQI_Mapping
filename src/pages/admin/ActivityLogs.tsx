// Activity Logs — enhanced activity logs view shared by admin and manager.
// Fetches the latest 100 activity entries on mount, then filters client-side
// by search text, action type, and date range. Shows human-readable action
// labels and the `details` blob recorded with each entry (which record was
// touched, what it was called, and why a sign-in failed).

import { useState, useEffect, useMemo } from 'react'
import { fetchActivityLogs } from '../../services/database'
import type { ActivityLogEntry } from '../../services/database'
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

interface ActivityLogsViewProps {
  title?: string
  description?: string
}

function ActivityLogsView({ title = 'Activity Logs', description }: ActivityLogsViewProps = {}) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchActivityLogs()
      .then(setEntries)
      .catch((e) => setError('Unable to load activity logs: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = entries

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
  }, [entries, search, actionFilter, dateFrom, dateTo])

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
            <p>{description || `Audit trail of ${entries.length} actions — searchable and filterable.`}</p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Total</div>
          <div className="program-stat__value">{entries.length}</div>
          <div className="program-stat__sub">Latest 100</div>
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
                <td colSpan={3}>
                  {entries.length === 0 ? 'No activity recorded yet.' : 'No entries match the current filters.'}
                </td>
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
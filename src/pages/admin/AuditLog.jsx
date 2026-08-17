// Audit Log — enhanced activity logs view shared by admin and manager.
// Fetches the latest 100 audit entries on mount, then filters client-side
// by search text, action type, and date range. Shows human-readable action
// labels and formatted details instead of raw JSON.

import { useState, useEffect, useMemo } from 'react'
import { fetchAuditLog } from '../../services/database'

const ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'resource.created': 'Created curriculum record',
  'resource.updated': 'Updated curriculum record',
  'resource.archived': 'Archived curriculum record',
  'resource.deleted': 'Deleted curriculum record',
  'program.created': 'Created program',
  'program.updated': 'Updated program',
  'program.deleted': 'Deleted program',
  'course.created': 'Created course',
  'course.updated': 'Updated course',
  'course.deleted': 'Deleted course',
  'program_outcome.created': 'Created program outcome',
  'program_outcome.updated': 'Updated program outcome',
  'program_outcome.deleted': 'Deleted program outcome',
  'course_learning_outcome.created': 'Created course learning outcome',
  'course_learning_outcome.updated': 'Updated course learning outcome',
  'course_learning_outcome.deleted': 'Deleted course learning outcome',
  'clo_po_mapping.set': 'Set CLO/PO mapping',
  'clo_po_mapping.cleared': 'Cleared CLO/PO mapping',
  'role.updated': 'Changed user role',
  'user.created': 'Created user account',
  'profile.updated': 'Updated profile',
}

function labelAction(raw) {
  return ACTION_LABELS[raw] || raw.replace(/_/g, ' ')
}

function formatDetails(action, details) {
  if (!details || typeof details !== 'object') return '—'
  const p = []
  if (details.title) p.push(`"${details.title}"`)
  if (details.code) p.push(details.code)
  if (details.newRole) p.push(`Role → ${details.newRole}`)
  if (details.clo && details.po) p.push(`${details.clo} → ${details.po}`)
  if (details.level) p.push(`Level ${details.level}`)
  if (details.createdEmail) p.push(details.createdEmail)
  if (details.profileId && details.newRole) p.push(`Profile → ${details.newRole}`)
  if (details.reason) p.push(`Reason: ${details.reason}`)
  return p.length ? p.join(' · ') : JSON.stringify(details)
}

function uniqueActions(entries) {
  const set = new Set(entries.map((e) => e.action))
  return [...set].sort()
}

function AuditLogView({ title = 'Activity Logs', description } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchAuditLog()
      .then(setEntries)
      .catch((e) => setError('Unable to load activity logs: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = entries

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((e) => {
        const haystack = [
          e.user_email,
          e.action,
          labelAction(e.action),
          JSON.stringify(e.details),
        ]
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

  const hasFilters = search || actionFilter || dateFrom || dateTo

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setDateFrom('')
    setDateTo('')
  }

  if (loading) return <p>Loading activity logs...</p>

  return (
    <div className="audit-log">
      <div className="page-heading">
        <h2>{title}</h2>
        <p>{description || `Record of actions taken in the system (latest ${entries.length}).`}</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}

      {/* Filters */}
      <div className="panel activity-filters">
        <div className="activity-filters__row">
          <label className="activity-filter">
            <span>Search</span>
            <input
              className="input input--sm"
              type="text"
              placeholder="User, action, or detail..."
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

      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="4">
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
                </td>
                <td className="table__details">{formatDetails(entry.action, entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AuditLogView

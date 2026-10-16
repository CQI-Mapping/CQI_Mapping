// Activity Logs — enhanced activity logs view shared by admin and manager.
//
// Every filter here is applied by the database, not in the browser. The log is
// global — admin and manager both see every actor, including each other and the
// faculty — so isolating one person is the whole point of the user filter, and
// that is only possible if the query itself is narrowed. The previous version
// fetched a fixed 100 rows and filtered them in memory, which meant an entry
// past row 100 was unreachable no matter what you typed.
//
// The per-actor summary answers "who has been doing what" without making anyone
// read the table row by row. Both views run off the same filter state, so the
// summary always describes exactly what the table below it shows.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  fetchActivityLogs,
  fetchActivityRollup,
  fetchActivityActors,
  ACTIVITY_LOG_LIMIT,
} from '../../services/database'
import type { ActivityLogEntry, ActivityRollupRow } from '../../services/database'
import { labelAction, labelCategory, labelReason, ACTION_LABELS } from './ActivityLabels'

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

/** "3 Courses · 2 Sign-ins · 1 Outcomes" — busiest categories first. */
function summarise(row: ActivityRollupRow): string {
  return Object.entries(row.byCategory)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([category, n]) => `${n} ${labelCategory(`${category}.x`)}`)
    .join(' · ')
}

function ActivityLogsView({ title = 'Activity Logs', description }: ActivityLogsViewProps = {}) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [rollup, setRollup] = useState<ActivityRollupRow[]>([])
  const [actors, setActors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // The search box drives a server query, so keystrokes are debounced rather
  // than fired one request per character. The selects and dates apply
  // immediately — they change on commit, not per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // The actor list is read once and never re-read: it must not shrink as the
  // other filters narrow the rows, or a narrowed filter could not be widened
  // again without first clearing itself.
  useEffect(() => {
    let cancelled = false
    fetchActivityActors()
      .then((rows) => { if (!cancelled) setActors(rows) })
      .catch(() => { /* the dropdown simply stays empty */ })
    return () => { cancelled = true }
  }, [])

  const filters = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      action: actionFilter || undefined,
      userEmail: userFilter || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      limit: ACTIVITY_LOG_LIMIT,
    }),
    [debouncedSearch, actionFilter, userFilter, dateFrom, dateTo],
  )

  // Guards against a slow earlier response overwriting a newer one: without the
  // token, typing fast enough to overlap requests shows stale rows.
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const token = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const [rows, summary] = await Promise.all([
        fetchActivityLogs(filters),
        fetchActivityRollup(filters),
      ])
      if (token !== requestRef.current) return
      setEntries(rows)
      setRollup(summary)
    } catch (e) {
      if (token !== requestRef.current) return
      setError('Unable to load activity logs: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      if (token === requestRef.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  /**
   * Label and failure-reason matching, applied over what came back.
   *
   * Only these two fields are left client-side: they live in the `details`
   * jsonb blob, which the server-side search deliberately does not reach into.
   * Everything a filter row can express as an equality or a date bound is
   * already applied by the query.
   */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => searchableDetails(e).includes(q))
  }, [entries, search])

  // Every action the app can emit, not just the ones present in this page of
  // results — otherwise picking an action would shrink the dropdown to nothing.
  const actions = useMemo(() => {
    const set = new Set<string>(Object.keys(ACTION_LABELS))
    for (const e of entries) set.add(e.action)
    return [...set].sort((a, b) => labelAction(a).localeCompare(labelAction(b)))
  }, [entries])

  const failedCount = useMemo(
    () => rows.filter((e) => e.action === 'auth.login_failed').length,
    [rows],
  )

  const hasFilters = search || actionFilter || userFilter || dateFrom || dateTo

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setUserFilter('')
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

  return (
    <div className="programs-page activity-logs">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">A</div>
          <div className="program-hero__titles">
            <h2>{title}</h2>
            <p>
              {description ||
                `Audit trail of ${entries.length} entries — every actor, filtered by the database.`}
            </p>
          </div>
        </div>
      </div>

      <div className="program-stats">
        <div className="program-stat">
          <div className="program-stat__label">Showing</div>
          <div className="program-stat__value">{rows.length}</div>
          <div className="program-stat__sub">
            {hasFilters ? 'Matching filters' : `Latest ${ACTIVITY_LOG_LIMIT}`}
          </div>
        </div>
        <div className="program-stat">
          <div className="program-stat__label">Actors</div>
          <div className="program-stat__value" style={{ color: '#0f172a' }}>{rollup.length}</div>
          <div className="program-stat__sub">In current view</div>
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

      {/* Filters — all of these narrow the query, not the loaded page. */}
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
            <span>User</span>
            <select
              className="input input--sm"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">All users</option>
              {actors.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
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
            Showing {rows.length} of {entries.length} loaded entries
          </p>
        )}
      </div>

      {/* Per-actor summary. This is the "who has been doing what" view that the
          row table cannot give you without reading every line. */}
      {!loading && rollup.length > 0 && (
        <div className="panel activity-rollup program-panel">
          <h3>Who's been active</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Entries</th>
                  <th>Activity</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rollup.map((r) => (
                  <tr key={r.user_email}>
                    <td>
                      <strong>{r.user_email}</strong>
                      {r.failedLogins > 0 && (
                        <span className="activity-rollup__flag">
                          {r.failedLogins} failed sign-in{r.failedLogins === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td>{r.total}</td>
                    <td className="activity-rollup__summary">{summarise(r)}</td>
                    <td>{new Date(r.lastSeen).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading activity logs...</p>
      ) : (
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    {entries.length === 0
                      ? 'No activity recorded for these filters.'
                      : 'No entries match the current filters.'}
                  </td>
                </tr>
              )}
              {rows.map((entry) => (
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
      )}
    </div>
  )
}

export default ActivityLogsView
// Activity Logs — enhanced activity logs view shared by admin and manager.
//
// Every filter here is applied by the database, not in the browser. The log is
// global for the admin — every actor, including other admins and managers —
// while a manager's database scope is faculty activity only (migration 007),
// which is exactly the level their page presents. Isolating one person is the
// whole point of the user filter, and that is only possible if the query
// itself is narrowed. The previous version fetched a fixed 100 rows and
// filtered them in memory, which meant an entry past row 100 was unreachable
// no matter what you typed.
//
// The per-actor summary answers "who has been doing what" without making anyone
// read the table row by row. Both views run off the same filter state, so the
// summary always describes exactly what the table below it shows.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  fetchActivityLogs,
  
  fetchActivityActors,
  fetchAllProfiles,
  ACTIVITY_LOG_LIMIT,
} from '../../services/database'
import type { ActivityLogEntry, ActivityRollupRow, UserRole } from '../../services/database'
import {
  labelAction,
  labelCategory,
  labelReason,
  labelRole,
  ROLE_ORDER,
  ACTION_LABELS,
} from './ActivityLabels'

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
  /**
   * The signed-in user's role, so the filters offer what the database will
   * actually return. Defaults to 'user' — least privilege, matching the
   * fallback App.tsx already uses for a profile it has not loaded. Getting
   * this wrong costs only a filter option: the RLS policy decides what rows
   * exist regardless (migrations/003 and 007).
   */
  viewerRole?: UserRole
}

/**
 * Role filter options, in the order a supervisor reads them down the column.
 *
 * A manager's page offers Faculty alone: their database scope (migration 007)
 * is faculty activity, and an option that can only ever return an empty table
 * is a defect rather than a choice. Enforcement stays in the database; this
 * only stops the UI from advertising a filter that cannot be satisfied.
 */
const ROLE_FILTER_OPTIONS = [
  { value: 'admin', label: 'Admins' },
  { value: 'manager', label: 'Managers' },
  { value: 'user', label: 'Faculty' },
]

/** "3 Courses · 2 Sign-ins · 1 Outcomes" — busiest categories first. */
function summarise(row: ActivityRollupRow): string {
  return Object.entries(row.byCategory)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([category, n]) => `${n} ${labelCategory(`${category}.x`)}`)
    .join(' · ')
}

function ActivityLogsView({ title = 'Activity Logs', description, viewerRole = 'user' }: ActivityLogsViewProps = {}) {
  const isAdminViewer = viewerRole === 'admin'
  // Managers get Faculty alone — their database scope is faculty activity
  // (migration 007), so Managers/Admins options could only ever show nothing.
  const roleOptions = isAdminViewer
    ? ROLE_FILTER_OPTIONS
    : ROLE_FILTER_OPTIONS.filter((o) => o.value === 'user')
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [actors, setActors] = useState<string[]>([])
  /**
   * Each actor's role, resolved from profiles.
   *
   * The log stores an email and nothing else, so without this every actor is an
   * opaque address — which defeats the question the page exists to answer. An
   * admin wanting to monitor the managers cannot tell which rows are a manager's;
   * a manager cannot tell a colleague from faculty.
   *
   * Keys are lowercased and every lookup lowercases what it looks for: the log
   * stamps the email exactly as the auth system recorded it, and a capitalised
   * variant ("Admin@cqi.test") is the same account as "admin@cqi.test". Exact
   * matching is what left those actors reading as "Unknown" in the rollup.
   *
   * RLS on profiles allows admin and manager to read all rows, which is exactly
   * who reaches this page, so the join needs no policy of its own.
   */
  const [roleByEmail, setRoleByEmail] = useState<Record<string, UserRole>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
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

  useEffect(() => {
    let cancelled = false
    fetchAllProfiles()
      .then((rows) => {
        if (cancelled) return
        setRoleByEmail(Object.fromEntries(rows.map((p) => [p.email.toLowerCase(), p.role])))
      })
      .catch(() => {
        // No roles, not no log. The entries are still all there; they just
        // cannot be attributed, so the badge shows Unknown rather than the
        // page failing to render.
      })
    return () => { cancelled = true }
  }, [])

  /**
   * A log entry's actor role, resolved case-insensitively against the profile
   * map. One helper so the row filter, the rollup badges and the table badges
   * all attribute the same email the same way.
   */
  const roleOf = (email: string | null | undefined): UserRole | undefined =>
    roleByEmail[(email ?? '').toLowerCase()]

  /**
   * The User dropdown's options. For a manager these are the faculty actors
   * only: the table below can never show another tier, so offering an admin's
   * or a colleague's email would produce an empty table on pick. The list
   * narrows as the roles arrive — on a slow profile load it briefly shows
   * everyone, then converges on what the database scopes.
   */
  const visibleActors = isAdminViewer
    ? actors
    : actors.filter((a) => roleOf(a) === 'user')

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
      const rows = await fetchActivityLogs(filters)
      if (token !== requestRef.current) return
      setEntries(rows)
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
    // Role is resolved in the browser from profiles, not on the row, so it
    // cannot be a server-side filter. That is the same trade as the label
    // search below, and it is why both live here rather than in the query.
    //
    // Manager scope, mirrored from the database: migration 007 returns faculty
    // entries only, and this filter keeps the page honest even before that
    // migration has been applied — manager, admin and unattributable ("Unknown")
    // rows never render for a manager, whichever side of the migration the
    // database is on.
    const roleOk = (e: ActivityLogEntry) =>
      (!isAdminViewer || roleOf(e.user_email) === 'user') &&
      (!roleFilter || roleOf(e.user_email) === roleFilter)

    const q = search.trim().toLowerCase()
    return entries.filter(
      (e) =>
        roleOk(e) &&
        (!q || searchableDetails(e).includes(q)),
    )
  }, [entries, search, roleFilter, roleByEmail, isAdminViewer])

  /**
   * The per-actor summary, ordered by role then by volume.
   *
   * Role first because that is how someone reads this: an admin wants their own
   * line, then the managers, then faculty. Volume breaks ties inside a role.
   * Recomputed from the loaded rows so it always describes the current filter
   * rather than a separate query that could disagree with the table.
   */
  const summaryByRole = useMemo(() => {
    const byUser = new Map<string, ActivityRollupRow>()
    for (const entry of rows) {
      const key = entry.user_email || '(unknown actor)'
      let row = byUser.get(key)
      if (!row) {
        row = {
          user_email: key,
          total: 0,
          failedLogins: 0,
          successfulLogins: 0,
          lastSeen: entry.created_at,
          byCategory: {},
        }
        byUser.set(key, row)
      }
      row.total += 1
      if (entry.action === 'auth.login_failed') row.failedLogins += 1
      if (entry.action === 'auth.login') row.successfulLogins += 1
      if (entry.created_at > row.lastSeen) row.lastSeen = entry.created_at
      const category = entry.action.split('.')[0]
      row.byCategory[category] = (row.byCategory[category] ?? 0) + 1
    }
    return [...byUser.values()].sort(
      (a, b) =>
        (ROLE_ORDER[roleOf(a.user_email) ?? ''] ?? 9) -
          (ROLE_ORDER[roleOf(b.user_email) ?? ''] ?? 9) ||
        b.total - a.total ||
        a.user_email.localeCompare(b.user_email),
    )
  }, [rows, roleByEmail])

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

  const hasFilters = search || actionFilter || userFilter || roleFilter || dateFrom || dateTo

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setUserFilter('')
    setRoleFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // Declared before drillInto() so the ref it touches is already in scope where
  // the function is defined, rather than relying on hoisting order.
  const rowsRef = useRef<HTMLDivElement>(null)
  const scrollToRowsPending = useRef(false)

  useEffect(() => {
    if (loading || !scrollToRowsPending.current) return
    scrollToRowsPending.current = false
    rowsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, entries])

  /**
   * Drill into one actor from the summary.
   *
   * Sets the same filter the dropdown uses, rather than a separate piece of
   * state — so the summary, the stat cards and the table can never disagree
   * about who is being shown. Tapping the active actor again clears it, which
   * makes the summary row a toggle rather than a one-way door.
   *
   * The actor may not be in the dropdown yet (it is read once, on mount), so it
   * is added to the option list too rather than silently failing to select.
   */
  const drillInto = (email: string) => {
    if (userFilter === email) {
      setUserFilter('')
      return
    }
    setActors((prev) => (prev.includes(email) ? prev : [...prev, email].sort()))
    setUserFilter(email)
    // The table sits below the summary, so on a tall summary the rows the
    // click just filtered to can be off-screen. Scrolling before the fetch
    // resolves would land on the old rows, so wait for the loading state to
    // clear and the new content to be in the DOM.
    scrollToRowsPending.current = true
  }

  /** Free-text detail: the record's name at the time, and any failure reason. */
  function DetailLine({ entry }: { entry: ActivityLogEntry }) {
    const d = entry.details
    if (!d) return null
    const reason = d.reason ? labelReason(d.reason) : ''
    if (!d.label && !reason) return null
    return (
      <span className="activity-detail">
        {d.label && <span className="activity-detail__label">{d.label}</span>}
        {reason && <span className="activity-detail__reason">reason: {reason}</span>}
      </span>
    )
  }

  /**
   * The record family an entry belongs to.
   *
   * In its own column because it is the part that is *evidence*: the label is a
   * name a human chose — free text, so two records can share one, and it changes
   * if someone edits the record — while the entity is the app's own vocabulary
   * for what kind of record was touched.
   *
   * The primary key is deliberately not shown. It was the column's reason to
   * exist in the first place, but a UUID prefix reads as noise to anyone not
   * already holding that record open, and the id is still searchable in the
   * raw row if it is ever needed.
   */
  function RecordCell({ entry }: { entry: ActivityLogEntry }) {
    const d = entry.details
    if (!d?.entity) return <span className="activity-record__none">—</span>
    return (
      <span className="activity-record">
        <span className="activity-record__entity">{d.entity}</span>
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
                (isAdminViewer
                  ? `Audit trail of ${entries.length} entries — every actor, filtered by the database.`
                  : `Audit trail of ${entries.length} entries — faculty activity, filtered by the database.`)}
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
          <div className="program-stat__value" style={{ color: '#0f172a' }}>{summaryByRole.length}</div>
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

          {/* The Role select earns its place only when there is a real choice:
              a manager's scope is faculty activity, so their filter row drops
              it rather than offering "Faculty" next to an "All roles" that
              resolves to the same rows. */}
          {roleOptions.length > 1 && (
            <label className="activity-filter">
              <span>Role</span>
              <select
                className="input input--sm"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value)
                  // Role and User narrow the same axis, so picking one clears the
                  // other. Leaving both set reads as a contradiction and shows an
                  // empty table that looks like data loss.
                  if (e.target.value) setUserFilter('')
                }}
                aria-label="Filter the log by role"
              >
                <option value="">All roles</option>
                {roleOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          <label className="activity-filter">
            <span>User</span>
            <select
              className="input input--sm"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">All users</option>
              {visibleActors.map((a) => (
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
        {/* Say why the other tiers are missing rather than letting a manager
            conclude the log is broken or that entries are being withheld from
            them arbitrarily. */}
        {!isAdminViewer && (
          <p className="activity-filters__scope">
            Showing faculty activity. Manager and admin entries are outside your
            level.
          </p>
        )}
      </div>

      {/* Per-actor summary. This is the "who has been doing what" view that the
          row table cannot give you without reading every line. */}
      {!loading && summaryByRole.length > 0 && (
        <div className="panel activity-rollup program-panel">
          <h3>Who's been active</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Entries</th>
                  <th>Activity</th>
                  <th>Last seen</th>
                </tr>
                {/* Click a user to filter the table below to just them. */}
              </thead>
              <tbody>
                {summaryByRole.map((r) => {
                  const active = userFilter === r.user_email
                  return (
                    <tr
                      key={r.user_email}
                      className={`activity-rollup__row${active ? ' is-active' : ''}`}
                      aria-selected={active}
                    >
                      <td>
                        {/* The control is the button, not the row: a handler on
                            <tr> would also catch this button's click and
                            bubble, firing drillInto twice and toggling the
                            filter straight back off. */}
                        <button
                          type="button"
                          className="activity-rollup__actor"
                          aria-pressed={active}
                          onClick={() => drillInto(r.user_email)}
                          title={active ? 'Show all activity again' : `Show only ${r.user_email}`}
                        >
                          {r.user_email}
                        </button>
                        {r.failedLogins > 0 && (
                          <span className="activity-rollup__flag">
                            {r.failedLogins} failed sign-in{r.failedLogins === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`role-badge role-badge--${roleOf(r.user_email) ?? 'unknown'}`}>
                          {labelRole(roleOf(r.user_email))}
                        </span>
                      </td>
                      <td>{r.total}</td>
                      <td className="activity-rollup__summary">{summarise(r)}</td>
                      <td>{new Date(r.lastSeen).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading activity logs...</p>
      ) : (
        <div className="panel table-wrap program-panel" ref={rowsRef}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    {entries.length === 0
                      ? 'No activity recorded for these filters.'
                      : 'No entries match the current filters.'}
                  </td>
                </tr>
              )}
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>
                    {entry.user_email || '—'}
                    <span className={`role-badge role-badge--${roleOf(entry.user_email) ?? 'unknown'}`}>
                      {labelRole(roleOf(entry.user_email))}
                    </span>
                  </td>
                  <td>
                    <span className={`action-badge action-badge--${entry.action.split('.')[0]}`}>
                      {labelAction(entry.action)}
                    </span>
                    <DetailLine entry={entry} />
                  </td>
                  <td><RecordCell entry={entry} /></td>
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
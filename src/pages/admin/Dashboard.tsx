import { useState, useEffect } from 'react'
import {
  fetchActivityLogs,
} from '../../services/database'
import type { Profile, ActivityLogEntry } from '../../services/database'
import { useClock } from '../../hooks/useClock'
import { localISODate, timeGreeting } from '../../utils/clock'
import MapBrief from '../../components/MapBrief'
import MapPreview from '../../components/MapPreview'

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [recent, setRecent] = useState<ActivityLogEntry[]>([])

  useEffect(() => {
    let cancelled = false
    // The dashboard's own figures live in the brief below (MapBrief's KPI
    // tiles, the map and the summary panels) — the individual counter
    // tiles that used to duplicate them are gone.
    fetchActivityLogs()
      .then((logs) => { if (!cancelled) setRecent(logs.slice(0, 5)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const go = (id: string) => onNavigate?.(id)

  // Ticking clock: the greeting and date pill re-render every minute, so a
  // dashboard left open turns over correctly at noon, 6 PM and midnight.
  const clock = useClock()

  return (
    <div className="dashboard dashboard--2026 page-enter">
      <section className="dashbanner" aria-labelledby="dashbanner-name">
        <div className="dashbanner__info">
          <span className="dashbanner__greeting">{timeGreeting(clock)}</span>
          <h1 className="dashbanner__name" id="dashbanner-name">
            {/* Greet by the nickname when one exists (what friends call the
                user), else the full name, else the email's local part. */}
            {profile?.nickname || profile?.full_name || profile?.email?.split('@')[0] || 'Welcome'}
          </h1>
          <div className="dashbanner__meta">
            <span className="dashbanner__badge">Administrator</span>
            <span className="dashbanner__sep">•</span>
            <span className="dashbanner__role">User</span>
          </div>
          <p className="dashbanner__desc">
            See the college at a glance — programs, outcomes, subject graphs, and CQI actions.
          </p>
        </div>
        <time className="dashbanner__date" dateTime={localISODate(clock)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span>{clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </time>
      </section>

      {/* The program's curriculum at a glance — the blocks that used to open
          the Generate Map page … with the live OBE Curriculum Map slotted
          between the KPI tiles and the two panels: figures first, then the
          Year·Semester map with amber prerequisite wires and the
          press-to-trace spotlight, then summary + coverage chart. */}
      <MapBrief profile={profile} onNavigate={onNavigate}>
        {/* Picks its curriculum the same way Generate Map's landing boot
            does — the viewer's program, else BSIT, else the first. */}
        <MapPreview profile={profile} onNavigate={onNavigate} />
      </MapBrief>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <h3>Quick actions</h3>
            <span>One-click presentable flows</span>
          </div>
          <div className="quick-actions">
            <button className="quick-action" type="button" onClick={() => go('program')}>
              <span className="quick-action__icon" style={{ background: '#16a34a' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
              </span>
              <span className="quick-action__text"><strong>Add Program</strong><small>Create degree offering</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('program-outcomes')}>
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>
              </span>
              <span className="quick-action__text"><strong>Review Outcomes</strong><small>PO alignment check</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('subject-view')}>
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.07 18.93A10 10 0 0 0 21 12M2.93 5.07A10 10 0 0 1 12 3" /><path d="M12 12m-7 0a7 7 0 0 1 14 0" /></svg>
              </span>
              <span className="quick-action__text"><strong>Generate Map</strong><small>Start Visualization</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('activity-logs')}>
              <span className="quick-action__icon" style={{ background: '#64748b' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              <span className="quick-action__text"><strong>Activity Logs</strong><small>Audit trail</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <h3>Recent activity</h3>
            <span>Latest 5 actions</span>
          </div>
          {recent.length === 0 ? (
            <p className="dashboard-panel__empty">No activity yet — actions will appear here.</p>
          ) : (
            <ul className="activity-feed">
              {recent.map((a) => (
                <li key={a.id} className="activity-feed__item">
                  <span className="activity-feed__dot" />
                  <span className="activity-feed__action">{a.action.replace(/_/g, ' ')}</span>
                  <span className="activity-feed__user">{a.user_email || 'system'}</span>
                  <time className="activity-feed__time">{new Date(a.created_at).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard

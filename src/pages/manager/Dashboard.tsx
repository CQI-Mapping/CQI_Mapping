// Manager dashboard — normal dashboard experience for program head / CQI lead.
// Mirrors admin's 2026 premium layout but scoped to manager capabilities:
// curriculum records, programs/courses, outcomes alignment, users & audit trail.

import { useState, useEffect } from 'react'
import {
  fetchAllProfiles,
  fetchResources,
  fetchPrograms,
  fetchCourses,
  fetchProgramOutcomesStandalone,
  fetchCourseLearningOutcomesStandalone,
  fetchActivityLogs,
} from '../../services/database'
import type { Profile, ActivityLogEntry } from '../../services/database'
import { useClock } from '../../hooks/useClock'
import { localISODate, timeGreeting } from '../../utils/clock'

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Array<{ label: string; value: number | null; accent: string; icon: string; sub: string }>>([])
  const [recent, setRecent] = useState<ActivityLogEntry[]>([])
  const loading = stats.length === 0

  useEffect(() => {
    let cancelled = false
    const counters = [
      { label: 'Curriculum Records', icon: 'clo', sub: 'Published curriculum', accent: '#16a34a', load: () => fetchResources() },
      { label: 'Programs', icon: 'program', sub: 'Degree offerings', accent: '#16a34a', load: () => fetchPrograms() },
      { label: 'Courses', icon: 'course', sub: 'Across programs', accent: '#15803d', load: () => fetchCourses() },
      { label: 'Program Outcomes', icon: 'po', sub: 'PO alignment', accent: '#15803d', load: () => fetchProgramOutcomesStandalone() },
      { label: 'Course Outcomes', icon: 'clo', sub: 'CLOs per course', accent: '#15803d', load: () => fetchCourseLearningOutcomesStandalone() },
      { label: 'Users', icon: 'users', sub: 'Registered profiles', accent: '#64748b', load: () => fetchAllProfiles() },
    ]
    Promise.all(counters.map(async (c) => {
      try {
        return { label: c.label, value: (await c.load()).length, accent: c.accent, icon: c.icon, sub: c.sub }
      } catch {
        return { label: c.label, value: 0, accent: c.accent, icon: c.icon, sub: c.sub }
      }
    }))
      .then((rows) => { if (!cancelled) setStats(rows) })
      .catch(() => {})
    fetchActivityLogs().then((logs) => { if (!cancelled) setRecent(logs.slice(0, 5)) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Ticking clock: the greeting and date pill re-render every minute, so a
  // dashboard left open turns over correctly at noon, 6 PM and midnight.
  const clock = useClock()

  const go = (id: string) => onNavigate?.(id)

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
          <p className="dashbanner__desc">
            Track your program's outcomes, view CLO progress, and explore alignment across subjects.
          </p>
        </div>
        <time className="dashbanner__date" dateTime={localISODate(clock)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span>{clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </time>
      </section>

      <div className="stat-grid stat-grid--2026" aria-busy={loading}>

        {loading
          ? ['stat-1', 'stat-2', 'stat-3', 'stat-4', 'stat-5', 'stat-6'].map((label) => (
            <div className="stat-card stat-card--2026 stat-card--skeleton card-enter" key={label} aria-hidden="true">
              <span className="stat-card__label">Loading</span>
              <span className="stat-card__value">—</span>
              <span className="stat-card__sub">Loading</span>
            </div>
          ))
          : stats.map((s) => (
          <div className="stat-card stat-card--2026 card-enter" key={s.label}>
            <div className="stat-card__accent" style={{ background: s.accent }} />
            <div className="stat-card__icon" style={{ background: s.accent, color: '#fff' }}>
              <StatIcon type={s.icon} />
            </div>
            <span className="stat-card__label">{s.label}</span>
            <span className="stat-card__value">{s.value ?? '—'}</span>
            <span className="stat-card__sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <h3>Quick actions</h3>
            <span>Your most used flows</span>
          </div>
          <div className="quick-actions">
            <button className="quick-action" type="button" onClick={() => go('curriculum')}>
              <span className="quick-action__icon" style={{ background: '#16a34a' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>
              </span>
              <span className="quick-action__text"><strong>Curriculum</strong><small>Create / edit curriculum</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('course')}>
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
              </span>
              <span className="quick-action__text"><strong>Course</strong><small>Create / edit courses</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('program-outcomes')}>
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M3 3v18h18" /><path d="M7 16l3-3 3 3 5-8" /></svg>
              </span>
              <span className="quick-action__text"><strong>Program Outcomes</strong><small>PO review & mapping</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('subject-view')}>
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.07 18.93A10 10 0 0 0 21 12M2.93 5.07A10 10 0 0 1 12 3" /><path d="M12 12m-7 0a7 7 0 0 1 14 0" /></svg>
              </span>
              <span className="quick-action__text"><strong>Subject Graph</strong><small>Prerequisite visualization</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('activity-logs')}>
              <span className="quick-action__icon" style={{ background: '#64748b' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </span>
              <span className="quick-action__text"><strong>Activity Logs</strong><small>Audit trail</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
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

function StatIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'users':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case 'program':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><circle cx="12" cy="9" r="1.5" /></svg>
    case 'course':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><circle cx="12" cy="9" r="1.5" /></svg>
    case 'po':
      return <svg {...common}><path d="M3 3v18h18" /><path d="M7 16l3-3 3 3 5-8" /></svg>
    case 'clo':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    default:
      return null
  }
}

export default Dashboard

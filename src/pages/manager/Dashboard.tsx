// Manager dashboard — normal dashboard experience for program head / CQI lead.
// Mirrors admin's 2026 premium layout but scoped to manager capabilities:
// curriculum records, programs/courses, outcomes alignment, faculty & audit trail.

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

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Array<{ label: string; value: number | null; accent: string; icon: string; sub: string }>>([])
  const [recent, setRecent] = useState<ActivityLogEntry[]>([])

  useEffect(() => {
    const counters = [
      { label: 'Curriculum Records', icon: 'clo', sub: 'Published curriculum', accent: 'linear-gradient(135deg,#0ea5e9,#6366f1)', load: () => fetchResources() },
      { label: 'Programs', icon: 'program', sub: 'Degree offerings', accent: 'linear-gradient(135deg,#10b981,#06b6d4)', load: () => fetchPrograms() },
      { label: 'Courses', icon: 'course', sub: 'Across programs', accent: 'linear-gradient(135deg,#8b5cf6,#ec4899)', load: () => fetchCourses() },
      { label: 'Program Outcomes', icon: 'po', sub: 'PO alignment', accent: 'linear-gradient(135deg,#f59e0b,#ef4444)', load: () => fetchProgramOutcomesStandalone() },
      { label: 'Course Outcomes', icon: 'clo', sub: 'CLOs per course', accent: 'linear-gradient(135deg,#06b6d4,#3b82f6)', load: () => fetchCourseLearningOutcomesStandalone() },
      { label: 'Faculty', icon: 'users', sub: 'Registered profiles', accent: 'linear-gradient(135deg,#16a34a,#0ea5e9)', load: () => fetchAllProfiles() },
    ]
    Promise.all(counters.map(async (c) => ({ label: c.label, value: (await c.load()).length, accent: c.accent, icon: c.icon, sub: c.sub })))
      .then(setStats)
      .catch(() => {})
    fetchActivityLogs().then((logs) => setRecent(logs.slice(0, 5))).catch(() => {})
  }, [])

  const totalRecords = stats.length > 0 ? stats.reduce((a, s) => a + (s.value ?? 0), 0) : 0

  function getTimeGreeting(): string {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const go = (id: string) => onNavigate?.(id)

  return (
    <div className="dashboard dashboard--2026 page-enter">
      <section className="hero-modern hero-modern--dashboard" aria-labelledby="hero-title">
        <div className="hero-modern__bg" aria-hidden>
          <div className="hero-modern__mesh" />
          <div className="hero-modern__orb hero-modern__orb--1" />
          <div className="hero-modern__orb hero-modern__orb--2" />
          <div className="hero-modern__orb hero-modern__orb--3" />
          <div className="hero-modern__noise" />
        </div>

        <div className="hero-modern__content">
          <header className="hero-modern__header">
            <span className="hero-modern__time">{getTimeGreeting()}</span>
            <time className="hero-modern__date" dateTime={new Date().toISOString().split('T')[0]}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </time>
          </header>

          <div className="hero-modern__main" id="hero-title">
            <div className="hero-modern__identity">
              <div className="hero-modern__intro">
                <h1 className="hero-modern__name">Welcome back, {profile?.full_name || profile?.email?.split('@')[0]}</h1>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="stat-grid stat-grid--2026">

        {stats.map((s) => (
          <div className="stat-card stat-card--2026 card-enter" key={s.label}>
            <div className="stat-card__accent" style={{ background: s.accent }} />
            <div className="stat-card__icon" style={{ background: s.accent, color: '#fff' }}>
              <StatIcon type={s.icon} />
            </div>
            <span className="stat-card__label">{s.label}</span>
            <span className="stat-card__value">{s.value ?? '...'}</span>
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
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>
              </span>
              <span className="quick-action__text"><strong>Curriculum</strong><small>Create / edit curriculum</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('program-outcomes')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M3 3v18h18" /><path d="M7 16l3-3 3 3 5-8" /></svg>
              </span>
              <span className="quick-action__text"><strong>Program Outcomes</strong><small>PO review & mapping</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('subject-view')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.07 18.93A10 10 0 0 0 21 12M2.93 5.07A10 10 0 0 1 12 3" /><path d="M12 12m-7 0a7 7 0 0 1 14 0" /></svg>
              </span>
              <span className="quick-action__text"><strong>Subject Graph</strong><small>Prerequisite visualization</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('activity-logs')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
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

      <div className="dashboard-panel" style={{ marginTop: 2 }}>
        <div className="dashboard-panel__header">
          <h3>What you can do</h3>
          <span>Manager permissions</span>
        </div>
        <ul className="role-list" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
          <li><strong>Curriculum</strong> — map courses to program outcomes, maintain CLO/PO alignment, and publish curriculum data.</li>
          <li><strong>Faculty</strong> — browse all user profiles (read-only).</li>
          <li><strong>Activity Logs</strong> — view the record of actions for your programs.</li>
          <li><strong>Subject Graph</strong> — explore prerequisite / corequisite relationships visually.</li>
        </ul>
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

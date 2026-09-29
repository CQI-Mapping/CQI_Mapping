import { useState, useEffect } from 'react'
import {
  fetchAllProfiles,
  fetchStrategicGoals,
  fetchProgramEducationalObjectives,
  fetchProgramOutcomesStandalone,
  fetchCourseLearningOutcomesStandalone,
  fetchChedMemoOrders,
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
  const loading = stats.length === 0

  useEffect(() => {
    let cancelled = false
    const counters = [
      { label: 'Users', icon: 'users', sub: 'Registered profiles', accent: 'linear-gradient(135deg,#0ea5e9,#6366f1)', load: () => fetchAllProfiles() },
      { label: 'Strategic Goals', icon: 'goals', sub: 'Institutional goals', accent: 'linear-gradient(135deg,#10b981,#06b6d4)', load: () => fetchStrategicGoals() },
      { label: 'Program Educational Objectives', icon: 'peo', sub: 'Graduate PEOs', accent: 'linear-gradient(135deg,#f59e0b,#ef4444)', load: () => fetchProgramEducationalObjectives() },
      { label: 'Program Outcomes', icon: 'po', sub: 'Program outcomes mapping', accent: 'linear-gradient(135deg,#8b5cf6,#ec4899)', load: () => fetchProgramOutcomesStandalone() },
      { label: 'Course Learning Outcomes', icon: 'clo', sub: 'CLOs per course', accent: 'linear-gradient(135deg,#06b6d4,#3b82f6)', load: () => fetchCourseLearningOutcomesStandalone() },
      { label: 'CHED Memo Orders', icon: 'ched', sub: 'CHED policies', accent: 'linear-gradient(135deg,#84cc16,#16a34a)', load: () => fetchChedMemoOrders() },
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

  const go = (id: string) => onNavigate?.(id)

  function getTimeGreeting(): string {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

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
            <span>One-click presentable flows</span>
          </div>
          <div className="quick-actions">
            <button className="quick-action" type="button" onClick={() => go('program')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
              </span>
              <span className="quick-action__text"><strong>Add Program</strong><small>Create degree offering</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('clo')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>
              </span>
              <span className="quick-action__text"><strong>Map CLO → PO</strong><small>Curriculum matrix</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('program-outcomes')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>
              </span>
              <span className="quick-action__text"><strong>Review Outcomes</strong><small>PO alignment check</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('activity-logs')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
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

function StatIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'users':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'goals':
      return <svg {...common}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    case 'peo':
      return <svg {...common}><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
    case 'po':
      return <svg {...common}><path d="M3 3v18h18"/><path d="M7 16l3-3 3 3 5-8"/></svg>
    case 'clo':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    case 'ched':
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    default:
      return null
  }
}

export default Dashboard

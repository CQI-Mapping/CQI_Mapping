// User dashboard — faculty role: CLOs + Subject Graph only.
// Shows subject/outcome counts + recent CLO updates.
import { useState, useEffect } from 'react'
import {
  fetchCourses,
  fetchCourseLearningOutcomesStandalone,
} from '../../services/database'
import type { Profile, CourseLearningOutcomeStandalone } from '../../services/database'

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Array<{ label: string; value: number | null; accent: string; icon: string; sub: string }>>([])
  const [recent, setRecent] = useState<CourseLearningOutcomeStandalone[]>([])
  const loading = stats.length === 0

  useEffect(() => {
    let cancelled = false
    const counters = [
      { label: 'Subjects', icon: 'course', sub: 'Available subjects', accent: 'linear-gradient(135deg,#8b5cf6,#ec4899)', load: () => fetchCourses() },
      { label: 'Course Outcomes', icon: 'clo', sub: 'CLOs per course', accent: 'linear-gradient(135deg,#f59e0b,#ef4444)', load: () => fetchCourseLearningOutcomesStandalone() },
    ]
    Promise.all(
      counters.map(async (c) => {
        try {
          return { label: c.label, value: (await c.load()).length, accent: c.accent, icon: c.icon, sub: c.sub }
        } catch {
          return { label: c.label, value: 0, accent: c.accent, icon: c.icon, sub: c.sub }
        }
      })
    )
      .then((rows) => { if (!cancelled) setStats(rows) })
      .catch(() => {})

    // Recent CLOs as the faculty feed (audit log is manager/admin only)
    fetchCourseLearningOutcomesStandalone()
      .then((clos) => { if (!cancelled) setRecent([...clos].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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

      <div className="stat-grid stat-grid--2026" aria-busy={loading}>

        {loading
          ? ['stat-1', 'stat-2'].map((label) => (
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
            <span>Browse your workspace</span>
          </div>
          <div className="quick-actions">
            <button className="quick-action" type="button" onClick={() => go('clo')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              </span>
              <span className="quick-action__text"><strong>Course Outcomes</strong><small>View CLOs by course</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('subject-view')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.07 18.93A10 10 0 0 0 21 12M2.93 5.07A10 10 0 0 1 12 3" /><path d="M12 12m-7 0a7 7 0 0 1 14 0" /></svg>
              </span>
              <span className="quick-action__text"><strong>Subject Graph</strong><small>Prerequisite map</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('profile')}>
              <span className="quick-action__icon" style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.418 3.582-7 8-7s8 2.582 8 7" /></svg>
              </span>
              <span className="quick-action__text"><strong>My Profile</strong><small>Update your name</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel__header">
            <h3>Recent outcomes</h3>
            <span>Latest 5 CLOs</span>
          </div>
          {recent.length === 0 ? (
            <p className="dashboard-panel__empty">No course outcomes yet.</p>
          ) : (
            <ul className="activity-feed">
              {recent.map((r) => (
                <li key={r.id} className="activity-feed__item">
                  <span className="activity-feed__dot" style={{ background: r.status === 'archived' ? '#94a3b8' : '#22c55e', boxShadow: r.status === 'archived' ? '0 0 0 4px #f1f5f9' : '0 0 0 4px #dcfce7' }} />
                  <span className="activity-feed__action">{r.code || r.title}</span>
                  <span className="activity-feed__user">{[r.course, r.title].filter(Boolean).join(' · ').slice(0, 60) || '—'}</span>
                  <time className="activity-feed__time">{new Date(r.created_at).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="dashboard-panel" style={{ marginTop: 2 }}>
        <div className="dashboard-panel__header">
          <h3>What you can do</h3>
          <span>Faculty permissions</span>
        </div>
        <ul className="role-list" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
          <li><strong>Course Learning Outcomes</strong> — browse CLOs scoped to your courses.</li>
          <li><strong>Subject Graph</strong> — explore how courses connect via prerequisites.</li>
          <li><strong>Profile</strong> — update your own name and contact details.</li>
        </ul>
      </div>
    </div>
  )
}

function StatIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'curriculum':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
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

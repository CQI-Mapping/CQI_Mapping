import { useState, useEffect } from 'react'
import {
  fetchAllProfiles,
  fetchStrategicGoals,
  fetchProgramEducationalObjectives,
  fetchProgramOutcomesStandalone,
  fetchCourseLearningOutcomesStandalone,
  fetchChedMemoOrders,
} from '../../services/database'
import type { Profile } from '../../services/database'

interface DashboardProps {
  profile: Profile | null
}

function Dashboard({ profile }: DashboardProps) {
  const [stats, setStats] = useState<Array<{ label: string; value: number | null; accent: string; icon: string }>>([])

  useEffect(() => {
    const counters = [
      { label: 'Users', icon: 'users', accent: 'linear-gradient(135deg,#0ea5e9,#6366f1)', load: () => fetchAllProfiles() },
      { label: 'Strategic Goals', icon: 'goals', accent: 'linear-gradient(135deg,#10b981,#06b6d4)', load: () => fetchStrategicGoals() },
      { label: 'Program Educational Objectives', icon: 'peo', accent: 'linear-gradient(135deg,#f59e0b,#ef4444)', load: () => fetchProgramEducationalObjectives() },
      { label: 'Program Outcomes', icon: 'po', accent: 'linear-gradient(135deg,#8b5cf6,#ec4899)', load: () => fetchProgramOutcomesStandalone() },
      { label: 'Course Learning Outcomes', icon: 'clo', accent: 'linear-gradient(135deg,#06b6d4,#3b82f6)', load: () => fetchCourseLearningOutcomesStandalone() },
      { label: 'CHED Memo Orders', icon: 'ched', accent: 'linear-gradient(135deg,#84cc16,#16a34a)', load: () => fetchChedMemoOrders() },
    ]
    Promise.all(counters.map(async (c) => ({ label: c.label, value: (await c.load()).length, accent: c.accent, icon: c.icon })))
      .then(setStats)
  }, [])

  const totalRecords = stats.length > 0 ? stats.reduce((a, s) => a + (s.value ?? 0), 0) : 0

  function getTimeGreeting(): string {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="dashboard dashboard--2026">
      <section className="hero-modern" aria-labelledby="hero-title">
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
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </time>
          </header>

          <div className="hero-modern__main" id="hero-title">
            <div className="hero-modern__identity">
              <h1 className="hero-modern__name">Welcome back, {profile?.full_name || profile?.email}</h1>
            </div>
          </div>
        </div>
      </section>

      <div className="stat-grid stat-grid--2026">
        <div className="stat-card stat-card--2026 stat-card--role">
          <div className="stat-card__accent" style={{ background: 'linear-gradient(135deg,#16a34a,#0ea5e9)' }} />
          <div className="stat-card__icon" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M6 20a6 6 0 0 1 12 0"/></svg>
          </div>
          <span className="stat-card__label">Your role</span>
          <span className="stat-card__value stat-card__value--role">admin</span>
          <span className="stat-card__sub">Controls what you can do in this app</span>
        </div>

        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="stat-card__label">{s.label}</span>
            <span className="stat-card__value">{s.value ?? '...'}</span>
            <span className="stat-card__sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>What can you do here?</h3>
        <ul className="role-list">
          <li><strong>Users &amp; Accounts</strong> — manage accounts and roles, create or delete users.</li>
          <li><strong>Program Educational Objectives / Program Outcomes / Course Learning Outcomes</strong> — full CRUD on the outcome reference lists.</li>
          <li><strong>Strategic Goals &amp; CHED Memorandum Orders</strong> — maintain institutional goals and CHED issuances.</li>
          <li><strong>Activity Logs</strong> — see a server-stamped record of actions taken in the system.</li>
        </ul>
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
      return <svg {...common}><path d="M22 10v6a2 2 0 0 1-2 2H6l-4 4V10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/></svg>
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

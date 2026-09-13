import { useState, useEffect, useRef } from 'react'
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

interface Stat {
  label: string
  value: number | null
  sub: string
  icon: string
  accent: string
}

function StatIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'users':
      return (
        <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      )
    case 'goals':
      return (
        <svg {...common}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
      )
    case 'peo':
      return (
        <svg {...common}><path d="M22 10v6a2 2 0 0 1-2 2H6l-4 4V10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/></svg>
      )
    case 'po':
      return (
        <svg {...common}><path d="M3 3v18h18"/><path d="M7 16l3-3 3 3 5-8"/></svg>
      )
    case 'clo':
      return (
        <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      )
    case 'ched':
      return (
        <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      )
    default:
      return null
  }
}

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<number>()
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.floor(eased * value))
      if (p < 1) ref.current = requestAnimationFrame(animate)
    }
    ref.current = requestAnimationFrame(animate)
    return () => ref.current && cancelAnimationFrame(ref.current)
  }, [value, duration])
  return <span className="hero-modern__stat-val">{display.toLocaleString()}</span>
}

function getTimeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback.toUpperCase()
  return name.split(/[\s-]+/).map((w) => w[0] ?? '').filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function Dashboard({ profile }: DashboardProps) {
  const [stats, setStats] = useState<Stat[]>([])
  const totalRecords = stats.length > 0 ? stats.reduce((a, s) => a + (s.value ?? 0), 0) : 0

  useEffect(() => {
    const counters: Array<{ label: string; sub: string; icon: string; accent: string; load: () => Promise<unknown[]> }> = [
      { label: 'Users', sub: 'Registered profiles', icon: 'users', accent: 'linear-gradient(135deg,#0ea5e9,#6366f1)', load: () => fetchAllProfiles() },
      { label: 'Strategic Goals', sub: 'Institutional alignment', icon: 'goals', accent: 'linear-gradient(135deg,#10b981,#06b6d4)', load: () => fetchStrategicGoals() },
      { label: 'Program Educational Objectives', sub: 'Graduate attributes', icon: 'peo', accent: 'linear-gradient(135deg,#f59e0b,#ef4444)', load: () => fetchProgramEducationalObjectives() },
      { label: 'Program Outcomes', sub: 'PO-1 → PO-27', icon: 'po', accent: 'linear-gradient(135deg,#8b5cf6,#ec4899)', load: () => fetchProgramOutcomesStandalone() },
      { label: 'Course Learning Outcomes', sub: 'Course-level competencies', icon: 'clo', accent: 'linear-gradient(135deg,#06b6d4,#3b82f6)', load: () => fetchCourseLearningOutcomesStandalone() },
      { label: 'CHED Memo Orders', sub: 'CHED Memorandum Orders', icon: 'ched', accent: 'linear-gradient(135deg,#84cc16,#16a34a)', load: () => fetchChedMemoOrders() },
    ]
    Promise.all(counters.map(async (c) => ({ label: c.label, sub: c.sub, icon: c.icon, accent: c.accent, value: (await c.load()).length })))
      .then(setStats)
  }, [])

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
            <div className="hero-modern__greeting">
              <span className="hero-modern__time">{getTimeGreeting()}</span>
              <span className="hero-modern__divider" aria-hidden />
              <time className="hero-modern__date" dateTime={new Date().toISOString().split('T')[0]}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </time>
            </div>
          </header>

          <div className="hero-modern__main" id="hero-title">
            <div className="hero-modern__identity">
              <div className="hero-modern__intro">
                <h1 className="hero-modern__name">Welcome back, {profile?.full_name || profile?.email}</h1>
                <p className="hero-modern__role">
                  <span className="hero-modern__role-dot" aria-hidden />
                  <span>Full system access</span>
                </p>
              </div>
            </div>

            <div className="hero-modern__stats" role="region" aria-label="System statistics">
              <div className="hero-modern__stat">
                <AnimatedNumber value={totalRecords} />
                <span className="hero-modern__stat-label">Total Records</span>
              </div>
              <div className="hero-modern__stat-sep" aria-hidden />
              <div className="hero-modern__stat">
                <AnimatedNumber value={stats.length} />
                <span className="hero-modern__stat-label">Categories</span>
              </div>
              <div className="hero-modern__stat-sep" aria-hidden />
              <div className="hero-modern__stat">
                <span className="hero-modern__val hero-modern__val--active">Active</span>
                <span className="hero-modern__stat-label">System Status</span>
              </div>
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

        {stats.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="stat-card stat-card--2026 stat-card--skeleton">
                <div className="stat-card__icon stat-card__icon--skeleton" />
                <span className="stat-card__label">Loading…</span>
                <span className="stat-card__value">—</span>
                <span className="stat-card__sub">Fetching data</span>
              </div>
            ))
          : stats.map((s) => (
              <div className="stat-card stat-card--2026" key={s.label}>
                <div className="stat-card__accent" style={{ background: s.accent }} />
                <div className="stat-card__icon" style={{ background: s.accent }}>
                  <StatIcon type={s.icon} />
                </div>
                <span className="stat-card__label">{s.label}</span>
                <span className="stat-card__value">{s.value ?? '…'}</span>
                <span className="stat-card__sub">{s.sub}</span>
              </div>
            ))}
      </div>
    </div>
  )
}

export default Dashboard

// User dashboard — faculty role: CLOs + Subject Graph only.
// Shows subject/outcome counts and the newest CLO updates — stat cards and
// feed rows act as buttons into their pages, and each feed row opens the
// shared read-only CLO modal.
import { useState, useEffect } from 'react'
import {
  fetchCourses,
  fetchCourseLearningOutcomesStandalone,
} from '../../services/database'
import type { Profile, Course, CourseLearningOutcomeStandalone } from '../../services/database'
import CloViewModal from '../../components/CloViewModal'
import { useClock } from '../../hooks/useClock'
import { localISODate, timeGreeting } from '../../utils/clock'

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

interface StatCard {
  label: string
  value: string
  accent: string
  icon: string
  sub: string
  target: string
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
  const [loaded, setLoaded] = useState(false)
  const [viewItem, setViewItem] = useState<CourseLearningOutcomeStandalone | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchCourses(), fetchCourseLearningOutcomesStandalone()])
      .then(([c, l]) => {
        if (!cancelled) {
          setCourses(c)
          setClos(l)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const stats: StatCard[] = [
    { label: 'Subjects', value: String(courses.length), accent: '#16a34a', icon: 'course', sub: 'Available subjects', target: 'subject-view' },
    { label: 'Course Outcomes', value: String(clos.length), accent: '#15803d', icon: 'clo', sub: 'CLOs per course', target: 'clo' },
  ]

  // Recent CLOs as the faculty feed (audit log is manager/admin only).
  const recent = [...clos]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5)

  // Ticking clock: the greeting and date pill re-render every minute, so a
  // dashboard left open turns over correctly at noon, 6 PM and midnight.
  const clock = useClock()

  const go = (id: string) => onNavigate?.(id)

  const activate = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }

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
            <span className="dashbanner__badge">Faculty</span>
            <span className="dashbanner__sep">•</span>
            <span className="dashbanner__role">User</span>
          </div>
          <p className="dashbanner__desc">
            Track your course outcomes, view your CLO progress, and explore subjects aligned with your program.
          </p>
        </div>
        <time className="dashbanner__date" dateTime={localISODate(clock)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span>{clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </time>
      </section>

      <div className="stat-grid stat-grid--2026" aria-busy={!loaded}>
        {!loaded
          ? ['stat-1', 'stat-2'].map((label) => (
            <div className="stat-card stat-card--2026 stat-card--skeleton card-enter" key={label} aria-hidden="true">
              <span className="stat-card__label">Loading</span>
              <span className="stat-card__value">—</span>
              <span className="stat-card__sub">Loading</span>
            </div>
          ))
          : stats.map((s) => (
            <div
              className="stat-card stat-card--2026 stat-card--link card-enter"
              key={s.label}
              role="button"
              tabIndex={0}
              onClick={() => go(s.target)}
              onKeyDown={(e) => activate(e, () => go(s.target))}
              aria-label={`Open ${s.label}`}
            >
              <div className="stat-card__accent" style={{ background: s.accent }} />
              <div className="stat-card__icon" style={{ background: s.accent, color: '#fff' }}>
                <StatIcon type={s.icon} />
              </div>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value}</span>
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
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              </span>
              <span className="quick-action__text"><strong>Course Outcomes</strong><small>View CLOs by course</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('subject-view')}>
              <span className="quick-action__icon" style={{ background: '#15803d' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.07 18.93A10 10 0 0 0 21 12M2.93 5.07A10 10 0 0 1 12 3" /><path d="M12 12m-7 0a7 7 0 0 1 14 0" /></svg>
              </span>
              <span className="quick-action__text"><strong>Subject Graph</strong><small>Prerequisite map</small></span>
              <svg className="quick-action__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button className="quick-action" type="button" onClick={() => go('profile')}>
              <span className="quick-action__icon" style={{ background: '#16a34a' }}>
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
            <span>Latest 5 CLOs · click to view</span>
          </div>
          {recent.length === 0 ? (
            <p className="dashboard-panel__empty">No course outcomes yet.</p>
          ) : (
            <ul className="activity-feed">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="activity-feed__item activity-feed__item--link"
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewItem(r)}
                  onKeyDown={(e) => activate(e, () => setViewItem(r))}
                  aria-label={`View ${r.code || 'course outcome'}`}
                >
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

      {viewItem && <CloViewModal item={viewItem} onClose={() => setViewItem(null)} />}
    </div>
  )
}

function StatIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
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

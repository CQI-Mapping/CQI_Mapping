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
import MapBrief from '../../components/MapBrief'
import MapPreview from '../../components/MapPreview'

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
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
    return () => { cancelled = true }
  }, [])

  // Recent outcomes, BY SUBJECT: one row per subject that has CLO activity —
  // ordered by the subject's newest CLO, capped at 5. Faculty scan subjects,
  // not individual CLO codes, so each row leads with the subject and carries
  // the CLO count; clicking a subject opens its latest CLO in the modal.
  // Rows show "CODE — Name" (resolved from the loaded course list) so the
  // subject reads like everywhere else in the app; a code that no longer
  // resolves falls back to the bare code.
  const courseTitleByCode = (code: string) =>
    courses.find((c) => c.code === code)?.title || ''

  const subjectFeed = (() => {
    const byCourse = new Map<string, CourseLearningOutcomeStandalone[]>()
    for (const l of clos) {
      const key = (l.course || '').trim() || '—'
      const list = byCourse.get(key) ?? []
      list.push(l)
      byCourse.set(key, list)
    }
    return [...byCourse.entries()]
      .map(([course, rows]) => ({
        course,
        rows,
        latest: [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0],
      }))
      .sort((a, b) => +new Date(b.latest.created_at) - +new Date(a.latest.created_at))
      .slice(0, 5)
  })()

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

      {/* The program's curriculum at a glance — the blocks that used to open
          the Generate Map page (KPI tiles, mapping summary, PO coverage).
          Faculty have no "View All Courses" page, so that footer is inert.
          (The two link tiles that used to sit here — Subjects and Course
          Outcomes — duplicated this block's Total Courses / Total CLO's.) */}
      <MapBrief profile={profile} onNavigate={onNavigate} />

      {/* The live OBE Curriculum Map itself — Year·Semester columns, the year
          palette, amber prerequisite wires and the press-to-trace spotlight.
          Picks its curriculum the same way Generate Map's landing boot does,
          beneath the brief so the figures and the picture read together. */}
      <MapPreview profile={profile} onNavigate={onNavigate} />

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
              <span className="quick-action__text"><strong>Generate Map</strong><small>Start Visualization</small></span>
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
            <span>Latest 5 subjects · click to view</span>
          </div>
          {subjectFeed.length === 0 ? (
            <p className="dashboard-panel__empty">No course outcomes yet.</p>
          ) : (
            <ul className="activity-feed activity-feed--plain">
              {subjectFeed.map(({ course, rows, latest }) => {
                const newest = latest.code || latest.title || 'course outcome'
                return (
                  <li
                    key={course}
                    className="activity-feed__item activity-feed__item--link"
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewItem(latest)}
                    onKeyDown={(e) => activate(e, () => setViewItem(latest))}
                    aria-label={`View subject ${course !== '—' ? course : ''} outcomes`}
                  >
                    <span className="activity-feed__action">
                      {course}{courseTitleByCode(course) ? ` — ${courseTitleByCode(course)}` : ''}
                    </span>
                    <span className="activity-feed__user">
                      {`${rows.length} CLO${rows.length === 1 ? '' : 's'} · latest ${newest}`}
                    </span>
                    <time className="activity-feed__time">{new Date(latest.created_at).toLocaleString()}</time>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {viewItem && <CloViewModal item={viewItem} onClose={() => setViewItem(null)} />}
    </div>
  )
}

export default Dashboard

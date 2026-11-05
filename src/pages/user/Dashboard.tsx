// User dashboard — the faculty home. It opens on the next step to take, shows
// the figures for the outcomes this faculty member owns, lists the subjects
// they have written for, and closes with the program brief (the MapBrief
// figures and the live curriculum map) that the admin and manager dashboards
// embed as well.
//
// Everything personal here is data the faculty role can read: its own CLOs
// (RLS scopes them to the owner) and the shared subject list. The rules that
// turn those rows into figures live in utils/facultyDashboard.ts.
import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  fetchCourses,
  fetchCourseLearningOutcomesStandalone,
} from '../../services/database'
import type { Profile, Course, CourseLearningOutcomeStandalone } from '../../services/database'
import CloViewModal from '../../components/CloViewModal'
import MapBrief from '../../components/MapBrief'
import MapPreview from '../../components/MapPreview'
import { useClock } from '../../hooks/useClock'
import { localISODate, timeGreeting } from '../../utils/clock'
import { timeAgo } from '../../utils/time'
import { groupOutcomesBySubject, ownFigures, planNextStep, weeklyEditTrend } from '../../utils/facultyDashboard'
import type { EditWeek, NextStep } from '../../utils/facultyDashboard'

interface DashboardProps {
  profile: Profile | null
  onNavigate?: (page: string) => void
}

/** Subject rows the list shows before pointing at the full outcomes page. */
const SUBJECT_ROWS = 5

/** Line icon on the 24-unit grid, drawn in the current colour. */
function Glyph({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function Chevron() {
  return (
    <span className="fac-chev">
      <Glyph size={16}><path d="M9 18l6-6-6-6" /></Glyph>
    </span>
  )
}

/** The quick actions, in the order the faculty sidebar lists its pages. */
const ACTIONS: Array<{ page: string; label: string; hint: string; tone: string; icon: ReactNode }> = [
  {
    page: 'clo',
    label: 'Course Outcomes',
    hint: 'Write and edit CLOs',
    tone: '#15803d',
    icon: (
      <Glyph>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </Glyph>
    ),
  },
  {
    page: 'subject-view',
    label: 'Generate Map',
    hint: 'Open the subject graph',
    tone: '#4d7c0f',
    icon: (
      <Glyph>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 18.93A10 10 0 0 0 21 12M2.93 5.07A10 10 0 0 1 12 3" />
        <path d="M12 12m-7 0a7 7 0 0 1 14 0" />
      </Glyph>
    ),
  },
  {
    page: 'tos',
    label: 'Generate TOS',
    hint: 'Build a table of specifications',
    tone: '#16a34a',
    icon: (
      <Glyph>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </Glyph>
    ),
  },
  {
    page: 'profile',
    label: 'My Profile',
    hint: 'Update your name',
    tone: '#0f766e',
    icon: (
      <Glyph>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.418 3.582-7 8-7s8 2.582 8 7" />
      </Glyph>
    ),
  },
]

type HeroCopy = { title: string; detail: string; action: string | null }

/** The hero's next-step card: what to do next, and the button that starts it. */
function describeNextStep(next: NextStep): HeroCopy {
  switch (next.kind) {
    case 'no-subjects':
      return {
        title: 'No subjects yet',
        detail: 'Outcomes are written against subjects. They appear here once the program adds them.',
        action: null,
      }
    case 'start':
      return {
        title: `Start with ${next.subject.code}`,
        detail: [next.subject.title, 'no active outcomes from you yet'].filter(Boolean).join(' · '),
        action: 'Write outcomes',
      }
    case 'next':
      return {
        title: `Next up: ${next.subject.code}`,
        detail: [
          next.subject.title,
          `${next.missing} of ${next.total} subjects still need your outcomes`,
        ].filter(Boolean).join(' · '),
        action: 'Continue outcomes',
      }
    case 'done':
      return {
        title: 'Every subject is covered',
        detail: 'You hold outcomes for every subject. Keep them current as the program changes.',
        action: 'Review outcomes',
      }
  }
}

function FacStat({
  icon,
  tone,
  label,
  value,
  sub,
  text,
  extra,
}: {
  icon: ReactNode
  tone: string
  label: string
  value: string | number
  sub: string
  text?: boolean
  /** Optional trailing media under the sub line, e.g. the week bars. */
  extra?: ReactNode
}) {
  return (
    <article className="fac-stat card-enter">
      <span className="fac-stat__icon" style={{ background: tone }}>{icon}</span>
      <div className="fac-stat__body">
        <span className="fac-stat__label">{label}</span>
        <strong className={text ? 'fac-stat__value fac-stat__value--text' : 'fac-stat__value'}>{value}</strong>
        <span className="fac-stat__sub">{sub}</span>
        {extra && extra}
      </div>
    </article>
  )
}

/** Week-over-week edit history as four inline bars, oldest left, under the
 *  "Edited this week" figure. Bars 0-2 are completed weeks at reduced
 *  opacity; the right-most bar is the same trailing week the figure counts,
 *  so the sparkline can never contradict its own tile. Pure SVG in the
 *  brand green — no chart library, and everything zero renders as a quiet
 *  2-px baseline rather than an empty box. */
function EditTrend({ weeks }: { weeks: EditWeek[] }) {
  const peak = Math.max(1, ...weeks.map((w) => w.count))
  const labelFor = (age: number, count: number) =>
    count === 1 ? `1 edit` : `${count} edits`
  return (
    <svg
      className="fac-stat__trend"
      width={44}
      height={26}
      viewBox="0 0 44 26"
      role="img"
      aria-label={`Edits by week, oldest to this week: ${weeks.map((w) => w.count).join(', ')}`}
    >
      {weeks.map((w, i) => {
        const age = weeks.length - 1 - i
        return (
          <rect
            key={w.end}
            x={4 + i * 9}
            y={26 - Math.max(2, Math.round((w.count / peak) * 22))}
            width={7}
            height={Math.max(2, Math.round((w.count / peak) * 22))}
            rx={2.5}
            fill="#16a34a"
            opacity={age === 0 ? 1 : 0.35}
          >
            <title>{age === 0 ? 'This week' : age === 1 ? 'Last week' : `${age} weeks ago`} — {labelFor(age, w.count)}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function Dashboard({ profile, onNavigate }: DashboardProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [viewItem, setViewItem] = useState<CourseLearningOutcomeStandalone | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchCourses(), fetchCourseLearningOutcomesStandalone()])
      .then(([c, l]) => {
        if (cancelled) return
        setCourses(c)
        setClos(l)
        setFailed(false)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Ticking clock: the greeting, the date pill and every relative time re-read
  // on the minute, so an open dashboard stays true across noon and midnight.
  const clock = useClock()
  const now = clock.getTime()
  const go = (id: string) => onNavigate?.(id)

  const ready = !loading && !failed
  const pending = loading ? 'Loading…' : 'Unavailable right now'
  const figures = useMemo(() => ownFigures(clos, courses, now), [clos, courses, now])
  const trend = useMemo(() => weeklyEditTrend(clos, now), [clos, now])
  const subjects = useMemo(() => groupOutcomesBySubject(clos, courses), [clos, courses])
  const hero = useMemo<HeroCopy>(() => {
    if (loading) return { title: 'Loading your workspace', detail: '', action: null }
    if (failed) return { title: 'Could not load your outcomes', detail: 'Refresh the page to try again.', action: null }
    return describeNextStep(planNextStep(courses, clos))
  }, [loading, failed, courses, clos])
  const name = profile?.nickname || profile?.full_name || profile?.email?.split('@')[0] || 'Welcome'

  return (
    <div className="fac-dash page-enter">
      <section className="fac-hero card-enter" aria-labelledby="fac-hero-name">
        <div className="fac-hero__info">
          <time className="fac-hero__date" dateTime={localISODate(clock)}>
            <Glyph size={15}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </Glyph>
            <span>{clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </time>
          <p className="fac-hero__greeting">{timeGreeting(clock)}</p>
          <h1 className="fac-hero__name" id="fac-hero-name">{name}</h1>
          <span className="fac-hero__chip">Faculty</span>
          <p className="fac-hero__desc">
            Write the course learning outcomes for your subjects, see how they line up with the program,
            and pick up where you left off.
          </p>
        </div>

        <aside className="fac-next" aria-label="Next step">
          <span className="fac-next__label">Next step</span>
          <h2 className="fac-next__title">{hero.title}</h2>
          {hero.detail && <p className="fac-next__detail">{hero.detail}</p>}
          {hero.action && (
            <button type="button" className="btn btn--primary fac-next__btn" onClick={() => go('clo')}>
              {hero.action} →
            </button>
          )}
        </aside>
      </section>

      <div className="fac-stats" aria-busy={loading}>
        <FacStat
          icon={
            <Glyph>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </Glyph>
          }
          tone="#15803d"
          label="Outcomes written"
          value={ready ? figures.total : '—'}
          sub={
            !ready
              ? pending
              : figures.archived > 0
                ? `${figures.active} active · ${figures.archived} archived`
                : 'Course learning outcomes you own'
          }
        />
        <FacStat
          icon={
            <Glyph>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </Glyph>
          }
          tone="#4d7c0f"
          label="Subjects covered"
          value={ready ? figures.covered : '—'}
          sub={
            !ready
              ? pending
              : courses.length > 0
                ? `of ${courses.length} subject${courses.length === 1 ? '' : 's'} in the system`
                : 'No subjects in the system yet'
          }
        />
        <FacStat
          icon={
            <Glyph>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </Glyph>
          }
          tone="#16a34a"
          label="Edited this week"
          value={ready ? figures.editedThisWeek : '—'}
          sub={ready ? 'Changed in the last 7 days' : pending}
          extra={ready ? <EditTrend weeks={trend} /> : undefined}
        />
        <FacStat
          icon={
            <Glyph>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </Glyph>
          }
          tone="#0f766e"
          label="Last edit"
          text
          value={ready && figures.latest ? timeAgo(figures.latest.updated_at, now) : '—'}
          sub={
            !ready
              ? pending
              : figures.latest
                ? [figures.latest.code, figures.latest.course].filter(Boolean).join(' · ')
                : 'Nothing written yet'
          }
        />
      </div>

      <div className="fac-main">
        <section className="fac-card card-enter" aria-labelledby="fac-subjects-title">
          <header className="fac-card__head">
            <h2 id="fac-subjects-title">Your subjects</h2>
            {ready && subjects.length > 0 && <span>Most recently edited first</span>}
          </header>
          {failed && (
            <p className="msg msg--error" role="alert">
              Your outcomes could not be loaded. Refresh the page to try again.
            </p>
          )}
          {loading ? (
            <p className="fac-empty">Loading your subjects…</p>
          ) : ready && subjects.length === 0 ? (
            <div className="fac-empty">
              <p>No outcomes from you yet. Write the first one and its subject will be listed here.</p>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => go('clo')}>
                Write an outcome
              </button>
            </div>
          ) : (
            <ul className="fac-subjects">
              {subjects.slice(0, SUBJECT_ROWS).map((s) => (
                <li key={s.key}>
                  <button type="button" className="fac-subject" onClick={() => setViewItem(s.latest)}>
                    <span className="fac-subject__mark" aria-hidden="true">{s.code}</span>
                    <span className="fac-subject__body">
                      <span className="fac-subject__title">{s.title || s.code}</span>
                      <span className="fac-subject__meta">
                        {[
                          `${s.count} outcome${s.count === 1 ? '' : 's'}`,
                          s.archived > 0 ? `${s.archived} archived` : '',
                          `latest ${s.latest.code}`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <time className="fac-subject__time" dateTime={s.latest.updated_at}>
                      {timeAgo(s.latest.updated_at, now)}
                    </time>
                    <Chevron />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ready && subjects.length > 0 && (
            <footer className="fac-card__foot">
              <span>
                {subjects.length > SUBJECT_ROWS
                  ? `Showing ${SUBJECT_ROWS} of ${subjects.length} subjects`
                  : `${subjects.length} subject${subjects.length === 1 ? '' : 's'}`}
              </span>
              <button type="button" className="fac-card__more" onClick={() => go('clo')}>
                All outcomes →
              </button>
            </footer>
          )}
        </section>

        <section className="fac-card card-enter" aria-labelledby="fac-actions-title">
          <header className="fac-card__head">
            <h2 id="fac-actions-title">Quick actions</h2>
          </header>
          <div className="fac-actions">
            {ACTIONS.map((a) => (
              <button key={a.page} type="button" className="fac-action" onClick={() => go(a.page)}>
                <span className="fac-action__icon" style={{ background: a.tone }}>{a.icon}</span>
                <span className="fac-action__text">
                  <strong>{a.label}</strong>
                  <small>{a.hint}</small>
                </span>
                <Chevron />
              </button>
            ))}
          </div>
          <footer className="fac-card__foot">
            <span>Outcomes you save feed the figures below.</span>
          </footer>
        </section>
      </div>

      <section className="fac-program" aria-labelledby="fac-program-title">
        <header className="fac-program__head">
          <h2 id="fac-program-title">Program at a glance</h2>
          <p>The curriculum on this account. The figures and the map update as outcomes change.</p>
        </header>
        {/* Figures first, then the live map slotted between them and the
            summary and coverage panels. */}
        <MapBrief profile={profile} onNavigate={onNavigate}>
          <MapPreview profile={profile} onNavigate={onNavigate} />
        </MapBrief>
      </section>

      {viewItem && <CloViewModal item={viewItem} onClose={() => setViewItem(null)} />}
    </div>
  )
}

export default Dashboard

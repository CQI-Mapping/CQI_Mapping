// App shell: manages the session, loads the signed-in user's profile, and decides
// which page to render based on their role. No router library — the active page is
// just state, and the role-based NAV map below controls what's visible.
//
// Each role has its own pages in its own folder (src/pages/admin|manager|user),
// mirroring the reference repo's per-role structure.
//
// Admin role pages (sidebar order):
//   Dashboard, Program, CHED Memorandum Orders, Strategic Goals,
//   Program Educational Objectives, Program Outcomes,
//   Curriculum, Course Learning Outcomes, Subject Graph,
//   Curriculum Report (View), Users & Accounts, Activity Logs, Profile

import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/Dashboard'
import AdminActivityLogs from './pages/admin/ActivityLogs'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerUsers from './pages/manager/Users'
import ManagerCurriculum from './pages/manager/Curriculum'
import ManagerCourse from './pages/manager/Course'
import ManagerActivityLogs from './pages/admin/ActivityLogs'
import UserDashboard from './pages/user/Dashboard'
import AdminChedMemoOrders from './pages/admin/ChedMemoOrders'
import AdminStrategicGoals from './pages/admin/StrategicGoals'
import AdminPEOs from './pages/admin/ProgramEducationalObjectives'
import ManagerProgramOutcomes from './pages/manager/ProgramOutcomes'
import AdminProgramOutcomesAdmin from './pages/admin/ProgramOutcomesAdmin'
import UserCourseLearningOutcomes from './pages/user/CourseLearningOutcomes'
import AdminUsers from './pages/admin/Users'
import AdminProgram from './pages/admin/Program'
import AdminSubjectView from './pages/admin/SubjectView'
import AdminView from './pages/admin/View'
import UserCurriculum from './pages/user/Curriculum'
import UserTOS from './pages/user/TOS'
import { supabase } from './utils/supabaseClient'
import { ensureProfile, syncDemoRole } from './services/database'
import type { Profile as ProfileType, UserRole, NavItem } from './services/database'
import type { Session } from '@supabase/supabase-js'

const NAV: Record<UserRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'program', label: 'Program' },
    { id: 'ched-memo', label: 'CHED Memorandum Orders' },
    { id: 'strategic-goals', label: 'Strategic Goals' },
    { id: 'peos', label: 'Program Educational Objectives' },
    { id: 'program-outcomes', label: 'Program Outcomes' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'subject-view', label: 'Subject Graph' },
    { id: 'view', label: 'Curriculum Report' },
    { id: 'users', label: 'Users & Accounts' },
    { id: 'activity-logs', label: 'Activity Logs' },
    { id: 'profile', label: 'Profile' },
  ],
  manager: [
    { id: 'program-outcomes', label: 'Program Outcomes' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'course', label: 'Course' },
    { id: 'subject-view', label: 'Subject Graph' },
    { id: 'users', label: 'Users' },
    { id: 'activity-logs', label: 'Activity Logs' },
    { id: 'profile', label: 'Profile' },
  ],
  user: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'clo', label: 'Course Learning Outcomes' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'subject-view', label: 'Subject Graph' },
    { id: 'tos', label: 'Generate TOS' },
    { id: 'profile', label: 'Profile' },
  ],
}

// PAGES map: page id -> component for each role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PAGES: Record<string, Record<string, React.ComponentType<any>>> = {
  admin: {
    dashboard: AdminDashboard,
    program: AdminProgram,
    peos: AdminPEOs,
    'program-outcomes': AdminProgramOutcomesAdmin,
    curriculum: ManagerCurriculum,
    'subject-view': AdminSubjectView,
    view: AdminView,
    'strategic-goals': AdminStrategicGoals,
    'ched-memo': AdminChedMemoOrders,
    users: AdminUsers,
    'activity-logs': AdminActivityLogs,
    profile: Profile,
  },
  manager: {
    dashboard: ManagerDashboard,
    curriculum: ManagerCurriculum,
    course: ManagerCourse,
    'program-outcomes': ManagerProgramOutcomes,
    'subject-view': AdminSubjectView,
    users: ManagerUsers,
    'activity-logs': ManagerActivityLogs,
    profile: Profile,
  },
  user: {
    dashboard: UserDashboard,
    clo: UserCourseLearningOutcomes,
    curriculum: UserCurriculum,
    'subject-view': AdminSubjectView,
    tos: UserTOS,
    profile: Profile,
  },
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 1024 : true
  )
  // Set when the profile fetch fails (e.g. flaky network). The app then shows
  // a retry screen instead of a stale identity or a silent wrong-role fallback.
  const [profileError, setProfileError] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const profileUserIdRef = useRef<string | null>(null)

  // On first render: subscribe to auth changes. Supabase emits INITIAL_SESSION
  // on subscribe (session or null), which is the single source of truth — no
  // separate getSession() call, so a stale cached session can never render first
  // and flash the wrong account on slow networks.
  useEffect(() => {
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED fires when the tab regains focus (auto token refresh).
      // Ignoring it here keeps the session object identity stable, so the app
      // doesn't briefly mount the Loading screen and unmount the active page
      // (which would wipe any in-progress form input).
      if (event === 'TOKEN_REFRESHED') return
      setSession(session)
      if (!session) {
        setProfile(null)
        setProfileLoaded(false)
        setProfileError('')
        profileUserIdRef.current = null
        setActivePage('dashboard')
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // When the session changes, load the user's profile.
  // ensureProfile auto-creates the row if missing (e.g. after a schema re-run),
  // so a profile-less account no longer breaks the dashboard. sync_demo_role
  // then restores the expected role (demo accounts by email, or first-admin
  // bootstrap when no admin exists), so admin/manager/user land on the right
  // dashboard even after roles were wiped by a schema re-run.
  useEffect(() => {
    if (!session?.user) return
    // Token refreshes may hand us a new session object for the same user.
    // If the profile is already loaded for this user, don't re-enter the
    // loading state (that would unmount the page and lose form input).
    if (profileUserIdRef.current === session.user.id && profileLoaded) return
    profileUserIdRef.current = session.user.id
    setProfileLoaded(false)
    setProfileError('')
    setLoading(true)
    let cancelled = false

    ensureProfile(session.user)
      .then((p) => {
        if (cancelled) return null
        return syncDemoRole()
          .then((role) => {
            if (role && role !== p.role) return { ...p, role }
            return p
          })
          .catch((err) => { console.error('syncDemoRole failed:', err); return p })
      })
      .then((p) => {
        if (cancelled) return
        if (p) {
          setProfile(p)
          setProfileError('')
        } else {
          // ensureProfile resolved empty (shouldn't happen) — treat as failure
          // so we never render another account's stale profile.
          setProfile(null)
          profileUserIdRef.current = null
          setProfileError('Could not load your profile. Check your connection and retry.')
        }
        setProfileLoaded(true)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          // Failure (e.g. timeout on a slow network): drop any previous
          // profile so a stale identity is never shown, and offer a retry.
          setProfile(null)
          profileUserIdRef.current = null
          setProfileError('Could not load your profile. Check your connection and retry.')
          setProfileLoaded(true)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [session, retryTick])

  const handleLogout = async () => {
    await supabase!.auth.signOut()
  }

  // First paint: wait until the stored session has been restored.
  if (loading) {
    return <div className="center-screen">Loading...</div>
  }

  // No session → show the login page.
  if (!session) {
    return <Login />
  }

  // Profile still loading → show spinner (prevents flashing the wrong role dashboard).
  if (!profileLoaded) {
    return <div className="center-screen">Loading...</div>
  }

  // Profile fetch failed (e.g. timeout on a slow network) → retry screen.
  // Never fall back to another account's stale profile or a silent wrong role.
  if (profileError || !profile) {
    return (
      <div className="center-screen">
        <div className="config-error__card">
          <h1>Connection issue</h1>
          <p>{profileError || 'Your profile could not be loaded.'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setProfileError('')
                setProfileLoaded(false)
                setLoading(true)
                setRetryTick((t) => t + 1)
              }}
            >
              Retry
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Role from the profile; unknown/missing roles fall back to 'user' (least privilege).
  const role: UserRole = (profile?.role ?? 'user') as UserRole
  const navItems = NAV[role] ?? NAV.user

  // Gating: coerce the requested page to one this role can access
  const page = navItems.some((n: NavItem) => n.id === activePage)
    ? activePage
    : navItems[0]?.id ?? 'dashboard'

  const renderPage = () => {
    const Page = PAGES[role]?.[page] ?? PAGES[role]?.[navItems[0]?.id] ?? UserDashboard

    if (page === 'dashboard') return <Page profile={profile} onNavigate={setActivePage} />
    if (page === 'profile') return <Page profile={profile} onSaved={setProfile} />
    if (page === 'users') return <Page />
    if (page === 'curriculum' && role !== 'user') return <Page userEmail={profile?.email} allowDelete={role === 'admin'} />
    if (page === 'curriculum' && role === 'user') return <Page />
    if (page === 'view') return <Page userEmail={profile?.email} />
    return <Page profile={profile} onNavigate={setActivePage} />
  }

  return (
    <div className="app-layout">
      <Sidebar
        navItems={navItems}
        activePage={page}
        onNavigate={setActivePage}
        onLogout={handleLogout}
        role={role}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        profileName={profile?.full_name}
        profileEmail={profile?.email}
      />

      <div className="main-content">
        <main className="content-area">
          <div className="page-container">{renderPage()}</div>
        </main>
      </div>
    </div>
  )
}

export default App

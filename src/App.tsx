// App shell: manages the session, loads the signed-in user's profile, and decides
// which page to render based on their role. No router library — the active page is
// just state, and the role-based NAV map below controls what's visible.
//
// Each role has its own pages in its own folder (src/pages/admin|manager|user),
// mirroring the reference repo's per-role structure.
//
// Admin role pages (sidebar order):
//   Dashboard, Program Educational Objectives, Program Outcomes,
//   Course Learning Outcomes, Strategic Goals, CHED Memorandum Orders,
//   Activity Logs, Profile
//
// Note: Users & Accounts, Curriculum, CLO/PO Mapping, and Analytics were
// removed from the admin role in this version. The manager role retains
// its own Curriculum, Faculty, and Activity Logs pages.

import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/Dashboard'
import AdminActivityLogs from './pages/admin/ActivityLogs'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerUsers from './pages/manager/Users'
import ManagerCurriculum from './pages/manager/Curriculum'
import ManagerActivityLogs from './pages/admin/ActivityLogs'
import UserDashboard from './pages/user/Dashboard'
import UserCurriculum from './pages/user/Curriculum'
import AdminChedMemoOrders from './pages/admin/ChedMemoOrders'
import AdminStrategicGoals from './pages/admin/StrategicGoals'
import AdminPEOs from './pages/admin/ProgramEducationalObjectives'
import AdminProgramOutcomes from './pages/admin/ProgramOutcomes'
import AdminCourseLearningOutcomes from './pages/admin/CourseLearningOutcomes'
import AdminUsers from './pages/admin/Users'
import { supabase } from './utils/supabaseClient'
import { ensureProfile, syncDemoRole } from './services/database'
import type { Profile as ProfileType, UserRole, NavItem } from './services/database'
import type { Session } from '@supabase/supabase-js'

// NAV map: which sidebar items each role can see.
const NAV: Record<UserRole, NavItem[]> = {
  admin: [
    { id: 'ched-memo', label: 'CHED Memorandum Orders' },
    { id: 'strategic-goals', label: 'Strategic Goals' },
    { id: 'peos', label: 'Program Educational Objectives' },
    { id: 'program-outcomes', label: 'Program Outcomes' },
    { id: 'clo', label: 'Course Learning Outcomes' },
    { id: 'users', label: 'Users & Accounts' },
    { id: 'activity-logs', label: 'Activity Logs' },
    { id: 'profile', label: 'Profile' },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'users', label: 'Faculty' },
    { id: 'activity-logs', label: 'Activity Logs' },
    { id: 'profile', label: 'Profile' },
  ],
  user: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'profile', label: 'Profile' },
  ],
}

// PAGES map: page id -> component for each role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PAGES: Record<string, Record<string, React.ComponentType<any>>> = {
  admin: {
    dashboard: AdminDashboard,
    peos: AdminPEOs,
    'program-outcomes': AdminProgramOutcomes,
    clo: AdminCourseLearningOutcomes,
    'strategic-goals': AdminStrategicGoals,
    'ched-memo': AdminChedMemoOrders,
    users: AdminUsers,
    'activity-logs': AdminActivityLogs,
    profile: Profile,
  },
  manager: {
    dashboard: ManagerDashboard,
    curriculum: ManagerCurriculum,
    users: ManagerUsers,
    'activity-logs': ManagerActivityLogs,
    profile: Profile,
  },
  user: {
    dashboard: UserDashboard,
    curriculum: UserCurriculum,
    profile: Profile,
  },
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [activePage, setActivePage] = useState('dashboard')

  // On first render: restore an existing session from localStorage and subscribe to
  // auth changes (sign-in / sign-out) so the UI updates automatically.
  useEffect(() => {
    supabase!.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        setProfile(null) // signed out — clear the profile too
        setActivePage('dashboard')
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
    let cancelled = false

    ensureProfile(session.user)
      .then((p) => {
        if (cancelled) return null
        return syncDemoRole()
          .then((role) => {
            if (role && role !== p.role) return ensureProfile(session.user)
            return p
          })
          .catch(() => p) // RPC missing/not deployed yet → keep the loaded profile
      })
      .then((p) => {
        if (!cancelled && p) setProfile(p)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    return () => { cancelled = true }
  }, [session])

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

  // Role from the profile; unknown/missing roles fall back to 'user' (least privilege).
  const role: UserRole = (profile?.role ?? 'user') as UserRole
  const navItems = NAV[role] ?? NAV.user

  // Gating: coerce the requested page to one this role can access
  const page = navItems.some((n: NavItem) => n.id === activePage) ? activePage : 'dashboard'

  const renderPage = () => {
    const Page = PAGES[role]?.[page] ?? UserDashboard

    if (page === 'profile') return <Page profile={profile} onSaved={setProfile} />
    if (page === 'users') return <Page />
    if (page === 'curriculum' && role !== 'user') return <Page userEmail={profile?.email} />
    return <Page profile={profile} />
  }

  return (
    <div className="app-layout">
      <Sidebar
        navItems={navItems}
        activePage={page}
        onNavigate={setActivePage}
        onLogout={handleLogout}
        role={role}
      />

      <div className="main-content">
        <header className="topbar">
          <div className="topbar__title">CQI Monitoring System</div>
          <div className="topbar__user">
            <span>{profile?.full_name || profile?.email}</span>
            <span className={`role-badge role-badge--${role}`}>{role}</span>
          </div>
        </header>

        <main className="content-area">
          <div className="page-container">{renderPage()}</div>
        </main>
      </div>
    </div>
  )
}

export default App

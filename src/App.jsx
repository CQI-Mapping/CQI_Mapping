// App shell: manages the session, loads the signed-in user's profile, and decides
// which page to render based on their role. No router library — the active page is
// just state, and the role-based NAV map below controls what's visible.
//
// Each role has its own pages in its own folder (src/pages/admin|manager|user),
// mirroring the reference repo's per-role structure.

import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Login from './pages/Login.jsx'
import Profile from './pages/Profile.jsx'
import AdminDashboard from './pages/admin/Dashboard.jsx'
import AdminUsers from './pages/admin/Users.jsx'
import AdminCurriculum from './pages/admin/Curriculum.jsx'
import AdminAuditLog from './pages/admin/AuditLog.jsx'
import ManagerDashboard from './pages/manager/Dashboard.jsx'
import ManagerUsers from './pages/manager/Users.jsx'
import ManagerCurriculum from './pages/manager/Curriculum.jsx'
import ManagerAuditLog from './pages/manager/AuditLog.jsx'
import UserDashboard from './pages/user/Dashboard.jsx'
import UserCurriculum from './pages/user/Curriculum.jsx'
import AdminCloPoMapping from './pages/admin/CloPoMapping.jsx'
import AdminAnalytics from './pages/admin/Analytics.jsx'
import { supabase } from './utils/supabaseClient'
import { ensureProfile } from './services/database'

// NAV map: which sidebar items each role can see.
// 'id' must match the keys used in the PAGES map below.
const NAV = {
  admin: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'Users & Accounts' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'clo-po', label: 'CLO/PO Mapping' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'audit-log', label: 'Audit Log' },
    { id: 'profile', label: 'Profile' },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'users', label: 'Faculty' },
    { id: 'audit-log', label: 'Audit Log' },
    { id: 'profile', label: 'Profile' },
  ],
  user: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'profile', label: 'Profile' },
  ],
}

// PAGES map: page id -> component for each role. 'profile' is shared across roles.
const PAGES = {
  admin: {
    dashboard: AdminDashboard,
    users: AdminUsers,
    curriculum: AdminCurriculum,
    'clo-po': AdminCloPoMapping,
    analytics: AdminAnalytics,
    'audit-log': AdminAuditLog,
    profile: Profile,
  },
  manager: {
    dashboard: ManagerDashboard,
    curriculum: ManagerCurriculum,
    users: ManagerUsers,
    'audit-log': ManagerAuditLog,
    profile: Profile,
  },
  user: {
    dashboard: UserDashboard,
    curriculum: UserCurriculum,
    profile: Profile,
  },
}

function App() {
  const [session, setSession] = useState(null) // the Supabase auth session
  const [profile, setProfile] = useState(null) // the signed-in user's profile row (has role)
  const [loading, setLoading] = useState(true) // true while restoring the session on page load
  const [activePage, setActivePage] = useState('dashboard')

  // On first render: restore an existing session from localStorage and subscribe to
  // auth changes (sign-in / sign-out) so the UI updates automatically.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
  // so a profile-less account no longer breaks the dashboard.
  useEffect(() => {
    if (!session?.user) return
    let cancelled = false

    ensureProfile(session.user)
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch(() => {}) // keep the app usable even if the profile load fails

    return () => { cancelled = true }
  }, [session])

  const handleLogout = async () => {
    await supabase.auth.signOut()
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
  const role = profile?.role ?? 'user'
  const navItems = NAV[role] ?? NAV.user

  // Gating: coerce the requested page to one this role can access, so a crafted
  // activePage value can never render an unauthorized page.
  const page = navItems.some((n) => n.id === activePage) ? activePage : 'dashboard'

  const renderPage = () => {
    const Page = PAGES[role]?.[page] ?? UserDashboard

    if (page === 'profile') return <Page profile={profile} onSaved={setProfile} />
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

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
//   Curriculum Report (View), Reports, Users & Accounts, Activity Logs,
//   Profile
//
// Manager role pages (sidebar order):
//   Dashboard, Program, CHED Memorandum Orders, Strategic Goals,
//   Program Educational Objectives, Program Outcomes,
//   Curriculum, Course, Subject Graph, View Syllabus, Reports, Users,
//   Activity Logs, Profile
//
// Faculty pages (sidebar order):
//   Dashboard, Course Learning Outcomes, Curriculum, Subject Graph,
//   Generate TOS, Reports, Profile
//
// The Program / CHED Memo / Strategic Goals / PEO pages are shared with the admin
// role (same as Activity Logs and Subject Graph) — only destructive deletes stay
// admin-only, via the SHARED_ACADEMIC_PAGES list below. The Reports page is
// shared by ALL three roles and lives in its own pages/shared folder: every list
// it reads has an "authenticated users can read" policy, so faculty can open it
// without a role-specific policy of their own.

import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import ResetLinkExpired from './pages/ResetLinkExpired'
import { interpretAuthReturnError, scrubAuthReturnUrl } from './utils/oauthErrors'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/Dashboard'
import AdminActivityLogs from './pages/admin/ActivityLogs'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerUsers from './pages/manager/Users'
import ManagerCurriculum from './pages/manager/Curriculum'
import ManagerCourse from './pages/manager/Course'
import ManagerActivityLogs from './pages/admin/ActivityLogs'
import UserDashboard from './pages/user/Dashboard'
import SecurityPrivacy from './pages/SecurityPrivacy'
import AdminChedMemoOrders from './pages/admin/ChedMemoOrders'
import AdminStrategicGoals from './pages/admin/StrategicGoals'
import AdminPEOs from './pages/admin/ProgramEducationalObjectives'
import ManagerProgramOutcomes from './pages/manager/ProgramOutcomes'
import AdminProgramOutcomesAdmin from './pages/admin/ProgramOutcomesAdmin'
import UserCourseLearningOutcomes from './pages/user/CourseLearningOutcomes'
import AdminUsers from './pages/admin/Users'
import AdminProgram from './pages/admin/Program'
import AdminSubjectView from './pages/admin/Map'
import AdminView from './pages/admin/Syllabus'

import UserTOS from './pages/user/TOS'
import { supabase } from './utils/supabaseClient'
import { ensureProfile, syncDemoRole, addActivityLog, recordLoginEvent } from './services/database'
import type { Profile as ProfileType, UserRole, NavItem } from './services/database'
import type { Session } from '@supabase/supabase-js'
import { loadEmailAvatar } from './utils/avatar'

const NAV: Record<UserRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'program', label: 'Program' },
    { id: 'ched-memo', label: 'CHED Memorandum Orders' },
    { id: 'strategic-goals', label: 'Strategic Goals' },
    { id: 'peos', label: 'Program Educational Objectives' },
    { id: 'program-outcomes', label: 'Program Outcomes' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'subject-view', label: 'Generate Map' },
    { id: 'view', label: 'Curriculum Report' },
    { id: 'users', label: 'Users & Accounts' },
    { id: 'activity-logs', label: 'Activity Logs' },
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security & Privacy' },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'program', label: 'Program' },
    { id: 'ched-memo', label: 'CHED Memorandum Orders' },
    { id: 'strategic-goals', label: 'Strategic Goals' },
    { id: 'peos', label: 'Program Educational Objectives' },
    { id: 'program-outcomes', label: 'Program Outcomes' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'course', label: 'Course' },
    { id: 'subject-view', label: 'Generate Map' },
    { id: 'view', label: 'View Syllabus' },
    { id: 'users', label: 'Users & Accounts' },
    { id: 'activity-logs', label: 'Activity Logs' },
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security & Privacy' },
  ],
  user: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'clo', label: 'Course Learning Outcomes' },
    { id: 'subject-view', label: 'Generate Map' },
    { id: 'tos', label: 'Generate TOS' },
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security & Privacy' },
  ],
}

// Pages shared by admin and manager that support an `allowDelete` prop
// (hard delete stays admin-only; managers can still archive/restore).
const SHARED_ACADEMIC_PAGES = new Set([
  'program', 'ched-memo', 'strategic-goals', 'peos',
])

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
    security: SecurityPrivacy,
  },
  manager: {
    dashboard: ManagerDashboard,
    program: AdminProgram,
    'ched-memo': AdminChedMemoOrders,
    'strategic-goals': AdminStrategicGoals,
    peos: AdminPEOs,
    curriculum: ManagerCurriculum,
    course: ManagerCourse,
    'program-outcomes': ManagerProgramOutcomes,
    'subject-view': AdminSubjectView,
    view: AdminView,
    users: ManagerUsers,
    'activity-logs': ManagerActivityLogs,
    profile: Profile,
    security: SecurityPrivacy,
  },
  user: {
    dashboard: UserDashboard,
    clo: UserCourseLearningOutcomes,
    'subject-view': AdminSubjectView,
    tos: UserTOS,
    profile: Profile,
    security: SecurityPrivacy,
  },
}

// ---- Refresh survival ----
// sessionStorage keeps a value across reloads of the same tab only (a new tab
// or window starts empty), which is exactly the scope wanted here: an
// accidental refresh or interrupted visit does not throw the user back to the
// dashboard, while a brand-new tab always opens there. Cleared on sign-out so
// the next session starts fresh.
const LAST_PAGE_KEY = 'cqi.lastPage'

// School-accounts-only: a Google sign-in is only accepted from the official
// school domain. Supabase's allowed-email-domains dashboard setting is the
// real auth-layer gate; this constant backs it up in code so a personal
// Gmail that slips through a missed dashboard step is signed straight out.
const SCHOOL_EMAIL_DOMAIN = '@nbsc.edu.ph'
const SCHOOL_ONLY_NOTICE =
  'Only @nbsc.edu.ph school accounts can sign in. Please use your official NBSC Google account.'

/** The page this tab was last on, when it belongs to the given role. */
function readLastPage(role: UserRole): string | null {
  try {
    const raw = sessionStorage.getItem(LAST_PAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { role: string; page: string }
    return saved.role === role ? saved.page : null
  } catch {
    return null
  }
}

/** Remember the current page; a storage failure just loses the convenience. */
function writeLastPage(role: UserRole, page: string): void {
  try {
    sessionStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ role, page }))
  } catch {
    // Storage unavailable — refresh will simply land on the dashboard.
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [activePage, setActivePage] = useState('dashboard')
  /**
   * Every navigation goes through here, so it is the one place that knows both
   * where the user came from and where they went. The Activity Logs page is
   * skipped: it is the thing being read, and logging "someone opened the log"
   * writes a new row on every read, so the page would never hold still.
   */
  const lastLoggedPage = useRef<string | null>(null)
  // Mirrored on each render so the stable `navigate` callback can stamp the
  // current role onto the persisted page without re-creating the callback.
  const roleRef = useRef<UserRole>('user')
  // Set when this tab arrived through a password-recovery email link — the tab
  // then renders the standalone Set-a-new-password screen (see `recovering`)
  // instead of the normal app shell, and the persisted last page is skipped.
  const arrivedViaRecovery = useRef(false)
  // A session arriving through a recovery link is mid-flow: the password is
  // still the placeholder the email implied, so the app renders ResetPassword
  // alone until a new password is set (or the user signs out from there).
  const [recovering, setRecovering] = useState(false)
  const navigate = useCallback((next: string) => {
    setActivePage(next)
    if (roleRef.current) writeLastPage(roleRef.current, next)
    if (next === 'activity-logs' || next === lastLoggedPage.current) return
    lastLoggedPage.current = next
    addActivityLog('page.viewed', { entity: 'page', label: next }).catch(() => {})
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 1024 : true
  )
  // Set when the profile fetch fails (e.g. flaky network). The app then shows
  // a retry screen instead of a stale identity or a silent wrong-role fallback.
  const [profileError, setProfileError] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const profileUserIdRef = useRef<string | null>(null)

  // Message handed to the Login screen by App itself — currently only the
  // archived-account refusal, which Google sign-ins need because the OAuth
  // session lands in the app shell without ever passing through the Login
  // form's own archived check.
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null)

  // Failed auth returns. A bounced OAuth round-trip or a dead recovery link
  // lands back on this origin carrying ?error= / #error_description= in the
  // address bar. App reads them exactly once, renders the verdict, and wipes
  // the params — a child component reading them too would race the scrub and
  // double-handle the same bounce. Expiry gets its own full screen (screen 5
  // of design/profile-reset-redesign.html); every other failure arrives at
  // Login as a pre-remixed one-line notice.
  const [oauthNotice, setOauthNotice] = useState<string | null>(null)
  const [expiredResetLink, setExpiredResetLink] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hashPart = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '',
    )
    const error = params.get('error') || hashPart.get('error')
    const description = params.get('error_description') || hashPart.get('error_description')
    if (!error && !description) return
    const verdict = interpretAuthReturnError(error, description)
    if (verdict.expiredResetLink) {
      setExpiredResetLink(true)
    } else {
      setOauthNotice(verdict.message)
    }
    scrubAuthReturnUrl()
    // The bounce happens before mount; reading once at boot is the contract.
  }, [])  // The email's real Gravatar photo drives the sidebar avatar whenever no
  // picture was uploaded. The availability probe is async, so it lands a
  // beat after sign-in; the sidebar renders initials until then, and
  // addresses without a Gravatar account simply stay on initials.
  const [emailAvatar, setEmailAvatar] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadEmailAvatar(profile?.email)
      .then((url) => {
        if (!cancelled) setEmailAvatar(url)
      })
      .catch(() => {
        if (!cancelled) setEmailAvatar(null)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.email])

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
        try {
          sessionStorage.removeItem(LAST_PAGE_KEY)
        } catch {
          // Storage unavailable — nothing to clean up.
        }
        setActivePage('dashboard')
        // Reset so the next sign-in records its own landing on the dashboard
        // rather than inheriting this session's last page or page memory.
        lastLoggedPage.current = null
        arrivedViaRecovery.current = false
        setRecovering(false)
        setLoading(false)
      } else if (event === 'PASSWORD_RECOVERY') {
        // The user opened a reset link from their email: supabase-js has just
        // exchanged it for a session. Swap the whole app shell for the
        // Set-a-new-password screen so the flow ends with a new password being
        // set, and skip restoring an old page when the profile lands.
        arrivedViaRecovery.current = true
        setRecovering(true)
      } else if (event === 'SIGNED_IN') {
        // A truly fresh sign-in. Restored tabs arrive as INITIAL_SESSION, so a
        // page refresh never re-writes a login row here.
        setSignOutNotice(null)
        // OAuth sign-ins return straight into the app and never pass through
        // the Login page's form-level recordLoginEvent, so their audit row is
        // stamped here. app_metadata.provider is 'google' for the Google path.
        if (session?.user?.app_metadata?.provider === 'google') {
          // The service logs its own failures as a console warn — it never rejects.
          recordLoginEvent(session.user.email ?? 'unknown', true)
        }
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
      .then(async (p) => {
        if (cancelled) return
        // School-accounts-only refusal, OAuth edition. Supabase welcomes any
        // Google identity until allowed email domains are configured on the
        // project, so the email is re-checked once the session lands: a
        // non-school Google account is signed straight out, and Login.tsx
        // inherits the explanation via signOutNotice. Only the Google path is
        // gated — the demo bootstrap accounts (cqi.test) are password logins,
        // and the archived check below stays for every provider.
        if (session.user.app_metadata?.provider === 'google'
          && p
          && !p.email?.toLowerCase().endsWith(SCHOOL_EMAIL_DOMAIN)) {
          setSignOutNotice(SCHOOL_ONLY_NOTICE)
          await supabase!.auth.signOut()
          return
        }
        if (p?.status === 'archived') {
          // Archived refusal, OAuth edition. The password path drops these
          // on the Login page, but a Google sign-in hands its session
          // straight to the app shell, so the check lives where the profile
          // actually lands. Signing out keeps the token un-burned — the
          // account remains restorable — and the Login screen inherits the
          // explanation via signOutNotice.
          setSignOutNotice('This account has been archived. Ask your administrator to restore it.')
          await supabase!.auth.signOut()
          return
        }
        if (p) {
          setProfile(p)
          setProfileError('')
          // Reload survival: reopen the page this role was last on in this
          // tab. Skipped when a recovery link just landed — the
          // Set-a-new-password screen must finish before pages show.
          if (!arrivedViaRecovery.current) {
            const stored = readLastPage(p.role)
            if (stored) setActivePage(stored)
          }
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

  // Dead recovery link → its own auth-styled screen (mockup screen 5)
  // instead of an unexplained login. Checked before the session gate: a
  // bounce never carries a session, and a tab may additionally hold a stale
  // restored session the bounce should not mask the message for.
  if (expiredResetLink) {
    return (
      <ResetLinkExpired
        onBackToLogin={() => {
          setExpiredResetLink(false)
        }}
      />
    )
  }

  if (!session) {
    return <Login notice={signOutNotice ?? oauthNotice} />
  }

  // Mid-recovery → the Set-a-new-password screen alone, with no app shell and
  // no sidebar: the recovery session is only good for choosing a new password.
  // Rendered before the profile gates so it appears immediately even when the
  // profile is still loading (it loads in the background meanwhile).
  if (recovering) {
    return (
      <ResetPassword
        onDone={() => {
          arrivedViaRecovery.current = false
          setRecovering(false)
        }}
      />
    )
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
  roleRef.current = role
  const navItems = NAV[role] ?? NAV.user

  // Gating: coerce the requested page to one this role can access
  const page = navItems.some((n: NavItem) => n.id === activePage)
    ? activePage
    : navItems[0]?.id ?? 'dashboard'

  // Managers get create/edit/archive on the shared academic pages; only admins
  // may hard-delete, so the destructive button is hidden for them.
  const allowDelete = role === 'admin'

  const renderPage = () => {
    const Page = PAGES[role]?.[page] ?? PAGES[role]?.[navItems[0]?.id] ?? UserDashboard

    if (page === 'dashboard') return <Page profile={profile} onNavigate={navigate} />
    if (page === 'profile') return <Page profile={profile} onSaved={setProfile} onNavigate={navigate} />
    if (page === 'users') return <Page />
    if (SHARED_ACADEMIC_PAGES.has(page)) return <Page allowDelete={allowDelete} />
    if (page === 'curriculum' && role !== 'user') return <Page userEmail={profile?.email} allowDelete={role === 'admin'} />
    if (page === 'view') {
      // One shared page, per-role banner wording: the admin's sidebar calls it
      // Curriculum Report, the manager's View Syllabus. (The faculty nav has no
      // 'view' item, so the gating above never routes them here.)
      return <Page userEmail={profile?.email} title={role === 'manager' ? 'View Syllabus' : undefined} />
    }
    // The log page filters by role, and which roles it may offer depends on
    // the viewer: RLS hides admin-authored rows from managers (migration 003),
    // so offering them an Admins filter would only ever yield an empty table.
    if (page === 'activity-logs') return <Page viewerRole={role} />
    return <Page profile={profile} onNavigate={navigate} />
  }

  return (
    <div className="app-layout">
      <Sidebar
        navItems={navItems}
        activePage={page}
        onNavigate={navigate}
        onLogout={handleLogout}
        role={role}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        profileName={profile?.full_name}
        profileEmail={profile?.email}
        profileAvatar={profile?.avatar_url ?? emailAvatar}
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

// Sidebar: the left navigation shell. It receives navItems (already filtered by
// role in App.tsx) and renders them as buttons, plus the current role and logout.

import '../styles/Sidebar.css'
import type { NavItem, UserRole } from '../services/database'

interface SidebarProps {
  navItems: NavItem[]
  activePage: string
  onNavigate: (page: string) => void
  onLogout: () => void
  role: UserRole
}

// Small inline SVG icon components (stroke-based, currentColor = the CSS color).
function DashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ResourcesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function AuditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function MatrixIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  )
}

function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" rx="1" />
      <rect x="12" y="7" width="3" height="11" rx="1" />
      <rect x="17" y="10" width="3" height="8" rx="1" />
    </svg>
  )
}

function ProfileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.418 3.582-7 8-7s8 2.582 8 7" />
    </svg>
  )
}

function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// Map of nav item id -> icon component (fallback: DashboardIcon).
const ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  dashboard: DashboardIcon,
  users: UsersIcon,
  curriculum: ResourcesIcon,
  'clo-po': MatrixIcon,
  analytics: ChartIcon,
  'activity-logs': AuditIcon,
  profile: ProfileIcon,
}

function Sidebar({ navItems, activePage, onNavigate, onLogout, role }: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* Brand block */}
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark">CQI</div>
        <div className="sidebar__brand-text">
          <span className="sidebar__brand-title">CQI Monitoring System</span>
          <span className="sidebar__brand-sub">System Admin · CQI Lead · Faculty</span>
        </div>
      </div>

      {/* Role-filtered navigation (navItems comes from App.tsx) */}
      <nav className="sidebar__nav" aria-label="Main navigation">
        {navItems.map(({ id, label }) => {
          const Icon = ICONS[id] ?? DashboardIcon
          return (
            <button
              key={id}
              type="button"
              className={`sidebar__nav-item ${activePage === id ? 'sidebar__nav-item--active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={activePage === id ? 'page' : undefined}
            >
              <Icon className="sidebar__nav-icon" />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Signed-in user's role + logout */}
      <div className="sidebar__footer">
        <div className="sidebar__role">Signed in as <strong>{role}</strong></div>
        <button type="button" className="sidebar__logout" onClick={onLogout}>
          <LogoutIcon className="sidebar__nav-icon" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar

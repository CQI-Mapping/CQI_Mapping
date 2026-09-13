// Sidebar — top header bar, user-friendly 2026 edition.
// Groups 12 admin items into 5 top-level entries with an Academics dropdown,
// adds mobile drawer with backdrop + auto-close, larger tap targets.

import { useState, useRef, useEffect } from 'react'
import '../styles/Sidebar.css'
import type { NavItem, UserRole } from '../services/database'

interface SidebarProps {
  navItems: NavItem[]
  activePage: string
  onNavigate: (page: string) => void
  onLogout: () => void
  role: UserRole
  isOpen: boolean
  onToggle: () => void
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

function CourseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <circle cx="12" cy="9" r="1.5" />
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

function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Map of nav item id -> icon component (fallback: DashboardIcon).
const ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  dashboard: DashboardIcon,
  users: UsersIcon,
  curriculum: ResourcesIcon,
  program: CourseIcon,
  course: CourseIcon,
  'clo-po': MatrixIcon,
  analytics: ChartIcon,
  'activity-logs': AuditIcon,
  profile: ProfileIcon,
  'ched-memo': ResourcesIcon,
  'strategic-goals': ChartIcon,
  peos: ResourcesIcon,
  'program-outcomes': MatrixIcon,
  clo: MatrixIcon,
}

function initialsOf(role: string): string {
  return role
    .split(/[\s-]+/)
    .map((w) => w[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const ACADEMICS_IDS = new Set(['program', 'ched-memo', 'strategic-goals', 'peos', 'program-outcomes', 'curriculum', 'course', 'clo'])

function Sidebar({ navItems, activePage, onNavigate, onLogout, role, isOpen, onToggle }: SidebarProps) {
  const [academicsOpen, setAcademicsOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  const academics = navItems.filter((n) => ACADEMICS_IDS.has(n.id))
  const shouldGroup = academics.length > 2
  const topLevel = shouldGroup ? navItems.filter((n) => !ACADEMICS_IDS.has(n.id)) : navItems

  // Reorder topLevel to keep Dashboard first for admin grouping
  const orderedTop = shouldGroup
    ? [
        ...topLevel.filter((n) => n.id === 'dashboard'),
        ...topLevel.filter((n) => n.id !== 'dashboard' && n.id !== 'profile'),
        ...topLevel.filter((n) => n.id === 'profile'),
      ]
    : topLevel

  const isAcademicsActive = academics.some((n) => n.id === activePage)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setAcademicsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Close academics dropdown when activePage changes away
  useEffect(() => { setAcademicsOpen(false) }, [activePage])

  const handleNavigate = (id: string) => {
    onNavigate(id)
    setAcademicsOpen(false)
    if (window.innerWidth <= 1024 && isOpen) onToggle()
  }

  return (
    <>
      <aside className={`sidebar ${!isOpen ? 'sidebar--collapsed' : ''}`}>
        <div className="sidebar__glow" aria-hidden />
        <div className="sidebar__grain" aria-hidden />

        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          title={isOpen ? 'Close menu' : 'Open menu'}
        >
          <MenuIcon className="sidebar__toggle-icon" />
        </button>

        <div className="sidebar__brand">
          <div className="sidebar__brand-mark">
            <span>CQI</span>
          </div>
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-title">CQI Monitoring</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {shouldGroup ? (
            <>
              {orderedTop
                .filter((n) => n.id === 'dashboard')
                .map(({ id, label }) => {
                  const Icon = ICONS[id] ?? DashboardIcon
                  const isActive = activePage === id
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
                      onClick={() => handleNavigate(id)}
                      aria-current={isActive ? 'page' : undefined}
                      title={label}
                    >
                      <Icon className="sidebar__nav-icon" />
                      <span>{label}</span>
                    </button>
                  )
                })}

              <div className="sidebar__dropdown" ref={ddRef}>
                <button
                  type="button"
                  className={`sidebar__nav-item ${isAcademicsActive ? 'sidebar__nav-item--active' : ''}`}
                  onClick={() => setAcademicsOpen((v) => !v)}
                  aria-expanded={academicsOpen}
                  aria-haspopup="menu"
                  title="Academics"
                >
                  <ResourcesIcon className="sidebar__nav-icon" />
                  <span>Academics</span>
                  <ChevronIcon className={`sidebar__chevron ${academicsOpen ? 'sidebar__chevron--open' : ''}`} />
                </button>
                {academicsOpen && (
                  <div className="sidebar__dropdown-menu" role="menu">
                    {academics.map(({ id, label }) => {
                      const Icon = ICONS[id] ?? DashboardIcon
                      const isActive = activePage === id
                      return (
                        <button
                          key={id}
                          type="button"
                          role="menuitem"
                          className={`sidebar__dropdown-item ${isActive ? 'sidebar__dropdown-item--active' : ''}`}
                          onClick={() => handleNavigate(id)}
                          title={label}
                        >
                          <Icon className="sidebar__dropdown-icon" />
                          <span>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {orderedTop
                .filter((n) => n.id !== 'dashboard')
                .map(({ id, label }) => {
                  const Icon = ICONS[id] ?? DashboardIcon
                  const isActive = activePage === id
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
                      onClick={() => handleNavigate(id)}
                      aria-current={isActive ? 'page' : undefined}
                      title={label}
                    >
                      <Icon className="sidebar__nav-icon" />
                      <span>{label}</span>
                    </button>
                  )
                })}
            </>
          ) : (
            navItems.map(({ id, label }) => {
              const Icon = ICONS[id] ?? DashboardIcon
              const isActive = activePage === id
              return (
                <button
                  key={id}
                  type="button"
                  className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
                  onClick={() => handleNavigate(id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={label}
                >
                  <Icon className="sidebar__nav-icon" />
                  <span>{label}</span>
                </button>
              )
            })
          )}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initialsOf(role)}</div>
            <div className="sidebar__user-text">
              <span className="sidebar__user-role">{role}</span>
              <span className="sidebar__user-note">Signed in · Online</span>
            </div>
            <span className="sidebar__dot" aria-hidden />
          </div>
          <button type="button" className="sidebar__logout" onClick={onLogout}>
            <LogoutIcon className="sidebar__nav-icon" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
      {isOpen && <button type="button" className="sidebar__backdrop" onClick={onToggle} aria-label="Close menu" />}
    </>
  )
}

export default Sidebar
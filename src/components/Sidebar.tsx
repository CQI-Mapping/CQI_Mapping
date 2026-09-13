// Sidebar — top header bar, clean 2026 design.
// Desktop: horizontal bar (brand | nav | user). Mobile: vertical drawer.

import { useState, useRef, useEffect, useCallback } from 'react'
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

// ---- Icons ----

function Icon({ d, ...props }: { d: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      {d.split('|').map((seg, i) => {
        const [cmd, ...pts] = seg.split(' ')
        if (cmd === 'rect') return <rect key={i} x={pts[0]} y={pts[1]} width={pts[2]} height={pts[3]} rx={pts[4] || '0'} />
        if (cmd === 'circle') return <circle key={i} cx={pts[0]} cy={pts[1]} r={pts[2]} />
        if (cmd === 'path') return <path key={i} d={pts.join(' ')} />
        if (cmd === 'line') return <line key={i} x1={pts[0]} y1={pts[1]} x2={pts[2]} y2={pts[3]} />
        if (cmd === 'polyline') return <polyline key={i} points={pts.join(' ')} />
        return null
      })}
    </svg>
  )
}

const ICONS: Record<string, string> = {
  dashboard: 'rect 3 3 7 9 1.5|rect 14 3 7 5 1.5|rect 14 12 7 9 1.5|rect 3 16 7 5 1.5',
  users: 'path M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|circle 9 7 4|path M23 21v-2a4 4 0 0 0-3-3.87|path M16 3.13a4 4 0 0 1 0 7.75',
  curriculum: 'path M4 19.5A2.5 2.5 0 0 1 6.5 17H20|path M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  program: 'path M4 19.5A2.5 2.5 0 0 1 6.5 17H20|path M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z|circle 12 9 1.5',
  course: 'path M4 19.5A2.5 2.5 0 0 1 6.5 17H20|path M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z|circle 12 9 1.5',
  clo: 'rect 3 3 18 18 2|path M3 9h18|path M3 15h18|path M9 3v18|path M15 3v18',
  'clo-po': 'rect 3 3 18 18 2|path M3 9h18|path M3 15h18|path M9 3v18|path M15 3v18',
  'ched-memo': 'path M4 19.5A2.5 2.5 0 0 1 6.5 17H20|path M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  'strategic-goals': 'path M3 3v18h18|rect 7 12 3 6 1|rect 12 7 3 11 1|rect 17 10 3 8 1',
  peos: 'path M4 19.5A2.5 2.5 0 0 1 6.5 17H20|path M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  'program-outcomes': 'path M3 3v18h18|path M7 16l3-3 3 3 5-8',
  analytics: 'path M3 3v18h18|rect 7 12 3 6 1|rect 12 7 3 11 1|rect 17 10 3 8 1',
  'activity-logs': 'path M12 20h9|path M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  profile: 'circle 12 8 4|path M4 21c0-4.418 3.582-7 8-7s8 2.582 8 7',
}

const LOGOUT_ICON = 'path M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|polyline 16 17 21 12 16 7|line 21 12 9 12'

function initialsOf(role: string): string {
  return role.split(/[\s-]+/).map((w) => w[0] ?? '').filter(Boolean).slice(0, 2).join('').toUpperCase()
}

// Academic-related IDs that get grouped under "Academics"
const ACADEMICS_IDS = new Set([
  'program', 'ched-memo', 'strategic-goals', 'peos',
  'program-outcomes', 'curriculum', 'course', 'clo',
])

function Sidebar({ navItems, activePage, onNavigate, onLogout, role, isOpen, onToggle }: SidebarProps) {
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)

  // Separate dashboard, academics, and other items
  const academics = navItems.filter((n) => ACADEMICS_IDS.has(n.id))
  const hasAcademics = academics.length > 2
  const dashboardItem = navItems.find((n) => n.id === 'dashboard')
  const otherItems = hasAcademics
    ? navItems.filter((n) => n.id !== 'dashboard' && !ACADEMICS_IDS.has(n.id))
    : navItems.filter((n) => n.id !== 'dashboard')

  const isAcademicsActive = academics.some((n) => n.id === activePage)

  // Close dropdown on outside click
  useEffect(() => {
    if (!ddOpen) return
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ddOpen])

  // Close everything on navigate
  const navigate = useCallback((id: string) => {
    onNavigate(id)
    setDdOpen(false)
    if (window.innerWidth <= 1024 && isOpen) onToggle()
  }, [onNavigate, isOpen, onToggle])

  // Close dropdown when nav changes
  useEffect(() => { setDdOpen(false) }, [activePage])

  return (
    <>
      <header className={`hdr ${isOpen ? 'hdr--open' : ''}`}>
        <div className="hdr__inner">
          {/* Brand */}
          <div className="hdr__brand">
            <div className="hdr__mark">CQI</div>
            <span className="hdr__title">CQI Monitoring</span>
          </div>

          {/* Hamburger */}
          <button
            type="button"
            className="hdr__hamburger"
            onClick={onToggle}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <span className={`hdr__hamburger-line ${isOpen ? 'hdr__hamburger-line--open' : ''}`} />
            <span className={`hdr__hamburger-line ${isOpen ? 'hdr__hamburger-line--open' : ''}`} />
            <span className={`hdr__hamburger-line ${isOpen ? 'hdr__hamburger-line--open' : ''}`} />
          </button>

          {/* Nav items — desktop */}
          <nav className="hdr__nav" aria-label="Main navigation">
            {dashboardItem && (
              <button
                type="button"
                className={`hdr__item ${activePage === dashboardItem.id ? 'hdr__item--active' : ''}`}
                onClick={() => navigate(dashboardItem.id)}
              >
                <Icon d={ICONS[dashboardItem.id] || ICONS.dashboard} className="hdr__icon" />
                <span>Dashboard</span>
              </button>
            )}

            {hasAcademics && (
              <div className="hdr__dd" ref={ddRef}>
                <button
                  type="button"
                  className={`hdr__item ${isAcademicsActive ? 'hdr__item--active' : ''}`}
                  onClick={() => setDdOpen((v) => !v)}
                  aria-expanded={ddOpen}
                >
                  <Icon d={ICONS.curriculum} className="hdr__icon" />
                  <span>Academics</span>
                  <svg className={`hdr__chevron ${ddOpen ? 'hdr__chevron--open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {ddOpen && (
                  <div className="hdr__dd-menu" role="menu">
                    {academics.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        role="menuitem"
                        className={`hdr__dd-item ${activePage === id ? 'hdr__dd-item--active' : ''}`}
                        onClick={() => navigate(id)}
                      >
                        <Icon d={ICONS[id] || ICONS.dashboard} className="hdr__dd-icon" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!hasAcademics && academics.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`hdr__item ${activePage === id ? 'hdr__item--active' : ''}`}
                onClick={() => navigate(id)}
              >
                <Icon d={ICONS[id] || ICONS.dashboard} className="hdr__icon" />
                <span>{label}</span>
              </button>
            ))}

            {otherItems.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`hdr__item ${activePage === id ? 'hdr__item--active' : ''}`}
                onClick={() => navigate(id)}
              >
                <Icon d={ICONS[id] || ICONS.dashboard} className="hdr__icon" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* User + Logout */}
          <div className="hdr__right">
            <div className="hdr__user">
              <div className="hdr__avatar">{initialsOf(role)}</div>
              <span className="hdr__role">{role}</span>
              <span className="hdr__dot" />
            </div>
            <button type="button" className="hdr__logout" onClick={onLogout}>
              <Icon d={LOGOUT_ICON} className="hdr__icon" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {isOpen && <button type="button" className="hdr__backdrop" onClick={onToggle} aria-label="Close menu" />}
    </>
  )
}

export default Sidebar
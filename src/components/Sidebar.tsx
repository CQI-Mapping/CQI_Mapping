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

// Academic-related IDs that get grouped under "Academics" — Awwwards-style mega menu
const ACADEMICS_IDS = new Set([
  'program', 'ched-memo', 'strategic-goals', 'peos',
  'program-outcomes', 'curriculum', 'course', 'clo',
])

const ACADEMICS_META: Record<string, { desc: string }> = {
  program: { desc: 'Degree programs & offerings' },
  'ched-memo': { desc: 'CHED memorandums & policies' },
  'strategic-goals': { desc: 'Institutional alignment' },
  peos: { desc: 'Graduate attributes & PEOs' },
  'program-outcomes': { desc: 'PO-1 → PO-27 mapping' },
  curriculum: { desc: 'Curriculum structure & maps' },
  course: { desc: 'Course catalog & details' },
  clo: { desc: 'Course learning outcomes' },
}

function Sidebar({ navItems, activePage, onNavigate, onLogout, role, isOpen, onToggle }: SidebarProps) {
  const [ddOpen, setDdOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef<number | null>(null)

  // Separate dashboard, academics, and other items — profile is handled in avatar dropdown (Awwwards-style)
  const academics = navItems.filter((n) => ACADEMICS_IDS.has(n.id))
  const hasAcademics = academics.length > 2
  const dashboardItem = navItems.find((n) => n.id === 'dashboard')
  const otherItems = hasAcademics
    ? navItems.filter((n) => n.id !== 'dashboard' && !ACADEMICS_IDS.has(n.id) && n.id !== 'profile')
    : navItems.filter((n) => n.id !== 'dashboard' && n.id !== 'profile')

  const isAcademicsActive = academics.some((n) => n.id === activePage)

  // Hover helpers — delayed close so you can move from button to menu without it vanishing
  const handleDdEnter = useCallback(() => {
    if (window.innerWidth <= 1024) return
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    setDdOpen(true)
    setProfileOpen(false)
  }, [])
  const handleDdLeave = useCallback(() => {
    if (window.innerWidth <= 1024) return
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setDdOpen(false), 140)
  }, [])

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    }
  }, [])

  // Close dropdowns on outside click + Esc (Awwwards-style)
  useEffect(() => {
    if (!ddOpen && !profileOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ddOpen && ddRef.current && !ddRef.current.contains(target)) setDdOpen(false)
      if (profileOpen && profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDdOpen(false)
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ddOpen, profileOpen])

  // Close everything on navigate
  const navigate = useCallback((id: string) => {
    onNavigate(id)
    setDdOpen(false)
    setProfileOpen(false)
    if (window.innerWidth <= 1024 && isOpen) onToggle()
  }, [onNavigate, isOpen, onToggle])

  // Close dropdown when nav changes
  useEffect(() => {
    setDdOpen(false)
    setProfileOpen(false)
  }, [activePage])

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
              <div
                className="hdr__dd"
                ref={ddRef}
                onMouseEnter={handleDdEnter}
                onMouseLeave={handleDdLeave}
              >
                <button
                  type="button"
                  className={`hdr__item hdr__item--academics ${isAcademicsActive ? 'hdr__item--active' : ''}`}
                  onClick={() => {
                    setDdOpen((v) => !v)
                    setProfileOpen(false)
                  }}
                  aria-expanded={ddOpen}
                  aria-haspopup="menu"
                >
                  <Icon d={ICONS.curriculum} className="hdr__icon" />
                  <span>Academics</span>
                  <svg className={`hdr__chevron ${ddOpen ? 'hdr__chevron--open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {ddOpen && (
                  <>
                    <button type="button" className="hdr__dd-overlay" onClick={() => setDdOpen(false)} aria-label="Close academics menu" tabIndex={-1} />
                    <div className="hdr__dd-menu" role="menu">
                      <div className="hdr__dd-grid" role="none">
                        {academics.map(({ id, label }) => (
                          <button
                            key={id}
                            type="button"
                            role="menuitem"
                            className={`hdr__dd-item ${activePage === id ? 'hdr__dd-item--active' : ''}`}
                            onClick={() => navigate(id)}
                          >
                            <span className="hdr__dd-iconWrap">
                              <Icon d={ICONS[id] || ICONS.dashboard} className="hdr__dd-icon" />
                            </span>
                            <span className="hdr__dd-text">
                              <span className="hdr__dd-label">{label}</span>
                              <span className="hdr__dd-desc">{ACADEMICS_META[id]?.desc ?? ''}</span>
                            </span>
                            <svg className="hdr__dd-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </button>
                        ))}
                      </div>
                      <div className="hdr__dd-foot">
                        <span>Quick access to all academic records</span>
                        <span className="hdr__dd-foot-hint">Press Esc to close</span>
                      </div>
                    </div>
                  </>
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

          {/* Profile — Awwwards-style avatar dropdown (logout lives inside) */}
          <div className="hdr__right">
            <div className="hdr__profile" ref={profileRef}>
              <button
                type="button"
                className={`hdr__profileBtn ${profileOpen ? 'hdr__profileBtn--open' : ''} ${activePage === 'profile' ? 'hdr__profileBtn--active' : ''}`}
                onClick={() => {
                  setProfileOpen((v) => !v)
                  if (!profileOpen) setDdOpen(false)
                }}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label="Profile menu"
              >
                <div className="hdr__avatar">{initialsOf(role)}</div>
                <span className="hdr__role">{role}</span>
                <svg className={`hdr__chevron hdr__chevron--sm ${profileOpen ? 'hdr__chevron--open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {profileOpen && (
                <>
                  <button type="button" className="hdr__profile-overlay" onClick={() => setProfileOpen(false)} aria-label="Close profile menu" tabIndex={-1} />
                  <div className="hdr__profile-menu" role="menu">
                    <div className="hdr__profile-head">
                      <div className="hdr__profile-avatarLg">{initialsOf(role)}</div>
                      <div className="hdr__profile-info">
                        <span className="hdr__profile-name">{role.charAt(0).toUpperCase() + role.slice(1)} User</span>
                        <span className="hdr__profile-sub">Signed in as {role}</span>
                      </div>
                      <span className="hdr__profile-badge">{role}</span>
                    </div>
                    <div className="hdr__profile-list" role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={`hdr__profile-item ${activePage === 'profile' ? 'hdr__profile-item--active' : ''}`}
                        onClick={() => navigate('profile')}
                      >
                        <Icon d={ICONS.profile} className="hdr__profile-icon" />
                        <span>My Profile</span>
                        <svg className="hdr__profile-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                      <div className="hdr__profile-sep" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="hdr__profile-item hdr__profile-item--danger"
                        onClick={onLogout}
                      >
                        <Icon d={LOGOUT_ICON} className="hdr__profile-icon" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {isOpen && <button type="button" className="hdr__backdrop" onClick={onToggle} aria-label="Close menu" />}
    </>
  )
}

export default Sidebar
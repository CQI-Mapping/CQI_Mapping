
// Admin dashboard: system overview for the administrator role.
// Shows stat cards (role, curriculum record count, user count) plus the
// admin capability list.

import { useState, useEffect } from 'react'
import {
  fetchAllProfiles,
  fetchStrategicGoals,
  fetchProgramEducationalObjectives,
  fetchProgramOutcomesStandalone,
  fetchCourseLearningOutcomesStandalone,
  fetchChedMemoOrders,
} from '../../services/database'
import type { Profile } from '../../services/database'

interface DashboardProps {
  profile: Profile | null
}

interface Stat {
  label: string
  value: number | null
  sub: string
}

function Dashboard({ profile }: DashboardProps) {
  const [stats, setStats] = useState<Stat[]>([])

  useEffect(() => {
    const counters: Array<{ label: string; sub: string; load: () => Promise<unknown[]> }> = [
      { label: 'Users', sub: 'Registered profiles', load: () => fetchAllProfiles() },
      { label: 'Strategic Goals', sub: 'Institutional alignment', load: () => fetchStrategicGoals() },
      { label: 'Program Educational Objectives', sub: 'Graduate attributes', load: () => fetchProgramEducationalObjectives() },
      { label: 'Program Outcomes', sub: 'PO-1 → PO-27', load: () => fetchProgramOutcomesStandalone() },
      { label: 'Course Learning Outcomes', sub: 'Course-level competencies', load: () => fetchCourseLearningOutcomesStandalone() },
      { label: 'CHED Memo Orders', sub: 'CHED Memorandum Orders', load: () => fetchChedMemoOrders() },
    ]
    Promise.all(counters.map(async (c) => ({ label: c.label, sub: c.sub, value: (await c.load()).length })))
      .then(setStats)
  }, [])

  return (
    <div className="dashboard">
      <div className="page-heading">
        <h2>Admin Dashboard</h2>
        <p>
          Welcome back, <strong>{profile?.full_name || profile?.email}</strong>. You are signed in
          as <span className="role-badge role-badge--admin">admin</span>.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Your role</span>
          <span className="stat-card__value stat-card__value--role">admin</span>
          <span className="stat-card__sub">Controls what you can do in this app</span>
        </div>

        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="stat-card__label">{s.label}</span>
            <span className="stat-card__value">{s.value ?? '...'}</span>
            <span className="stat-card__sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>What can you do here?</h3>
        <ul className="role-list">
          <li><strong>Users &amp; Accounts</strong> — manage accounts and roles, and create new users.</li>
          <li><strong>Curriculum</strong> — create, edit, archive, and delete curriculum records.</li>
          <li><strong>Activity Logs</strong> — see a record of every action taken in the system.</li>
        </ul>
      </div>
    </div>
  )
}

export default Dashboard


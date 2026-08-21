// Admin dashboard: system overview for the administrator role.
// Shows stat cards (role, curriculum record count, user count) plus the
// admin capability list.

import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabaseClient'
import type { Profile } from '../../services/database'

interface DashboardProps {
  profile: Profile | null
}

function Dashboard({ profile }: DashboardProps) {
  const [userCount, setUserCount] = useState<number | null>(null)
  const [resourceCount, setResourceCount] = useState<number | null>(null)

  // Load counts once per mount.
  useEffect(() => {
    const count = async (table: string) => {
      const { count } = await supabase!
        .from(table)
        .select('id', { count: 'exact', head: true })
      return count ?? 0
    }

    count('profiles').then(setUserCount)
    count('resources').then(setResourceCount)
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

        <div className="stat-card">
          <span className="stat-card__label">Curriculum records</span>
          <span className="stat-card__value">{resourceCount ?? '...'}</span>
          <span className="stat-card__sub">Visible to every signed-in role</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__label">Users</span>
          <span className="stat-card__value">{userCount ?? '...'}</span>
          <span className="stat-card__sub">Registered profiles in the system</span>
        </div>
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

// Manager dashboard: overview for the program head / CQI lead role.
// Shows stat cards (role, curriculum record count, user count) plus the
// manager capability list.

import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabaseClient'

function Dashboard({ profile }) {
  const [userCount, setUserCount] = useState(null)
  const [resourceCount, setResourceCount] = useState(null)

  // Load counts once per mount.
  useEffect(() => {
    const count = async (table) => {
      const { count } = await supabase
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
        <h2>Dashboard</h2>
        <p>
          Welcome back, <strong>{profile?.full_name || profile?.email}</strong>. You are signed in
          as <span className="role-badge role-badge--manager">manager</span>.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Your role</span>
          <span className="stat-card__value stat-card__value--role">manager</span>
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
          <li><strong>Curriculum</strong> — map courses to program outcomes, maintain CO/PO alignment, and publish curriculum data.</li>
          <li><strong>Faculty</strong> — browse all user profiles (read-only).</li>
          <li><strong>Audit Log</strong> — view the record of actions.</li>
        </ul>
      </div>
    </div>
  )
}

export default Dashboard

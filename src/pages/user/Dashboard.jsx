// User dashboard: overview for the faculty / instructor role.
// Shows stat cards (role, curriculum record count) plus the user capability list.

import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabaseClient'

function Dashboard({ profile }) {
  const [resourceCount, setResourceCount] = useState(null)

  // Load the curriculum record count once per mount.
  useEffect(() => {
    const count = async (table) => {
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
      return count ?? 0
    }

    count('resources').then(setResourceCount)
  }, [])

  return (
    <div className="dashboard">
      <div className="page-heading">
        <h2>Dashboard</h2>
        <p>
          Welcome back, <strong>{profile?.full_name || profile?.email}</strong>. You are signed in
          as <span className="role-badge role-badge--user">user</span>.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Your role</span>
          <span className="stat-card__value stat-card__value--role">user</span>
          <span className="stat-card__sub">Controls what you can do in this app</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__label">Curriculum records</span>
          <span className="stat-card__value">{resourceCount ?? '...'}</span>
          <span className="stat-card__sub">Visible to every signed-in role</span>
        </div>
      </div>

      <div className="panel">
        <h3>What can you do here?</h3>
        <ul className="role-list">
          <li><strong>Curriculum</strong> — view curriculum maps and outcomes alignment data.</li>
          <li><strong>Profile</strong> — update your own name.</li>
        </ul>
      </div>
    </div>
  )
}

export default Dashboard

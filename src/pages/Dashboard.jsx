// Dashboard: role-aware overview. Shows stat cards (role, curriculum record count,
// and user count for admin/manager) plus a per-role "what you can do here" list.

import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabaseClient'

function Dashboard({ profile, role }) {
  const [userCount, setUserCount] = useState(null)
  const [resourceCount, setResourceCount] = useState(null)

  // Load counts once per mount (keyed by role in case it changes).
  useEffect(() => {
    // head: true makes this a COUNT-only query — no rows returned, just the count.
    const count = async (table) => {
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
      return count ?? 0
    }

    // Only admin/manager can count profiles (RLS blocks users, which would just return 0).
    if (role === 'admin' || role === 'manager') count('profiles').then(setUserCount)
    count('resources').then(setResourceCount)
  }, [role])

  return (
    <div className="dashboard">
      <div className="page-heading">
        <h2>Dashboard</h2>
        <p>
          Welcome back, <strong>{profile?.full_name || profile?.email}</strong>. You are signed in
          as <span className={`role-badge role-badge--${role}`}>{role}</span>.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Your role</span>
          <span className="stat-card__value stat-card__value--role">{role}</span>
          <span className="stat-card__sub">Controls what you can do in this app</span>
        </div>

        <div className="stat-card">
          <span className="stat-card__label">Curriculum records</span>
          <span className="stat-card__value">{resourceCount ?? '...'}</span>
          <span className="stat-card__sub">Visible to every signed-in role</span>
        </div>

        {(role === 'admin' || role === 'manager') && (
          <div className="stat-card">
            <span className="stat-card__label">Users</span>
            <span className="stat-card__value">{userCount ?? '...'}</span>
            <span className="stat-card__sub">Registered profiles in the system</span>
          </div>
        )}
      </div>

      {/* Capability list changes per role — mirrors the RLS rules, for UX only. */}
      <div className="panel">
        <h3>What can you do here?</h3>
        <ul className="role-list">
          {role === 'admin' && (
            <>
              <li><strong>Users &amp; Accounts</strong> — manage accounts and roles, and create new users.</li>
              <li><strong>Curriculum</strong> — create, edit, archive, and delete curriculum records.</li>
              <li><strong>Audit Log</strong> — see a record of every action taken in the system.</li>
            </>
          )}
          {role === 'manager' && (
            <>
              <li><strong>Curriculum</strong> — map courses to program outcomes, maintain CO/PO alignment, and publish curriculum data.</li>
              <li><strong>Faculty</strong> — browse all user profiles (read-only).</li>
              <li><strong>Audit Log</strong> — view the record of actions.</li>
            </>
          )}
          {role === 'user' && (
            <>
              <li><strong>Curriculum</strong> — view curriculum maps and outcomes alignment data.</li>
              <li><strong>Profile</strong> — update your own name.</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}

export default Dashboard

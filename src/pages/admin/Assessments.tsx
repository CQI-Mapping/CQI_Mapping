// Assessments — placeholder for Assessment Monitoring (Option C, flat pills)
// Manager/admin: define assessments per CLO (title, term, max_score, weight, method)
// User: read-only browse. Full CRUD + attainment wiring lands in next phase (schema + D3 phase).

import { useState } from 'react'

interface AssessmentsProps {
  profile?: unknown
  onNavigate?: (page: string) => void
}

export default function Assessments(_props: AssessmentsProps) {
  const [info] = useState(false)
  void info
  return (
    <div className="programs-page">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">A</div>
          <div className="program-hero__titles">
            <h2>Assessments</h2>
            <p>Define assessments per CLO — title, term, max score, weight & method. Aggregated results feed CLO/PO attainment. Coming next: schema + entry forms + RLS.</p>
          </div>
        </div>
      </div>

      <div className="panel program-panel" style={{ borderTop: '3px solid #111' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Assessment Monitoring — Phase 1</h3>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
          This placeholder reserves the <strong>Assessments</strong> nav for your 1.3 Objectives (curriculum mapping ✓, outcomes alignment ✓, <em>assessment monitoring → next</em>).
          Next step is the migration: <code>clo_po_matrix</code> DDL fix + <code>assessments</code> + <code>assessment_results</code> with RLS, then CRUD mirroring <code>src/pages/admin/Course.tsx</code>.
        </p>
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: '#334155', fontSize: 13, display: 'grid', gap: 6 }}>
          <li><strong>Define</strong> — per course & CLO: e.g. Midterm Exam • 1st Sem 2024-2025 • max 100 • weight 20% • direct</li>
          <li><strong>Results</strong> — aggregated: students_total / students_passed / avg_score (or per-student variant)</li>
          <li><strong>Attainment</strong> — auto-computed % → feeds Attainment dashboard D3 heatmap</li>
        </ul>
        <p style={{ margin: '14px 0 0', color: '#94a3b8', fontSize: 12 }}>Navbar: flat pills (Option C) — <code>Dashboard</code> | <code>Academics ▼</code> | <code>Assessments</code> | <code>Attainment</code>. Scales to dropdown (Option A) when you add 3rd+ page.</p>
      </div>
    </div>
  )
}

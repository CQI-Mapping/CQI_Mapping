// Attainment Dashboard — placeholder for D3 visualizations (Option C, flat pills)
// Manager/admin: heatmap (CLO × PO % ), PO bar chart, term trend + gap list. User: read-only.

interface AttainmentProps {
  profile?: unknown
  onNavigate?: (page: string) => void
}

export default function Attainment(_props: AttainmentProps) {
  return (
    <div className="programs-page">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">%</div>
          <div className="program-hero__titles">
            <h2>Attainment</h2>
            <p>D3-driven CQI evidence — CLO/PO attainment %, gaps & trends. Placeholder until assessment data lands.</p>
          </div>
        </div>
      </div>

      <div className="panel program-panel" style={{ borderTop: '3px solid #111' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Interactive Visualizations (D3.js) — Planned</h3>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
          Objective 2: <code>d3@7.9.0</code> already in <code>package.json</code> (used only in <code>SubjectView.tsx</code>). This dashboard will reuse its patterns.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          <div style={{ border: '1px solid #ececec', borderRadius: 12, padding: 14, background: '#fcfcfc' }}>
            <strong style={{ fontSize: 13 }}>CLO × PO Heatmap</strong>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>Rows = CLOs, cols = POs, cell = attainment % (green≥70 yellow 50-70 red&lt;50) via <code>d3.scaleThreshold</code>.</p>
          </div>
          <div style={{ border: '1px solid #ececec', borderRadius: 12, padding: 14, background: '#fcfcfc' }}>
            <strong style={{ fontSize: 13 }}>PO Attainment Bars</strong>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>Avg % per PO + 70% benchmark line, per program/term filter.</p>
          </div>
          <div style={{ border: '1px solid #ececec', borderRadius: 12, padding: 14, background: '#fcfcfc' }}>
            <strong style={{ fontSize: 13 }}>Term Trend</strong>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}><code>d3.line</code> term-over-term for selected CLO/PO, with gap list below threshold.</p>
          </div>
        </div>
        <p style={{ margin: '14px 0 0', color: '#94a3b8', fontSize: 12 }}>Filters: Program → Course → Term (mirrors <code>SubjectView.tsx</code> left panel). Export: PDF evidence for NBSC/CHED.</p>
      </div>
    </div>
  )
}

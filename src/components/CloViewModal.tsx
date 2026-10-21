// Read-only details for one standalone course learning outcome, in a modal.
//
// Shared by the CLO page's eye button and the user dashboard's recent-outcomes
// feed so the two call sites show one identical view. Purely presentational:
// the caller owns the open state and the record; the dialog never mutates.

import type { CSSProperties } from 'react'
import type { CourseLearningOutcomeStandalone } from '../services/database'

interface CloViewModalProps {
  /** The record to show; null renders nothing (the closed state). */
  item: CourseLearningOutcomeStandalone | null
  onClose: () => void
}

// Section labels read like report headers: small, wide-spaced capitals.
const LABEL: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#94a3b8',
}

function CloViewModal({ item, onClose }: CloViewModalProps) {
  if (!item) return null
  const active = !item.status || item.status === 'active'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Course learning outcome ${item.code}`}>
        <div className="modal__header">
          <h3>{item.code} — {item.course || 'No course'}</h3>
        </div>
        <div className="modal__body">
          <div>
            <p style={LABEL}>Description</p>
            <p style={{ margin: '4px 0 0', lineHeight: 1.55, color: '#334155' }}>
              {item.description || 'No description.'}
            </p>
          </div>
          <div>
            <p style={LABEL}>Program outcomes</p>
            <div style={{ fontSize: 12.5, background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px', color: '#475569', marginTop: 4 }}>
              {item.title || '—'}
            </div>
          </div>
          <div className="modal__grid-2">
            <div>
              <p style={LABEL}>Status</p>
              <p style={{ margin: '4px 0 0' }}>
                <span className={`status-badge status-badge--${active ? 'active' : 'archived'}`}>
                  {active ? 'Active' : 'Archived'}
                </span>
              </p>
            </div>
            <div>
              <p style={LABEL}>Last updated</p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#475569' }}>{new Date(item.updated_at).toLocaleString()}</p>
            </div>
          </div>
          <div>
            <p style={LABEL}>Created</p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#475569' }}>{new Date(item.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default CloViewModal

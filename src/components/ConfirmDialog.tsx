// Confirmation dialog for sensitive actions (sign-out of other sessions, …)
// — the same .modal-overlay/.modal visual language the Users & Accounts
// fix-profile modal uses, so the app has one "are you sure?" look.
//
// The caller owns the busy state: while busy the dialog stays pinned (clicks
// on the backdrop and Cancel are ignored) and shows the busy label, because
// saving a dialog that is mid-write must not be dismissable out from under
// itself.

import { useEffect } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  body: React.ReactNode
  confirmLabel: string
  /** Confirm button text while the action runs (e.g. "Signing out…"). */
  busyLabel?: string
  cancelLabel?: string
  /** Danger tint: red header accent and a warning icon inside the body. */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc cancels — unless a write is in flight.
  useEffect(() => {
    if (!isOpen || busy) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, busy, onCancel])

  if (!isOpen) return null
  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="modal confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal__header confirm-modal__head">
          {danger && (
            <svg
              className="confirm-modal__warning"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
          <div>
            <h3>{title}</h3>
          </div>
        </div>
        <div className="modal__body">{body}</div>
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'} btn--sm`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ViewModeToggle: List | Grid segmented switch for card-listing pages.
// Reuses the existing .sd-tab styles so no new design system is introduced.
import type { ViewMode } from '../hooks/useViewMode'
import Icon from './icons'

interface ViewModeToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  label?: string
}

export default function ViewModeToggle({ mode, onChange, label = 'Change view style' }: ViewModeToggleProps) {
  return (
    <div className="sd-tabs view-toggle" role="group" aria-label={label} style={{ marginBottom: 0 }}>
      <button
        type="button"
        className={`sd-tab ${mode === 'list' ? 'sd-tab--active' : ''}`}
        onClick={() => onChange('list')}
        aria-pressed={mode === 'list'}
      >
        <Icon name="list" size={13} /> List
      </button>
      <button
        type="button"
        className={`sd-tab ${mode === 'grid' ? 'sd-tab--active' : ''}`}
        onClick={() => onChange('grid')}
        aria-pressed={mode === 'grid'}
      >
        <Icon name="grid" size={13} /> Grid
      </button>
    </div>
  )
}

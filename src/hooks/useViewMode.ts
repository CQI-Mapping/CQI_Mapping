// Shared list/grid view-style hook: lets the user decide how listing pages
// look — 'list' (resource-card rows, the default) or 'grid'
// (program-card--2026 cards). The pick persists per browser in localStorage,
// same pattern as useSelection. Pass a per-page key so each listing page
// remembers its own style independently.
import { useState, useCallback } from 'react'

export type ViewMode = 'list' | 'grid'

export function useViewMode(storageKey: string, initial: ViewMode = 'list') {
  const [mode, setModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved === 'grid' || saved === 'list' ? saved : initial
    } catch {
      return initial
    }
  })

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // Storage unavailable — the style still applies in memory.
      }
    },
    [storageKey],
  )

  return [mode, setMode] as const
}

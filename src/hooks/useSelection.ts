// Shared single-selection hook: remembers the chosen card id in localStorage
// so the selection survives refresh + navigation on the same browser.
// Browser-only by design — no DB table, no RLS, works for every role.
import { useState, useCallback } from 'react'

export function useSelection(storageKey: string) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  })

  const select = useCallback(
    (id: string) => {
      setSelectedId((prev) => {
        const next = prev === id ? null : id
        try {
          if (next) localStorage.setItem(storageKey, next)
          else localStorage.removeItem(storageKey)
        } catch {
          // Storage unavailable — selection still works in memory.
        }
        return next
      })
    },
    [storageKey],
  )

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignore storage errors.
    }
    setSelectedId(null)
  }, [storageKey])

  return [selectedId, select, clear] as const
}

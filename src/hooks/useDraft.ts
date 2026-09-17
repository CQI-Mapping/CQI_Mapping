// Shared draft hook: keeps form input in sessionStorage so typed text survives
// page navigation (which unmounts the page), ALT+TAB, and full-page reloads
// within the same tab. Writes synchronously on every change so nothing is
// lost even if the component unmounts before useEffect fires.
// Never use this for passwords or other secrets — sessionStorage is readable
// by any script on the page.

import { useState, useCallback } from 'react'

export function readDraft<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    // Corrupt or unavailable storage — fall back to the initial value.
  }
  return fallback
}

export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readDraft(key, initial))

  const persist = useCallback((v: T) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(v))
    } catch {
      // Storage full or unavailable — the form still works in memory.
    }
    return v
  }, [key])

  const setAndPersist = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
      try {
        sessionStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Storage full or unavailable.
      }
      return next
    })
  }, [key])

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Ignore storage errors.
    }
    setValue(initial)
  }, [key, initial])

  return [value, setAndPersist, clear] as const
}

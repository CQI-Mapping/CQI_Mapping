// Shared CRUD state + handlers for admin pages (Curriculum sub-views, PEOs, POs,
// CLOs, Strategic Goals, CHED Memorandum Orders). Each view provides its own form
// JSX but delegates load/create/update/delete handling to this hook.
// Note: the `details` parameter was removed from activity log calls in this version.

import { useState, useCallback } from 'react'
import { addActivityLog } from '../../../services/database'

interface UseEntityCrudParams<T> {
  loadFn: () => Promise<T[]>
  createFn: (payload: Partial<T>) => Promise<T>
  updateFn: (id: string, payload: Partial<T>) => Promise<T>
  deleteFn: (id: string) => Promise<void>
  userEmail: string
  scope: string
}

export function useEntityCrud<T extends { id: string }>({
  loadFn,
  createFn,
  updateFn,
  deleteFn,
  userEmail,
  scope,
}: UseEntityCrudParams<T>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Reload the list (called on mount and after every mutation).
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await loadFn())
    } catch (e) {
      setError('Unable to load: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [loadFn])

  const handleCreate = async (payload: Partial<T>, action?: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await createFn(payload)
      if (action) await addActivityLog(userEmail, action)
      setMessage(`${scope} created.`)
      load()
      return true
    } catch (e) {
      setError(`Failed to create ${scope.toLowerCase()}: ` + (e instanceof Error ? e.message : String(e)))
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleUpdate = async (id: string | null, payload: Partial<T>, action?: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (id) await updateFn(id, payload)
      if (action) await addActivityLog(userEmail, action)
      setMessage(`${scope} updated.`)
      load()
      return true
    } catch (e) {
      setError(`Failed to update ${scope.toLowerCase()}: ` + (e instanceof Error ? e.message : String(e)))
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string, action?: string) => {
    if (!window.confirm(`Delete this ${scope.toLowerCase()} permanently?`)) return false
    setError('')
    setMessage('')
    try {
      await deleteFn(id)
      if (action) await addActivityLog(userEmail, action)
      setMessage(`${scope} deleted.`)
      load()
      return true
    } catch (e) {
      setError(`Failed to delete ${scope.toLowerCase()}: ` + (e instanceof Error ? e.message : String(e)))
      return false
    }
  }

  return { items, loading, error, message, busy, load, setError, handleCreate, handleUpdate, handleDelete }
}

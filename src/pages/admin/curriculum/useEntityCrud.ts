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

function friendlyError(raw: string): string {
  if (/duplicate key.*violates unique constraint/.test(raw)) {
    const keyName = raw.match(/violates unique constraint "(\w+)"/)?.[1] ?? ''
    const parts = keyName.replace(/_key$/, '').split('_').filter(Boolean)
    const columnWords = ['code', 'title', 'name', 'email', 'id']
    const columns = parts.filter((p) => columnWords.includes(p))
    if (columns.length >= 2)
      return `A ${columns.join(' and ')} combination already exists. Please use a different code or title.`
    if (columns.length === 1)
      return `This ${columns[0]} already exists. Please use a different ${columns[0]}.`
    return 'A record with these details already exists. Please use different values.'
  }
  if (/new row.*violates row-level security/.test(raw)) return 'You do not have permission to perform this action.'
  if (/permission denied/.test(raw)) return 'Permission denied. Please check your account role.'
  if (/invalid input syntax/.test(raw)) return 'The data format is invalid. Please check your entries.'
  if (/violates foreign key constraint/.test(raw)) return 'This item is linked to other records and cannot be modified.'
  if (/violates check constraint/.test(raw)) return 'One or more fields contain invalid values.'
  return raw
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
      const raw = e instanceof Error ? e.message : (e && typeof e === 'object' ? (e as Record<string, unknown>).message || JSON.stringify(e) : String(e))
      setError('Unable to load: ' + friendlyError(String(raw)))
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
      const raw = e instanceof Error ? e.message : (e && typeof e === 'object' ? (e as Record<string, unknown>).message || JSON.stringify(e) : String(e))
      setError(friendlyError(String(raw)))
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
      const raw = e instanceof Error ? e.message : (e && typeof e === 'object' ? (e as Record<string, unknown>).message || JSON.stringify(e) : String(e))
      setError(friendlyError(String(raw)))
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
      const raw = e instanceof Error ? e.message : (e && typeof e === 'object' ? (e as Record<string, unknown>).message || JSON.stringify(e) : String(e))
      setError(friendlyError(String(raw)))
      return false
    }
  }

  return { items, loading, error, message, busy, load, setError, handleCreate, handleUpdate, handleDelete }
}

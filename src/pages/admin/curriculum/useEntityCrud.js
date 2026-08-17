// Shared CRUD state + handlers for the admin Curriculum sub-views.
// Each view provides its own form JSX but delegates load/create/update/delete
// handling (and audit logging) to this hook.

import { useState, useCallback } from 'react'
import { addAuditLog } from '../../../services/database'

export function useEntityCrud({ loadFn, createFn, updateFn, deleteFn, userEmail, scope }) {
  const [items, setItems] = useState([])
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
      setError('Unable to load: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [loadFn])

  const handleCreate = async (payload, action, details) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await createFn(payload)
      if (action) await addAuditLog(userEmail, action, details)
      setMessage(`${scope} created.`)
      load()
      return true
    } catch (e) {
      setError(`Failed to create ${scope.toLowerCase()}: ` + e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleUpdate = async (id, payload, action, details) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await updateFn(id, payload)
      if (action) await addAuditLog(userEmail, action, details)
      setMessage(`${scope} updated.`)
      load()
      return true
    } catch (e) {
      setError(`Failed to update ${scope.toLowerCase()}: ` + e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id, action, details) => {
    if (!window.confirm(`Delete this ${scope.toLowerCase()} permanently?`)) return false
    setError('')
    setMessage('')
    try {
      await deleteFn(id)
      if (action) await addAuditLog(userEmail, action, details)
      setMessage(`${scope} deleted.`)
      load()
      return true
    } catch (e) {
      setError(`Failed to delete ${scope.toLowerCase()}: ` + e.message)
      return false
    }
  }

  return { items, loading, error, message, busy, load, setError, handleCreate, handleUpdate, handleDelete }
}

// Shared CRUD state + handlers for admin pages (Curriculum sub-views, PEOs, POs,
// CLOs, Strategic Goals, CHED Memorandum Orders). Each view provides its own form
// JSX but delegates load/create/update/delete handling to this hook.
//
// Audit entries are stamped with the caller's identity server-side
// (log_activity RPC) — only the action and an optional details blob are
// supplied here. Handlers only write an audit entry when the mutation
// actually happened, so the log never claims a change that did not occur.

import { useState, useCallback } from 'react'
import { addActivityLog, type ActivityDetails } from '../../../services/database'

interface UseEntityCrudParams<T> {
  loadFn: () => Promise<T[]>
  createFn: (payload: Partial<T>) => Promise<T>
  updateFn: (id: string, payload: Partial<T>) => Promise<T>
  deleteFn: (id: string) => Promise<void>
  scope: string
}

// Entities are generically typed, so `status` isn't statically present.
// These read it off the row the same way EntityCrudPage's `isActive` default does.
function statusOf(item: unknown): string {
  const s = (item as { status?: string } | null)?.status
  return s || 'active'
}

function friendlyError(raw: string): string {
  if (/duplicate key.*violates unique constraint/.test(raw)) {
    const keyName = raw.match(/violates unique constraint "(\w+)"/)?.[1] ?? ''
    const parts = keyName.replace(/_key$/, '').split('_').filter(Boolean)
    const columnWords = ['code', 'title', 'name', 'email', 'id', 'cmo', 'peo', 'sg', 'course']
    const columns = parts.filter((p) => columnWords.includes(p))
    // Same CLO code with different course is allowed (UNIQUE(code,course)); same PO code
    // with different CMO is allowed (UNIQUE(code,cmo_id)).
    if (columns.includes('code') && columns.includes('course')) {
      return 'This code already exists for this course. Same code with a different course is allowed — change the course or the code.'
    }
    if (columns.includes('code') && columns.includes('cmo')) {
      return 'This code already exists for the selected CMO Alignment. Same code with a different CMO Alignment is allowed — pick a different CMO or a different code.'
    }
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

// Pulls a human-readable identity off a row for the audit entry's `label`.
// Order matters: code is the most stable identifier, then a title, then a
// description that may be empty.
function labelOf(item: unknown): string | undefined {
  const row = item as { code?: string | null; title?: string | null; name?: string | null; description?: string | null } | null
  if (!row) return undefined
  const code = row.code?.trim()
  const text = row.title?.trim() || row.name?.trim() || row.description?.trim()
  if (code && text) return `${code} — ${text}`
  return code || text || undefined
}

export function useEntityCrud<T extends { id: string }>({
  loadFn,
  createFn,
  updateFn,
  deleteFn,
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

  // Entity context for the audit entry: which record, and what it was called.
  const detailsFor = (item: unknown, entity?: string): ActivityDetails => ({
    entity,
    entity_id: (item as { id?: string } | null)?.id,
    label: labelOf(item),
  })

  const handleCreate = async (payload: Partial<T>, action?: string, created?: unknown) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const row = await createFn(payload)
      // Prefer the row the database actually created — its id is authoritative.
      if (action) await addActivityLog(action, detailsFor(row ?? created, action.split('.')[0]))
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

  const handleUpdate = async (id: string | null, payload: Partial<T>, action?: string, existing?: unknown) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      // No id means there is nothing to update — save nothing AND log nothing.
      // The previous version logged regardless, which wrote an audit entry
      // for a change that never happened.
      if (!id) {
        setError(`Select a ${scope.toLowerCase()} to update.`)
        return false
      }
      await updateFn(id, payload)
      if (action) await addActivityLog(action, detailsFor(existing ?? { id }, action.split('.')[0]))
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

  const handleDelete = async (id: string, action?: string, existing?: unknown) => {
    if (!window.confirm(`Delete this ${scope.toLowerCase()} permanently?`)) return false
    setError('')
    setMessage('')
    try {
      await deleteFn(id)
      if (action) await addActivityLog(action, detailsFor(existing ?? { id }, action.split('.')[0]))
      setMessage(`${scope} deleted.`)
      load()
      return true
    } catch (e) {
      const raw = e instanceof Error ? e.message : (e && typeof e === 'object' ? (e as Record<string, unknown>).message || JSON.stringify(e) : String(e))
      setError(friendlyError(String(raw)))
      return false
    }
  }

  // Archive/restore: flips the row's status column. The DB guard trigger
  // rejects status changes from non-admins, so this is admin-only in practice.
  // `action` must be the archive/restore variant (e.g. 'course.archived'), not
  // the generic update action, or the log will report an archive as an edit.
  const handleToggleStatus = async (item: T, action?: string) => {
    setError('')
    setMessage('')
    const next = statusOf(item) === 'active' ? 'archived' : 'active'
    try {
      await updateFn(item.id, { status: next } as unknown as Partial<T>)
      if (action) await addActivityLog(action, detailsFor(item, action.split('.')[0]))
      setMessage(`${scope} ${next}.`)
      load()
      return true
    } catch (e) {
      setError(
        `Failed to ${statusOf(item) === 'active' ? 'archive' : 'restore'} ${scope.toLowerCase()}: ` +
        (e instanceof Error ? e.message : String(e))
      )
      return false
    }
  }

  return { items, loading, error, message, busy, load, setError, handleCreate, handleUpdate, handleDelete, handleToggleStatus }
}
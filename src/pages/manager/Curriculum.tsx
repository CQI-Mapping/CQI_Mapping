// Manager Curriculum page: management of curriculum records.
// Manager can create, edit, and archive/restore records, but cannot delete them.
// Every mutation writes an activity log entry (action only, no details).

import { useState, useEffect } from 'react'
import {
  fetchResources,
  createResource,
  updateResource,
  addActivityLog,
} from '../../services/database'
import { supabase } from '../../utils/supabaseClient'
import type { Resource } from '../../services/database'

interface CurriculumProps {
  userEmail: string
}

function Curriculum({ userEmail }: CurriculumProps) {
  const errMsg = (e: unknown) => {
    if (e instanceof Error) return e.message
    if (e && typeof e === 'object') {
      const m = (e as Record<string, unknown>).message
      return typeof m === 'string' ? m : JSON.stringify(e)
    }
    return String(e)
  }
  const [items, setItems] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // "New record" form state.
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [units, setUnits] = useState('')
  // Inline-edit state (only one card edits at a time).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editUnits, setEditUnits] = useState('')
  const [busy, setBusy] = useState(false)
  const [archived, setArchived] = useState(false)

  // Filtered lists
  const isActive = (i: Resource) => !i.status || i.status === 'active'
  const visible = items.filter((i) => (archived ? !isActive(i) : isActive(i)))
  const archivedCount = items.filter((i) => !isActive(i)).length

  // Fetch the list from the DB.
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await fetchResources())
    } catch (e) {
      setError('Unable to load resources: ' + errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Current user's UUID — required by the RLS insert policy (created_by = auth.uid()).
  const currentUserId = async () => {
    const { data } = await supabase!.auth.getUser()
    return data?.user?.id
  }

  // Create a new curriculum record + audit entry.
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const userId = await currentUserId()
      if (!userId) throw new Error('Not authenticated')
      const codeValue = code.trim()
      if (!codeValue) throw new Error('Code is required')
      await createResource(codeValue, description.trim() || null, units === '' ? null : Number(units), userId)
      await addActivityLog('resource.created')
      setCode('')
      setDescription('')
      setUnits('')
      setMessage('Resource created.')
      load()
    } catch (e) {
      setError('Failed to create resource: ' + errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  // Load a card's current values into the edit form.
  const startEdit = (item: Resource) => {
    setEditingId(item.id)
    setEditCode(item.code || '')
    setEditDescription(item.description || '')
    setEditUnits(item.units == null ? '' : String(item.units))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditCode('')
    setEditDescription('')
    setEditUnits('')
  }

  // Save the edited code/description/units + audit entry.
  const handleSave = async (id: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const codeValue = editCode.trim()
      if (!codeValue) throw new Error('Code is required')
      await updateResource(id, {
        title: codeValue,
        code: codeValue,
        description: editDescription.trim() || null,
        units: editUnits === '' ? null : Number(editUnits),
      })
      await addActivityLog('resource.updated')
      setMessage('Resource updated.')
      cancelEdit()
      load()
    } catch (e) {
      setError('Failed to update resource: ' + errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  // Toggle a record between active/archived + audit entry.
  const handleToggleStatus = async (item: Resource) => {
    setError('')
    setMessage('')
    const next = item.status === 'active' ? 'archived' : 'active'
    try {
      await updateResource(item.id, { status: next })
      await addActivityLog(next === 'archived' ? 'resource.archived' : 'resource.restored')
      setMessage(`Resource ${next}.`)
      load()
    } catch (e) {
      setError('Failed to update resource: ' + errMsg(e))
    }
  }

  return (
    <div className="resources">
      <div className="page-heading">
        <h2>Curriculum</h2>
        <p>Create, edit, and archive curriculum records.</p>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}

      <form className="panel create-resource" onSubmit={handleCreate}>
        <h3>New curriculum record</h3>
        <label className="field">
          <span>Curriculum code</span>
          <input
            className="input"
            type="text"
            placeholder="e.g. BSIT 2021-2022"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Curriculum description</span>
          <textarea
            className="input"
            rows={3}
            placeholder="Describe this curriculum record"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Total Units</span>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="e.g. 3"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Loading curriculum...</p>
      ) : (
        <div className="panel table-wrap">
          <div className="sd-tabs">
            <button className={`sd-tab ${!archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(false)}>Active</button>
            <button className={`sd-tab ${archived ? 'sd-tab--active' : ''}`} onClick={() => setArchived(true)}>
              Archive {archivedCount > 0 && <span className="sd-tab__count">{archivedCount}</span>}
            </button>
          </div>
          <div className="resource-list">
            {visible.length === 0 && <p>No {archived ? 'archived' : 'active'} curriculum records.</p>}
            {visible.map((item) => (
              <div className={`resource-card ${item.status === 'archived' ? 'resource-card--archived' : ''}`} key={item.id}>
                {editingId === item.id ? (
                  <div className="resource-card__edit">
                    <label className="field">
                      <span>Curriculum code</span>
                      <input
                        className="input"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Curriculum description</span>
                      <textarea
                        className="input"
                        rows={3}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Total Units</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={editUnits}
                        onChange={(e) => setEditUnits(e.target.value)}
                      />
                    </label>
                    <div className="resource-card__actions">
                      <button className="btn btn--primary btn--sm" onClick={() => handleSave(item.id)} disabled={busy}>
                        Save
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="resource-card__body">
                      <h4>{item.code || item.title}</h4>
                      {item.description && <p>{item.description}</p>}
                      <div className="resource-card__meta">
                        <span className={`status-badge status-badge--${item.status}`}>{item.status}</span>
                        {item.units != null && <span>{item.units} unit{item.units === 1 ? '' : 's'}</span>}
                        <span>by {(typeof item.created_by === 'object' && item.created_by?.full_name) || 'Unknown'}</span>
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="resource-card__actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleToggleStatus(item)}
                      >
                        {item.status === 'active' ? 'Archive' : 'Restore'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Curriculum

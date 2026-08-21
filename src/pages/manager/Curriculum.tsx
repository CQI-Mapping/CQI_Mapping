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
  const [items, setItems] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // "New record" form state.
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Inline-edit state (only one card edits at a time).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [busy, setBusy] = useState(false)

  // Fetch the list from the DB.
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await fetchResources())
    } catch (e) {
      setError('Unable to load resources: ' + (e instanceof Error ? e.message : String(e)))
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
      await createResource(title.trim(), description.trim() || null, userId)
      await addActivityLog(userEmail, 'resource.created')
      setTitle('')
      setDescription('')
      setMessage('Resource created.')
      load()
    } catch (e) {
      setError('Failed to create resource: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  // Load a card's current values into the edit form.
  const startEdit = (item: Resource) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditDescription('')
  }

  // Save the edited title/description + audit entry.
  const handleSave = async (id: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await updateResource(id, { title: editTitle.trim(), description: editDescription.trim() || null })
      await addActivityLog(userEmail, 'resource.updated')
      setMessage('Resource updated.')
      cancelEdit()
      load()
    } catch (e) {
      setError('Failed to update resource: ' + (e instanceof Error ? e.message : String(e)))
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
      await addActivityLog(userEmail, 'resource.archived')
      setMessage(`Resource ${next}.`)
      load()
    } catch (e) {
      setError('Failed to update resource: ' + (e instanceof Error ? e.message : String(e)))
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
        <div className="create-resource__row">
          <input
            className="input"
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <input
            className="input"
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      {loading ? (
        <p>Loading curriculum...</p>
      ) : (
        <div className="resource-list">
          {items.length === 0 && <p>No curriculum records yet.</p>}
          {items.map((item) => (
            <div className={`resource-card ${item.status === 'archived' ? 'resource-card--archived' : ''}`} key={item.id}>
              {editingId === item.id ? (
                <div className="resource-card__edit">
                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <input
                    className="input"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
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
                    <h4>{item.title}</h4>
                    {item.description && <p>{item.description}</p>}
                    <div className="resource-card__meta">
                      <span className={`status-badge status-badge--${item.status}`}>{item.status}</span>
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
      )}
    </div>
  )
}

export default Curriculum

// Admin Program page: manages academic programs. Programs support create /
// edit / archive / restore / delete.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  addActivityLog,
} from '../../services/database'
import type { Program } from '../../services/database'

interface ProgramProps {
  profile?: { email?: string | null } | null
}

const isActive = (item: { status?: string }) => !item.status || item.status === 'active'

const blankProgram = { code: '', name: '', description: '' }

export default function Program({ profile }: ProgramProps) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [programForm, setProgramForm] = useState(blankProgram)
  const [editProgramId, setEditProgramId] = useState<string | null>(null)
  const [editProgram, setEditProgram] = useState(blankProgram)

  const userEmail = profile?.email ?? 'unknown'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const p = await fetchPrograms()
      setPrograms(p)
      setSelectedId((prev) => {
        if (prev && p.some((x) => x.id === prev)) return prev
        return p[0]?.id ?? null
      })
    } catch (e) {
      setError('Unable to load programs: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ----- Programs -----

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const created = await createProgram({
        code: programForm.code.trim(),
        name: programForm.code.trim(),
        description: programForm.description.trim() || null,
      })
      await addActivityLog(userEmail, 'program.created')
      setMessage('Program created.')
      setProgramForm(blankProgram)
      setSelectedId(created.id)
      load()
    } catch (err) {
      setError('Failed to create program: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const startEditProgram = (item: Program) => {
    setEditProgramId(item.id)
    setEditProgram({ code: item.code, name: item.name, description: item.description || '' })
  }

  const saveEditProgram = async () => {
    if (!editProgramId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await updateProgram(editProgramId, {
        code: editProgram.code.trim(),
        name: editProgram.code.trim(),
        description: editProgram.description.trim() || null,
      })
      await addActivityLog(userEmail, 'program.updated')
      setMessage('Program updated.')
      setEditProgramId(null)
      load()
    } catch (err) {
      setError('Failed to update program: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const toggleProgramStatus = async (item: Program) => {
    setError('')
    setMessage('')
    setBusy(true)
    const next = isActive(item) ? 'archived' : 'active'
    try {
      await updateProgram(item.id, { status: next })
      await addActivityLog(userEmail, 'program.archived')
      setMessage(`Program ${next}.`)
      load()
    } catch (err) {
      setError('Failed to update program status: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteProgram = async (id: string) => {
    if (!window.confirm('Delete this program permanently? Its courses will also be deleted.')) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await deleteProgram(id)
      await addActivityLog(userEmail, 'program.deleted')
      setMessage('Program deleted.')
      if (selectedId === id) setSelectedId(null)
      load()
    } catch (err) {
      setError('Failed to delete program: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="curriculum-view">
      {error && <p className="msg msg--error">{error}</p>}
      {message && <p className="msg msg--success">{message}</p>}
      {loading ? (
        <p>Loading programs...</p>
      ) : (
        <div className="program-layout">
          {/* Programs */}
          <section className="panel program-panel">
            <h3>Programs</h3>
            <form className="create-resource" onSubmit={handleCreateProgram}>
              <div className="create-resource__row">
                <label className="field">
                  <span>Course</span>
                  <input className="input input--sm" type="text" placeholder="e.g. IT21"
                    value={programForm.code} onChange={(e) => setProgramForm({ ...programForm, code: e.target.value })} required />
                </label>
              </div>
              <label className="field">
                <span>Description</span>
                <textarea className="input input--sm" rows={2} placeholder="Optional description"
                  value={programForm.description}
                  onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })} />
              </label>
              <div className="create-resource__submit">
                <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Add Program'}</button>
              </div>
            </form>

            <div className="program-list">
              {programs.length === 0 && <p>No programs yet.</p>}
              {programs.map((p) => (
                <div key={p.id} className={`program-item${p.id === selectedId ? ' program-item--active' : ''}${isActive(p) ? '' : ' sd-archived'}`}>
                  {editProgramId === p.id ? (
                    <div className="program-item__edit">
                      <label className="field">
                        <span>Course</span>
                        <input className="input input--sm" value={editProgram.code}
                          onChange={(e) => setEditProgram({ ...editProgram, code: e.target.value })} />
                      </label>
                      <textarea className="input input--sm" rows={2} value={editProgram.description}
                        onChange={(e) => setEditProgram({ ...editProgram, description: e.target.value })} />
                      <div className="program-item__actions">
                        <button className="btn btn--primary btn--sm" onClick={saveEditProgram} disabled={busy}>Save</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditProgramId(null)} disabled={busy}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button className="program-item__select" onClick={() => setSelectedId(p.id)} disabled={busy}>
                        <span className="program-item__code">Course</span>
                        <span className="program-item__name">{p.name || p.code}</span>
                        {!isActive(p) && <span className="sd-status-badge sd-status-badge--archived">archived</span>}
                      </button>
                      <div className="program-item__actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => startEditProgram(p)} disabled={busy}>Edit</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => toggleProgramStatus(p)} disabled={busy}>
                          {isActive(p) ? 'Archive' : 'Restore'}
                        </button>
                        {!isActive(p) && (
                          <button className="btn btn--danger btn--sm" onClick={() => handleDeleteProgram(p.id)} disabled={busy}>Delete</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

        </div>
      )}
    </div>
  )
}
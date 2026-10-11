// Admin Program Outcomes: categorized read-only table with add form.
// Form inputs: CMO dropdown, Number, Description.
// Table groups outcomes by CMO category with numbered rows.

import { useEffect, useState } from 'react'
import Icon from '../../components/icons'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  fetchChedMemoOrders,
} from '../../services/database'
import type { ProgramOutcomeStandalone, ChedMemoOrder } from '../../services/database'

export default function ProgramOutcomesAdmin() {
  const [items, setItems] = useState<ProgramOutcomeStandalone[]>([])
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  // Form state
  const [cmoId, setCmoId] = useState('')
  const [number, setNumber] = useState('')
  const [description, setDescription] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [pos, c] = await Promise.all([
        fetchProgramOutcomesStandalone(),
        fetchChedMemoOrders(),
      ])
      setItems(pos)
      setCmos(c.filter((x) => x.status === 'active'))
    } catch (e) {
      setError('Unable to load: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!cmoId || !number.trim() || !description.trim()) {
      setError('CMO, Number, and Description are required.')
      return
    }
    setBusy(true)
    try {
      const code = `PO-${number.trim()}`
      await createProgramOutcomeStandalone({
        code,
        title: description.trim(),
        description: description.trim(),
        cmo_id: cmoId,
      })
      setSuccess(`Program Outcome ${code} added.`)
      setCmoId('')
      setNumber('')
      setDescription('')
      await load()
    } catch (e) {
      setError('Failed to add: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  // Group items by CMO
  const cmoMap = new Map<string, ProgramOutcomeStandalone[]>()
  for (const item of items) {
    const key = item.cmo_id || 'uncategorized'
    if (!cmoMap.has(key)) cmoMap.set(key, [])
    cmoMap.get(key)!.push(item)
  }

  // Sort each group by numeric PO order
  const sortPo = (a: ProgramOutcomeStandalone, b: ProgramOutcomeStandalone) => {
    const n = (s: string) => {
      const m = s.match(/PO\D*(\d+)/i)
      return m ? parseInt(m[1], 10) : 9999
    }
    return n(a.code || '') - n(b.code || '')
  }

  const cmoLabel = (id: string) => {
    const cmo = cmos.find((c) => c.id === id)
    return cmo ? `${cmo.title} (${cmo.code})` : '—'
  }

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">PO</div>
          <div className="program-hero__titles">
            <h2>Program Outcomes</h2>
            <p>Add and browse program outcomes by CMO category.</p>
          </div>
        </div>
      </div>

      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {success && <p className="msg msg--success" role="status">{success}</p>}

      {/* Add form */}
      <form className="panel create-resource" onSubmit={handleSubmit} style={{ borderTop: '3px solid #16a34a' }}>
        <h3>Add Program Outcome</h3>
        <div className="create-resource__row create-resource__row--2col">
          <label className="field">
            <span>CMO Alignment</span>
            <select className="input" value={cmoId} onChange={(e) => setCmoId(e.target.value)} required>
              <option value="">Select CMO...</option>
              {cmos.map((c) => (
                <option key={c.id} value={c.id}>{c.title} ({c.code})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Number</span>
            <input
              className="input"
              type="text"
              placeholder="e.g. 1"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea
            className="input"
            rows={3}
            placeholder="Enter program outcome description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>
        <div className="create-resource__submit">
          <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
            {busy ? 'Saving...' : (<><Icon name="plus" size={13} /> Add Program Outcome</>)}
          </button>
        </div>
      </form>

      {/* Categorized table */}
      {loading ? (
        <p>Loading program outcomes...</p>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.from(cmoMap.entries()).map(([cmoIdKey, groupItems]) => (
            <div key={cmoIdKey} className="panel table-wrap">
              <h3 style={{ marginBottom: 8 }}>
                {cmoIdKey === 'uncategorized' ? 'Uncategorized' : cmoLabel(cmoIdKey)}
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[...groupItems].sort(sortPo).map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td>{item.description || item.title || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

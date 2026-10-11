// Admin Program Outcomes: table with NUMBER, Description, and alignments.
// Admin can add/edit CMO alignment inline. PEO and SG are read-only display.

import { useEffect, useState } from 'react'
import Icon from '../../components/icons'
import {
  fetchProgramOutcomesStandalone,
  updateProgramOutcomeStandalone,
  fetchChedMemoOrders,
  fetchProgramEducationalObjectives,
  fetchStrategicGoals,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'

const FIXED_OPTIONS = [
  'Common to all programs in all types of schools',
  'Bachelor of Science in Information Technology Program Outcomes (CMO 25 s. 2015)',
  'SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR (CMO 25 s. 2015)',
]

const toSuggestion = (i: { code: string; title: string | null }) => ({
  value: i.code,
  label: `${i.code} - ${i.title ?? ''}`.trim(),
})

const toSgSuggestion = (i: { code: string; description: string | null }) => ({
  value: i.code,
  label: `${i.code.replace(/^SG-/i, 'Goal ')}: ${i.description ?? ''}`.trim(),
})

export default function ProgramOutcomesAdmin() {
  const [items, setItems] = useState<ProgramOutcomeStandalone[]>([])
  const [cmoOptions, setCmoOptions] = useState<{ value: string; cmo_id: string | null }[]>([])
  const [peoSuggestions, setPeoSuggestions] = useState<{ value: string; label: string }[]>([])
  const [sgSuggestions, setSgSuggestions] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCmo, setEditCmo] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [pos, peos, sgs] = await Promise.all([
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchStrategicGoals(),
      ])
      const referencedCmos = new Set(pos.map((p) => p.cmo_id).filter(Boolean) as string[])
      const cmos = (await fetchChedMemoOrders()).filter(
        (c) => c.status === 'active' || referencedCmos.has(c.id),
      )
      const fixedOptions = FIXED_OPTIONS.map((v) => ({ value: v, cmo_id: null }))
      const cmoOpts = cmos.map((c) => ({
        value: `${c.title} (${c.code})`,
        cmo_id: c.id,
      }))

      setItems(pos)
      setCmoOptions([...fixedOptions, ...cmoOpts])
      setPeoSuggestions(peos.filter((p) => p.status === 'active').map(toSuggestion))
      setSgSuggestions(sgs.filter((s) => s.status === 'active').map(toSgSuggestion))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alignment data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const cmoById = new Map(cmoOptions.map((o) => [o.cmo_id, o.value]))
  const peoByCode = new Map(peoSuggestions.map((p) => [p.value.toLowerCase(), p.label]))
  const sgByCode = new Map(sgSuggestions.map((s) => [s.value.toLowerCase(), s.label]))

  const alignLabel = (item: ProgramOutcomeStandalone, field: 'peo_text' | 'sg_text' | 'cmo_id') => {
    if (field === 'cmo_id') {
      const id = item.cmo_id
      return id ? (cmoById.get(id) || '—') : '—'
    }
    const val = (item[field] || '').trim()
    if (!val) return '—'
    const codes = val.split(',').map((s) => s.trim()).filter(Boolean)
    const map = field === 'peo_text' ? peoByCode : sgByCode
    const labels = codes.map((c) => map.get(c.toLowerCase()) || c)
    return labels.join(', ')
  }

  const startEditCmo = (item: ProgramOutcomeStandalone) => {
    setEditingId(item.id)
    setEditCmo(item.cmo_id || '')
  }

  const saveCmo = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      await updateProgramOutcomeStandalone(id, { cmo_id: editCmo || null })
      setEditingId(null)
      await load()
    } catch (e) {
      setError('Failed to save: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="msg msg--error">{error}</p>
  if (loading) return <p>Loading program outcomes...</p>

  const sorted = [...items].sort((a, b) => {
    const n = (s: string) => {
      const m = s.match(/PO\D*(\d+)/i)
      return m ? parseInt(m[1], 10) : 9999
    }
    const na = n(a.code || '')
    const nb = n(b.code || '')
    if (na !== nb) return na - nb
    return (a.code || '').localeCompare(b.code || '')
  })

  return (
    <div className="programs-page curriculum-view">
      <div className="program-hero">
        <div className="program-hero__left">
          <div className="program-hero__icon">PO</div>
          <div className="program-hero__titles">
            <h2>Program Outcomes</h2>
            <p>Institutional program outcomes with PEO, Strategic Goal, and CMO alignment.</p>
          </div>
        </div>
      </div>

      <div className="panel table-wrap" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width:50 }}>#</th>
              <th>Description</th>
              <th>Program Educational Objectives Alignment</th>
              <th>Strategic Goals Alignment</th>
              <th>CMO Alignment</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td>{item.description || item.title || '—'}</td>
                <td>{alignLabel(item, 'peo_text')}</td>
                <td>{alignLabel(item, 'sg_text')}</td>
                <td>
                  {editingId === item.id ? (
                    <select
                      className="input input--sm"
                      value={editCmo}
                      onChange={(e) => setEditCmo(e.target.value)}
                      disabled={saving}
                    >
                      <option value="">—</option>
                      {cmoOptions.map((o) => (
                        <option key={o.value} value={o.cmo_id || ''}>{o.value}</option>
                      ))}
                    </select>
                  ) : (
                    alignLabel(item, 'cmo_id')
                  )}
                </td>
                <td>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn--primary btn--sm" onClick={() => saveCmo(item.id)} disabled={saving} title="Save">
                        <Icon name="check" size={13} />
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)} disabled={saving} title="Cancel">
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn--ghost btn--sm" onClick={() => startEditCmo(item)} title="Edit CMO">
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Admin Program Outcomes: read-only table with NUMBER, Description, and alignments.
// No Code column, no create/edit form — just a clean categorized list.

import { useEffect, useState } from 'react'
import {
  fetchProgramOutcomesStandalone,
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
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

        if (!cancelled) {
          setItems(pos)
          setCmoOptions([...fixedOptions, ...cmoOpts])
          setPeoSuggestions(peos.filter((p) => p.status === 'active').map(toSuggestion))
          setSgSuggestions(sgs.filter((s) => s.status === 'active').map(toSgSuggestion))
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load alignment data.')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="msg msg--error">{error}</p>
  if (loading) return <p>Loading program outcomes...</p>

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

  // Sort by numeric PO order
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
              <th style={{ width: 50 }}>#</th>
              <th>Description</th>
              <th>Program Educational Objectives Alignment</th>
              <th>Strategic Goals Alignment</th>
              <th>CMO Alignment</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td>{item.description || item.title || '—'}</td>
                <td>{alignLabel(item, 'peo_text')}</td>
                <td>{alignLabel(item, 'sg_text')}</td>
                <td>{alignLabel(item, 'cmo_id')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

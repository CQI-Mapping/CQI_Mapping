import { useEffect, useState } from 'react'
import EntityCrudPage, { type AlignmentOption, type AlignmentField } from './curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'

const FIXED_OPTIONS = [
  'Common to all programs in all types of schools',
  'Bachelor of Science in Computer Science Program Outcomes',
  'College defined program outcome',
]

export default function ProgramOutcomes() {
  const [cmoOptions, setCmoOptions] = useState<AlignmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pos = await fetchProgramOutcomesStandalone()
        const referencedCmos = new Set(pos.map((p) => p.cmo_id).filter(Boolean) as string[])
        const cmos = (await fetchChedMemoOrders()).filter(
          (c) => c.status === 'active' || referencedCmos.has(c.id),
        )
        const fixedOptions: AlignmentOption[] = FIXED_OPTIONS.map((v) => ({ value: v, cmo_id: null }))
        const cmoOpts: AlignmentOption[] = cmos.map((c) => ({
          value: `${c.title} (${c.code})`,
          cmo_id: c.id,
        }))

        if (!cancelled) {
          setCmoOptions([...fixedOptions, ...cmoOpts])
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

  const alignments: AlignmentField[] = [
    { label: 'Program Educational Objectives Alignment', relationField: 'peo_text', options: [], type: 'text', placeholder: 'Enter PEO' },
    { label: 'Strategic Goals', relationField: 'sg_text', options: [], type: 'text', placeholder: 'Enter Strategic Goals' },
    { label: 'CMO Alignment', relationField: 'cmo_id', textField: 'description', options: cmoOptions },
  ]

  return (
    <EntityCrudPage<ProgramOutcomeStandalone>
      title="Program Outcome"
      load={fetchProgramOutcomesStandalone}
      create={createProgramOutcomeStandalone}
      update={updateProgramOutcomeStandalone}
      remove={deleteProgramOutcomeStandalone}
      scope="Program Outcome"
      createAction="program_outcome.created"
      updateAction="program_outcome.updated"
      deleteAction="program_outcome.deleted"
      codeLabel="Code"
      codePlaceholder="e.g. PO-1"
      codeWidth="110px"
      titleLabel="Description"
      alignments={alignments.slice(0, 2)}
      tableAlignments={[alignments[2], alignments[0], alignments[1]]}
      inlineForm
      stackedAlignments={[alignments[2]]}
      sort={(a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10)
        return (n((a as { code?: string }).code || '') || 0) - (n((b as { code?: string }).code || '') || 0)
      }}
    />
  )
}
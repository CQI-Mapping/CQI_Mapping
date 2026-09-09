import { useEffect, useState } from 'react'
import EntityCrudPage, { type AlignmentOption, type AlignmentField } from './curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
  fetchProgramEducationalObjectives,
  fetchStrategicGoals,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'

const FIXED_OPTIONS = [
  'Common to all programs in all types of schools',
  'Bachelor of Science in Computer Science Program Outcomes',
  'College defined program outcome',
]

export default function ProgramOutcomes() {
  const [cmoOptions, setCmoOptions] = useState<AlignmentOption[]>([])
  const [peoOptions, setPeoOptions] = useState<AlignmentOption[]>([])
  const [sgOptions, setSgOptions] = useState<AlignmentOption[]>([])
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

        const referencedPeos = new Set(pos.map((p) => p.peo_id).filter(Boolean) as string[])
        const peos = (await fetchProgramEducationalObjectives()).filter(
          (p) => p.status === 'active' || referencedPeos.has(p.id),
        )
        const peoOpts: AlignmentOption[] = peos.map((p) => ({
          value: `${p.code} \u2014 ${p.title}`,
          relationId: p.id,
        }))

        const referencedSgs = new Set(pos.map((p) => (p as { sg_id?: string | null }).sg_id).filter(Boolean) as string[])
        const sgs = (await fetchStrategicGoals()).filter(
          (s) => s.status === 'active' || referencedSgs.has(s.id),
        )
        const sgOpts: AlignmentOption[] = sgs.map((s) => ({
          value: `${s.code} \u2014 ${s.title || s.description || ''}`.replace(/ \u2014 $/, ''),
          relationId: s.id,
        }))

        if (!cancelled) {
          setCmoOptions([...fixedOptions, ...cmoOpts])
          setPeoOptions(peoOpts)
          setSgOptions(sgOpts)
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
    { label: 'Program Educational Objectives', relationField: 'peo_id', options: peoOptions },
    { label: 'Strategic Goals', relationField: 'sg_id', options: sgOptions },
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
      alignments={alignments}
      tableAlignments={[alignments[2], alignments[0], alignments[1]]}
      formAlignments={[alignments[0], alignments[1]]}
      sort={(a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10)
        return (n((a as { code?: string }).code || '') || 0) - (n((b as { code?: string }).code || '') || 0)
      }}
    />
  )
}
import { useEffect, useState } from 'react'
import EntityCrudPage, { type AlignmentOption } from './curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
  fetchProgramEducationalObjectives,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'

const FIXED_OPTIONS = [
  'Common to all programs in all types of schools',
  'Bachelor of Science in Computer Science Program Outcomes',
  'College defined program outcome',
]

export default function ProgramOutcomes() {
  const [options, setOptions] = useState<AlignmentOption[] | null>(null)
  const [peoOptions, setPeoOptions] = useState<AlignmentOption[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pos = await fetchProgramOutcomesStandalone()
        const referenced = new Set(pos.map((p) => p.cmo_id).filter(Boolean) as string[])
        const cmos = (await fetchChedMemoOrders()).filter(
          (c) => c.status === 'active' || referenced.has(c.id),
        )

        const fixedOptions: AlignmentOption[] = FIXED_OPTIONS.map((v) => ({ value: v, cmo_id: null }))
        const cmoOptions: AlignmentOption[] = cmos.map((c) => ({
          value: `${c.title} (${c.code})`,
          cmo_id: c.id,
        }))

        const referencedPeos = new Set(pos.map((p) => p.peo_id).filter(Boolean) as string[])
        const peos = (await fetchProgramEducationalObjectives()).filter(
          (p) => p.status === 'active' || referencedPeos.has(p.id),
        )
        const peosOptions: AlignmentOption[] = peos.map((p) => ({
          value: `${p.code} \u2014 ${p.title}`,
          relationId: p.id,
        }))

        if (!cancelled) {
          setOptions([...fixedOptions, ...cmoOptions])
          setPeoOptions(peosOptions)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load CMO data.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="msg msg--error">{error}</p>
  if (!options) return <p>Loading program outcomes...</p>

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
      titleLabel="Description"
      descriptionLabel="CMO Alignment"
      descriptionOptions={options}
      relationField="cmo_id"
      descriptionLabel2="Program Educational Objectives"
      descriptionOptions2={peoOptions}
      relationField2="peo_id"
      sort={(a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10)
        return (n((a as { code?: string }).code || '') || 0) - (n((b as { code?: string }).code || '') || 0)
      }}
    />
  )
}
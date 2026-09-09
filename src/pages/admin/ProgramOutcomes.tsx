import { useEffect, useState } from 'react'
import EntityCrudPage, { type AlignmentOption } from './curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
  createChedMemoOrder,
} from '../../services/database'
import type { ChedMemoOrder, ProgramOutcomeStandalone } from '../../services/database'
import { SEED_PROGRAM_OUTCOMES, SEED_CMOS } from '../../data/vcqiSyllabus.js'

const CATEGORY_ALIGNMENTS = [
  'Common to all programs in all types of schools',
  'Common to the discipline',
  'Specific to a sub-discipline and a major (CMO 25 s. 2015)',
  'Common to horizontal types (CMO 46 s. 2012)',
  'College-defined program outcome',
]

const CMO_CODE_RE = /CMO\s+\d+\s*s\.\s*\d{4}/i

export default function ProgramOutcomes() {
  const [options, setOptions] = useState<AlignmentOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Make sure the referenced CHED Memorandum Orders exist (they are also
        // seeded on the CHED Memo page, but that page may never have been opened).
        let cmos = await fetchChedMemoOrders()
        const missing = SEED_CMOS.filter(
          (s) => !cmos.some((c) => c.code.toLowerCase() === s.code.toLowerCase()),
        )
        for (const s of missing) {
          await createChedMemoOrder({ code: s.code, title: s.title, description: s.description ?? null, status: 'active' })
        }
        if (missing.length > 0) cmos = await fetchChedMemoOrders()
        const cmoByCode = new Map<string, ChedMemoOrder>(cmos.map((c) => [c.code.toUpperCase(), c]))

        // Backfill cmo_id for outcomes whose alignment references an existing CMO.
        const pos = await fetchProgramOutcomesStandalone()
        for (const p of pos) {
          if (p.cmo_id) continue
          const ref = (p.description || '').match(CMO_CODE_RE)
          const cmo = ref ? cmoByCode.get(ref[0].toUpperCase()) : undefined
          if (cmo) await updateProgramOutcomeStandalone(p.id, { cmo_id: cmo.id })
        }

        const categoryOptions: AlignmentOption[] = CATEGORY_ALIGNMENTS.map((v) => {
          const ref = v.match(CMO_CODE_RE)
          const cmo = ref ? cmoByCode.get(ref[0].toUpperCase()) : undefined
          return { value: v, cmo_id: cmo ? cmo.id : null }
        })
        const cmoOptions: AlignmentOption[] = cmos.map((c) => ({
          value: `${c.code} — ${c.title}`,
          cmo_id: c.id,
        }))
        if (!cancelled) setOptions([...categoryOptions, ...cmoOptions])
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
      seeds={SEED_PROGRAM_OUTCOMES}
      descriptionLabel="CMO Alignment"
      descriptionOptions={options}
      relationField="cmo_id"
      sort={(a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10)
        return (n((a as { code?: string }).code || '') || 0) - (n((b as { code?: string }).code || '') || 0)
      }}
    />
  )
}
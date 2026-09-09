import { useEffect, useState } from 'react'
import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
} from '../../services/database'
import type { ProgramOutcomeStandalone, ChedMemoOrder } from '../../services/database'
import { SEED_PROGRAM_OUTCOMES } from '../../data/vcqiSyllabus.js'

const CMO_ALIGNMENTS = [
  'Common to all programs in all types of schools',
  'Common to the discipline',
  'Specific to a sub-discipline and a major (CMO 25 s. 2015)',
  'Common to horizontal types (CMO 46 s. 2012)',
  'College-defined program outcome',
]

const CMO_CODE_RE = /CMO\s+\d+\s*s\.\s*\d{4}/i

export default function ProgramOutcomes() {
  const [cmoById, setCmoById] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchChedMemoOrders()
      .then((cmos: ChedMemoOrder[]) => {
        const map: Record<string, string> = {}
        for (const c of cmos) map[c.code.toUpperCase()] = c.id
        setCmoById(map)
      })
      .catch(() => setCmoById({}))
  }, [])

  const resolveRelation = (description: string): string | null => {
    const m = description.match(CMO_CODE_RE)
    if (!m) return null
    return cmoById[m[0].toUpperCase()] ?? null
  }

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
      descriptionOptions={CMO_ALIGNMENTS}
      relationField="cmo_id"
      resolveRelation={resolveRelation}
      sort={(a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10)
        return (n((a as { code?: string }).code || '') || 0) - (n((b as { code?: string }).code || '') || 0)
      }}
    />
  )
}
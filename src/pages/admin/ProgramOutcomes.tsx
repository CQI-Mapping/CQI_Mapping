import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'
import { SEED_PROGRAM_OUTCOMES } from '../../data/vcqiSyllabus.js'

const CMO_ALIGNMENTS = [
  'Common to all programs in all types of schools',
  'Common to the discipline',
  'Specific to a sub-discipline and a major (CMO 25 s. 2015)',
  'Common to horizontal types (CMO 46 s. 2012)',
  'College-defined program outcome',
]

export default function ProgramOutcomes() {
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
      sort={(a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10)
        return (n((a as { code?: string }).code || '') || 0) - (n((b as { code?: string }).code || '') || 0)
      }}
    />
  )
}

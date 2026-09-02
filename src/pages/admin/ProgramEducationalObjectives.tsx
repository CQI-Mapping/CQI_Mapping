import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchProgramEducationalObjectives,
  createProgramEducationalObjective,
  updateProgramEducationalObjective,
  deleteProgramEducationalObjective,
} from '../../services/database'
import type { ProgramEducationalObjective } from '../../services/database'
import { SEED_PEOS } from '../../data/vcqiSyllabus.js'

export default function ProgramEducationalObjectives() {
  return (
    <EntityCrudPage<ProgramEducationalObjective>
      title="Program Educational Objective"
      load={fetchProgramEducationalObjectives}
      create={createProgramEducationalObjective}
      update={updateProgramEducationalObjective}
      remove={deleteProgramEducationalObjective}
      scope="Program Educational Objective"
      createAction="peo.created"
      updateAction="peo.updated"
      deleteAction="peo.deleted"
      codeLabel="Code"
      codePlaceholder="e.g. PEO-1"
      seeds={SEED_PEOS}
    />
  )
}

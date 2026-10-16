import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchProgramEducationalObjectives,
  createProgramEducationalObjective,
  updateProgramEducationalObjective,
  deleteProgramEducationalObjective,
} from '../../services/database'
import type { ProgramEducationalObjective } from '../../services/database'

interface ProgramEducationalObjectivesProps {
  allowDelete?: boolean
}

export default function ProgramEducationalObjectives({ allowDelete = true }: ProgramEducationalObjectivesProps) {
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
      allowDelete={allowDelete}
    />
  )
}

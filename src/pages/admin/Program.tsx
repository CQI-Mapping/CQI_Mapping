import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
} from '../../services/database'
import type { Program } from '../../services/database'

export default function Program() {
  return (
    <EntityCrudPage<Program>
      title="Program"
      load={fetchPrograms}
      create={createProgram}
      update={updateProgram}
      remove={deleteProgram}
      scope="Program"
      createAction="program.created"
      updateAction="program.updated"
      deleteAction="program.deleted"
      codeLabel="Course"
      codePlaceholder="e.g. IT21"
      titleField="name"
      titleLabel="Name"
    />
  )
}
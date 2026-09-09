import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
} from '../../services/database'
import type { Program } from '../../services/database'

export default function Program() {
  const createWithName = async (payload: Partial<Program>) =>
    createProgram({ ...payload, name: payload.code ?? '' })
  const updateWithName = async (id: string, payload: Partial<Program>) =>
    updateProgram(id, { ...payload, name: payload.code ?? '' })

  return (
    <EntityCrudPage<Program>
      title="Program"
      load={fetchPrograms}
      create={createWithName}
      update={updateWithName}
      remove={deleteProgram}
      scope="Program"
      createAction="program.created"
      updateAction="program.updated"
      deleteAction="program.deleted"
      codeLabel="Program"
      codePlaceholder="e.g. BSCS"
      showTitle={false}
    />
  )
}
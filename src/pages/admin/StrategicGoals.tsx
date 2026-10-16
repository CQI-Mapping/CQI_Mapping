import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchStrategicGoals,
  createStrategicGoal,
  updateStrategicGoal,
  deleteStrategicGoal,
} from '../../services/database'
import type { StrategicGoal } from '../../services/database'

interface StrategicGoalsProps {
  allowDelete?: boolean
}

export default function StrategicGoals({ allowDelete = true }: StrategicGoalsProps) {
  return (
    <EntityCrudPage<StrategicGoal>
      title="Strategic Goal"
      load={fetchStrategicGoals}
      create={createStrategicGoal}
      update={updateStrategicGoal}
      remove={deleteStrategicGoal}
      scope="Strategic Goal"
      createAction="strategic_goal.created"
      updateAction="strategic_goal.updated"
      deleteAction="strategic_goal.deleted"
      codeLabel="Goal"
      codePlaceholder="e.g. Goal 1"
      showTitle={false}
      formatCode={(c) => c.replace(/^SG-/i, 'Goal ')}
      allowDelete={allowDelete}
    />
  )
}

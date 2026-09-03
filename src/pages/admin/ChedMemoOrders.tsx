import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchChedMemoOrders,
  createChedMemoOrder,
  updateChedMemoOrder,
  deleteChedMemoOrder,
} from '../../services/database'
import type { ChedMemoOrder } from '../../services/database'
import { SEED_CMOS } from '../../data/vcqiSyllabus.js'

export default function ChedMemoOrders() {
  return (
    <EntityCrudPage<ChedMemoOrder>
      title="CHED Memorandum Order"
      load={fetchChedMemoOrders}
      create={createChedMemoOrder}
      update={updateChedMemoOrder}
      remove={deleteChedMemoOrder}
      scope="CHED Memorandum Order"
      createAction="ched_memo_order.created"
      updateAction="ched_memo_order.updated"
      deleteAction="ched_memo_order.deleted"
      codeLabel="Code"
      codePlaceholder="e.g. CMO 1 s. 2024"
      seeds={SEED_CMOS}
    />
  )
}

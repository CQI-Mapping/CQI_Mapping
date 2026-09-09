import { useEffect, useState } from 'react'
import EntityCrudPage from './curriculum/EntityCrudPage.js'
import {
  fetchChedMemoOrders,
  createChedMemoOrder,
  updateChedMemoOrder,
  deleteChedMemoOrder,
  fetchProgramOutcomesStandalone,
} from '../../services/database'
import type { ChedMemoOrder } from '../../services/database'

export default function ChedMemoOrders() {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchProgramOutcomesStandalone()
      .then((pos) => {
        const map: Record<string, number> = {}
        for (const p of pos) {
          if (!p.cmo_id) continue
          map[p.cmo_id] = (map[p.cmo_id] || 0) + 1
        }
        setCounts(map)
      })
      .catch(() => {})
  }, [])

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
      showDescription={false}
      titleMultiline
      counts={counts}
      countLabel="Linked POs"
    />
  )
}
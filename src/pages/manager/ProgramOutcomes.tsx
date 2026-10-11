import { useEffect, useState } from 'react'
import EntityCrudPage, { type AlignmentField } from '../admin/curriculum/EntityCrudPage.js'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchProgramEducationalObjectives,
  fetchStrategicGoals,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'
import type { SuggestionOption } from '../../components/SuggestionInput'

const toSuggestion = (i: { code: string; title: string | null }): SuggestionOption => ({
  value: i.code,
  label: `${i.code} - ${i.title ?? ''}`.trim(),
})

const toSgSuggestion = (i: { code: string; description: string | null }): SuggestionOption => ({
  value: i.code,
  label: `${i.code.replace(/^SG-/i, 'Goal ')}: ${i.description ?? ''}`.trim(),
})

export default function ProgramOutcomes() {
  const [peoSuggestions, setPeoSuggestions] = useState<SuggestionOption[]>([])
  const [sgSuggestions, setSgSuggestions] = useState<SuggestionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [peos, sgs] = await Promise.all([
          fetchProgramEducationalObjectives(),
          fetchStrategicGoals(),
        ])

        if (!cancelled) {
          setPeoSuggestions(peos.filter((p) => p.status === 'active').map(toSuggestion))
          setSgSuggestions(sgs.filter((s) => s.status === 'active').map(toSgSuggestion))
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load alignment data.')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="msg msg--error">{error}</p>
  if (loading) return <p>Loading program outcomes...</p>

  const alignments: AlignmentField[] = [
    { label: 'Program Educational Objectives Alignment', relationField: 'peo_text', options: [], type: 'suggest', suggestionOptions: peoSuggestions, placeholder: 'Type PEOs' },
    { label: 'Strategic Goals Alignment', relationField: 'sg_text', options: [], type: 'suggest', suggestionOptions: sgSuggestions, placeholder: 'Type Strategic Goals' },
  ]

  // Manager create: stamp source='manager' so View can separate admin vs manager inputs.
  const managerCreate = async (payload: Partial<ProgramOutcomeStandalone>) => {
    return createProgramOutcomeStandalone({ ...payload, source: 'manager' })
  }

  // Manager load: only fetch source='manager' outcomes.
  const managerLoad = async () => fetchProgramOutcomesStandalone('manager')

  return (
    <EntityCrudPage<ProgramOutcomeStandalone>
      title="Program Outcome"
      load={managerLoad}
      create={managerCreate}
      update={updateProgramOutcomeStandalone}
      remove={deleteProgramOutcomeStandalone}
      scope="Program Outcome"
      createAction="program_outcome.created"
      updateAction="program_outcome.updated"
      deleteAction="program_outcome.deleted"
      codeLabel="Code"
      codePlaceholder="e.g. PO-1"
      codeWidth="110px"
      titleLabel="Description"
      alignments={alignments}
      tableAlignments={alignments}
      inlineForm
      sort={(a, b) => {
        // Numeric PO order: PO-1 … PO-27 (fixes lexicographic PO-1, PO-10, PO-2)
        const n = (s: string) => {
          const m = s.match(/PO\D*(\d+)/i)
          return m ? parseInt(m[1], 10) : 9999
        }
        const ca = String((a as { code?: string }).code || '')
        const cb = String((b as { code?: string }).code || '')
        const na = n(ca); const nb = n(cb)
        if (na !== nb) return na - nb
        return ca.localeCompare(cb)
      }}
    />
  )
}
import { useEffect, useState } from 'react'
import EntityCrudPage, { type AlignmentOption, type AlignmentField } from '../admin/curriculum/EntityCrudPage.js'
import { outcomeCodeKey, buildGroups, type PoGroup } from '../../utils/report'
import {
  fetchProgramOutcomesStandalone,
  createProgramOutcomeStandalone,
  updateProgramOutcomeStandalone,
  deleteProgramOutcomeStandalone,
  fetchChedMemoOrders,
  fetchProgramEducationalObjectives,
  fetchStrategicGoals,
} from '../../services/database'
import type { ProgramOutcomeStandalone } from '../../services/database'
import type { SuggestionOption } from '../../components/SuggestionInput'

const FIXED_OPTIONS = [
  'COMMON TO ALL PROGRAMS IN ALL TYPES OF SCHOOLS',
  'BACHELOR OF SCIENCE IN COMPUTER SCIENCE PROGRAM OUTCOMES ',
  'COLLEGE DEFINED PROGRAM OUTCOME ',
]

const toSuggestion = (i: { code: string; title: string | null }): SuggestionOption => ({
  value: i.code,
  label: `${i.code} - ${i.title ?? ''}`.trim(),
})

const toSgSuggestion = (i: { code: string; description: string | null }): SuggestionOption => ({
  value: i.code,
  label: `${i.code.replace(/^SG-/i, 'Goal ')}: ${i.description ?? ''}`.trim(),
})

export default function ProgramOutcomes() {
  const [cmoOptions, setCmoOptions] = useState<AlignmentOption[]>([])
  const [peoSuggestions, setPeoSuggestions] = useState<SuggestionOption[]>([])
  const [sgSuggestions, setSgSuggestions] = useState<SuggestionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The reader beside the add form: the manager's own active program
  // outcomes — the same rows the page's list shows — grouped per CMO
  // category and numbered continuously the way the syllabus document
  // prints it.
  const [readerGroups, setReaderGroups] = useState<PoGroup[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [pos, peos, sgs, cmosAll, allPos] = await Promise.all([
          fetchProgramOutcomesStandalone('manager'),
          fetchProgramEducationalObjectives(),
          fetchStrategicGoals(),
          fetchChedMemoOrders(),
          // The read side: the manager's own rows — the list below the form
          // is manager-authored only, and the reader mirrors it.
          fetchProgramOutcomesStandalone(),
        ])
        const referencedCmos = new Set(pos.map((p) => p.cmo_id).filter(Boolean) as string[])
        const cmos = cmosAll.filter(
          (c) => c.status === 'active' || referencedCmos.has(c.id),
        )
        const fixedOptions: AlignmentOption[] = FIXED_OPTIONS.map((v) => ({ value: v, cmo_id: null }))
        const cmoOpts: AlignmentOption[] = cmos.map((c) => ({
          value: `${c.title} (${c.code})`,
          cmo_id: c.id,
        }))

        if (!cancelled) {
          // Reader build: the manager's own active rows only, code order
          // (PO-1… before SD-…, numeric within each family), grouped per CMO
          // category — manager rows carry it in the description column.
          const activeManager = allPos.filter(
            (p) => p.source === 'manager' && (!p.status || p.status === 'active'),
          )
          activeManager.sort((a, b) => outcomeCodeKey(a.code).localeCompare(outcomeCodeKey(b.code)))
          setReaderGroups(buildGroups(activeManager, cmosAll))
          setCmoOptions([...fixedOptions, ...cmoOpts])
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

  // The reader leg beside the New Program Outcome form (the CLO page's pair
  // layout): the manager's own active POs as one numbered run per CMO
  // category — no panel title, the category headings speak for themselves,
  // same as the CLO form's reference.
  const readerRef = (
    <aside className="panel clo-layout__ref" aria-label="Program Outcomes reference">
      <div className="clo-layout__ref-scroll">
        {readerGroups.length === 0 ? (
          <p className="clo-layout__ref-empty">No Program Outcomes yet — the first one added opens the run here.</p>
        ) : (
          readerGroups.map((group, gi) => {
            const rowBase = readerGroups.slice(0, gi).reduce((n, prior) => n + prior.items.length, 0)
            return (
              <div key={group.heading} className="clo-layout__ref-group">
                <p className="clo-layout__ref-head">{group.heading}</p>
                {group.items.map((p, i) => (
                  <div key={p.id} className="clo-layout__ref-row">
                    <span className="clo-layout__ref-num">{rowBase + i + 1}.</span>
                    <span>{p.code ? `${p.code} — ` : ''}{(p.title || '').replace(/\.$/, '')}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )

  const alignments: AlignmentField[] = [
    { label: 'CMO Alignment', relationField: 'cmo_id', textField: 'description', options: cmoOptions },
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
      alignments={[alignments[1], alignments[2]]}
      tableAlignments={[alignments[1], alignments[2]]}
      inlineForm
      stackedAlignments={[alignments[0]]}
      formRef={readerRef}
      outcomeCard
      groupOf={(i) => ((i.description || '').trim() || 'UNCATEGORIZED')}
      sort={(a, b) => {
        // Arrange by CMO Alignment group first (matching the admin page's
        // grouping), then by outcome order within each group — PO-1…PO-4
        // and SD-1…SD-13, numeric within each family, so SD-10 never
        // sorts before SD-2.
        const g = (p: ProgramOutcomeStandalone) => (p.description || '').trim().toUpperCase() || '\uffff'
        const ga = g(a); const gb = g(b)
        if (ga !== gb) return ga < gb ? -1 : 1
        return outcomeCodeKey(String((a as { code?: string }).code || '')).localeCompare(outcomeCodeKey(String((b as { code?: string }).code || '')))
      }}
    />
  )
}
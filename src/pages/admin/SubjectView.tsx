// Admin Subject View: two-panel layout — left panel has a Visualize root
// picker plus program + per-root dropdowns; right panel renders a D3.js
// outcome hierarchy graph. A branch can start anywhere in the chain: pick a
// root type from "Select", pick its code, press Visualization.
//
//   Subject (root)
//     ├─ Curriculum → every sibling subject with its own sub-tree
//     ├─ Prerequisite(s) / Corequisite(s) — click to jump to that subject
//     └─ CLO(s)
//        └─ PO(s)  ← clicking any PO / CLO / PEO / goal / CMO re-roots there
//           ├─ PEO
//           ├─ Strategic Goal
//           └─ CHED Memorandum Order
//
//   CLO (root)        CLO → the PO(s) its text names, each as a PO slice
//   PO (root)         PO → PEO / SG / CMO (downstream) + CLO(s) → Subject(s) (upstream)
//   PEO (root)        PEO → aligned PO(s), each as a PO slice
//   SG (root)         Strategic Goal → aligned PO(s), each as a PO slice
//   CMO (root)        Memorandum → anchored PO(s), each as a PO slice
//   Curriculum (root) Curriculum → its subjects → each subject's CLO → PO sub-tree
//   Program (root)    Program → every subject it holds → each subject's sub-tree
//
// A "PO slice" keeps both sides of the story in one branch: the PO's own
// PEO / SG / CMO leaves and its upstream CLOs → subjects. Clicking a PO, CLO,
// PEO, SG or CMO node re-roots the graph at that record; every root type is
// reachable both from the dropdown and by clicking through the web.
//
// The graph only renders after the user presses View. Relationships are built
// from the standalone admn tables (admin_course_learning_outcomes,
// admin_program_outcomes, program_educational_objectives, strategic_goals,
// ched_memorandum_orders, resources) — not clo_po_matrix.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import {
  fetchPrograms,
  fetchCourses,
  fetchResources,
  fetchCourseLearningOutcomesStandalone,
  fetchProgramOutcomesStandalone,
  fetchProgramEducationalObjectives,
  fetchStrategicGoals,
  fetchChedMemoOrders,
  addActivityLog,
} from '../../services/database'
import type {
  Program,
  Course,
  Resource,
  CourseLearningOutcomeStandalone,
  ProgramOutcomeStandalone,
  ProgramEducationalObjective,
  StrategicGoal,
  ChedMemoOrder,
} from '../../services/database'
import { normalizeCode, cloMatchesSubject } from '../../utils/courseCodes'
import { splitReportPos, buildGroups, isManagerCmCategory } from '../../utils/report'
import { reportFileName } from '../../utils/download'
import { downloadSyllabusPdf } from '../../utils/syllabusPdf'
import Icon from '../../components/icons'
import SyllabusReport from '../../components/SyllabusReport'
import OutcomeDetailsCard from '../../components/OutcomeDetailsCard'
import PageBanner from '../../components/PageBanner'
import type { ConnectedGroup, ConnectedItem } from '../../components/OutcomeDetailsCard'

type NodeKind =
  | 'curriculum'
  | 'subject'
  | 'prerequisite'
  | 'corequisite'
  | 'clo'
  | 'po'
  | 'peo'
  | 'sg'
  | 'cmo'

interface GraphNodeData {
  id: string
  code: string
  title: string
  kind: NodeKind
  placeholder: boolean
  courseId?: string
  poId?: string
  peoId?: string
  sgId?: string
  cmoId?: string
  cloId?: string
  curId?: string
  programId?: string
  children: GraphNodeData[]
}

type RootType = 'subject' | 'clo' | 'po' | 'peo' | 'sg' | 'cmo' | 'curriculum' | 'program'

interface NavEntry {
  type: RootType
  id: string
}

const poNumber = (code: string) => {
  const m = code.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 9999
}

const sortPos = <T extends { code: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => {
    const na = poNumber(a.code)
    const nb = poNumber(b.code)
    if (na !== nb) return na - nb
    return String(a.code).localeCompare(String(b.code))
  })

interface OutcomeDatasets {
  resources: Resource[]
  clos: CourseLearningOutcomeStandalone[]
  pos: ProgramOutcomeStandalone[]
  peos: ProgramEducationalObjective[]
  sgs: StrategicGoal[]
  cmos: ChedMemoOrder[]
}

const colorMap: Record<NodeKind, string> = {
  curriculum: '#4d7c0f',
  subject: '#16a34a',
  prerequisite: '#b45309',
  corequisite: '#15803d',
  clo: '#15803d',
  po: '#3f6212',
  peo: '#4d7c0f',
  sg: '#64748b',
  cmo: '#475569',
}

const isActive = <T extends { status?: string }>(x: T) => !x.status || x.status === 'active'

const extractCodes = (text: string, prefix: 'PO' | 'PEO' | 'SG'): string[] => {
  const re = new RegExp(`${prefix}\\s*-?\\s*(\\d+)`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(`${prefix}-${m[1]}`)
  return out
}

// Strategic Goals in DB use code "Goal N" (e.g. "Goal 1") not "SG-N". Accept both
// prefixes and normalize tokens to "Goal N" so they match strategic_goals.code.
const extractSgCodes = (text: string): string[] => {
  const re = /(?:SG|Goal)\s*-?\s*(\d+)/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(`Goal ${m[1]}`)
  return out
}

// Resolve an SG token against the strategic goals list by normalized code first,
// then by numeric fallback (so "Goal 1" ↔ "SG-1" both match "Goal 1" or "SG-1").
const findSgByToken = (sgs: StrategicGoal[], tok: string): StrategicGoal | undefined => {
  const key = normalizeCode(tok)
  return (
    sgs.find((s) => normalizeCode(s.code) === key)
    ?? sgs.find((s) => {
        const n = tok.match(/\d+/)?.[0]
        return n !== undefined && s.code.match(/\d+/)?.[0] === n
      })
  )
}

// Count unique nodes per kind plus unresolved placeholders across the tree.
const countKinds = (root: GraphNodeData): { counts: Record<NodeKind, number>; unresolved: number } => {
  const seen = new Map<NodeKind, Set<string>>()
  let unresolved = 0
  const walk = (n: GraphNodeData) => {
    let set = seen.get(n.kind)
    if (!set) { set = new Set(); seen.set(n.kind, set) }
    set.add(n.id)
    if (n.placeholder) unresolved++
    n.children.forEach(walk)
  }
  walk(root)
  const counts = {} as Record<NodeKind, number>
  for (const [kind, set] of seen) counts[kind] = set.size
  return { counts, unresolved }
}

// Legend dot class for each node kind.
const dotClass = (k: NodeKind) => {
  switch (k) {
    case 'curriculum': return 'subject-view__dot--curriculum'
    case 'subject': return 'subject-view__dot--subject'
    case 'prerequisite': return 'subject-view__dot--prereq'
    case 'corequisite': return 'subject-view__dot--coreq'
    case 'clo': return 'subject-view__dot--clo'
    case 'po': return 'subject-view__dot--po'
    case 'peo': return 'subject-view__dot--peo'
    case 'sg': return 'subject-view__dot--sg'
    case 'cmo': return 'subject-view__dot--cmo'
  }
}

// Legend rows shown above the graph, in tree order.
const legendDefs: Array<{ kind: NodeKind; label: string; tip: string }> = [
  { kind: 'curriculum', label: 'Curriculum', tip: 'Program curriculum the subject belongs to' },
  { kind: 'subject', label: 'Subject', tip: 'The selected subject (double ring)' },
  { kind: 'prerequisite', label: 'Pre-req', tip: 'Prerequisite subject(s) for this subject' },
  { kind: 'corequisite', label: 'Co-req', tip: 'Corequisite subject(s) for this subject' },
  { kind: 'clo', label: 'CLO', tip: 'Course Learning Outcome(s) of this subject' },
  { kind: 'po', label: 'PO', tip: 'Program Outcome(s) the CLOs target' },
  { kind: 'peo', label: 'PEO', tip: 'Program Educational Objective(s)' },
  { kind: 'sg', label: 'SG', tip: 'Strategic Goal(s)' },
  { kind: 'cmo', label: 'CMO', tip: 'CHED Memorandum Order(s)' },
]

// Category order + headings for the connected-details card. Every connected
// node is bucketed by its kind; categories with nothing attached are hidden, so
// one list serves all three roots — a PO/PEO tree simply has no curriculum,
// pre-req or co-req nodes to bucket.
const connectedCategoryDefs: Array<{ kind: ConnectedGroup['kind']; label: string }> = [
  { kind: 'curriculum', label: 'Curriculum' },
  { kind: 'prerequisite', label: 'Prerequisites' },
  { kind: 'corequisite', label: 'Corequisites' },
  { kind: 'clo', label: 'Course Learning Outcomes' },
  { kind: 'po', label: 'Program Outcomes' },
  { kind: 'subject', label: 'Subjects' },
  { kind: 'peo', label: 'Program Educational Objectives' },
  { kind: 'sg', label: 'Strategic Goals' },
  { kind: 'cmo', label: 'CHED Memorandum Orders' },
]

export default function SubjectView() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  // '' means the user has not picked what to visualize from yet, so the select
  // shows its "--- select to Visualize ---" placeholder.
  const [rootType, setRootType] = useState<RootType | ''>('')
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null)
  const [poList, setPoList] = useState<ProgramOutcomeStandalone[]>([])
  const [selectedPeoId, setSelectedPeoId] = useState<string | null>(null)
  const [peoList, setPeoList] = useState<ProgramEducationalObjective[]>([])
  const [selectedSgId, setSelectedSgId] = useState<string | null>(null)
  const [sgList, setSgList] = useState<StrategicGoal[]>([])
  const [selectedCmoId, setSelectedCmoId] = useState<string | null>(null)
  const [cmoList, setCmoList] = useState<ChedMemoOrder[]>([])
  const [selectedCloId, setSelectedCloId] = useState<string | null>(null)
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showGraph, setShowGraph] = useState(false)
  const [spinner, setSpinner] = useState(false)
  const [graphError, setGraphError] = useState('')
  const [datasets, setDatasets] = useState<OutcomeDatasets | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  // Curriculum branches open into every subject in that curriculum plus each
  // one's CLO → PO → PEO/SG/CMO sub-tree — easily hundreds of nodes — so they
  // start closed. Semantics are deliberately inverted from collapsedIds, where
  // absent means open: here a node is closed until it appears in this set.
  const [openCurriculumIds, setOpenCurriculumIds] = useState<Set<string>>(() => new Set())
  const [navStack, setNavStack] = useState<NavEntry[]>([])
  // ── OBE Curriculum Map filters (the curriculum root's default view) ────────
  // The map shows every subject at once — these narrow it: a PGO keeps only
  // that outcome's constellation, a PI (the course learning outcome carrying
  // it) then lights just the subjects that teach it.
  const [mapPoId, setMapPoId] = useState('')
  const [mapCloId, setMapCloId] = useState('')
  // Leaving the map (or switching curriculum) drops both filters with it.
  useEffect(() => {
    setMapPoId('')
    setMapCloId('')
  }, [rootType, selectedCurriculumId])
  // Graph node the connected-details card describes. null = the root itself.
  // Set on every node click so the card answers "what hangs off *that* branch"
  // and not just the root; cleared whenever the root changes.
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dlOpen, setDlOpen] = useState(false)
  const [dlFormat, setDlFormat] = useState<'pdf' | 'docx'>('pdf')
  const [downloading, setDownloading] = useState(false)
  const [dlNotice, setDlNotice] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dlMenuRef = useRef<HTMLDivElement>(null)
  // Snapshot target for the PDF export: the document root inside the rendered
  // Curriculum Report (the same element the Curriculum Report page snapshots).
  const reportRootRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  // Read inside the render effect without appearing in its dependency list. The
  // render effect wipes and rebuilds the whole SVG, so rings created during it
  // need the current focus to light correctly — but putting the focus in the
  // deps would rebuild the simulation on every click.
  const focusedIdRef = useRef<string | null>(null)

  // Reset expand/collapse and branch inspection when the root changes — like
  // branch-visualizer fresh state.
  useEffect(() => {
    setCollapsedIds(new Set())
    setOpenCurriculumIds(new Set())
    setInspectedNodeId(null)
  }, [selectedCourseId, selectedCloId, selectedPoId, selectedPeoId, selectedSgId, selectedCmoId, selectedCurriculumId, selectedProgramId, rootType])

  // Fullscreen map: Esc exits, and the page behind stops scrolling.
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isFullscreen])

  // Every generated graph opens full screen, dashboard-style — the OBE
  // Curriculum Map, a subject tree, a PO web, all alike. Closing the map
  // (switching the picker, clearing a selection) stands the overlay down
  // with it.
  useEffect(() => {
    if (!showGraph) setIsFullscreen(false)
  }, [showGraph])

  // Close the download's format menu on outside click or Escape — the same
  // behaviour the Curriculum Report page's download menu has.
  useEffect(() => {
    if (!dlOpen) return
    const onPointer = (e: MouseEvent) => {
      if (dlMenuRef.current && !dlMenuRef.current.contains(e.target as Node)) setDlOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDlOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [dlOpen])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, c, pos] = await Promise.all([fetchPrograms(), fetchCourses(), fetchProgramOutcomesStandalone()])
        if (!cancelled) {
          const sorted = [...p].sort((a, b) =>
            String(a.name || a.code).localeCompare(String(b.name || b.code)))
          setPrograms(sorted)
          setCourses(c.filter(isActive).sort((a, b) => String(a.code).localeCompare(String(b.code))))
          setPoList(sortPos(pos.filter((p) => isActive(p) && isManagerCmCategory(p))))
          if (sorted.length > 0 && !selectedProgramId) setSelectedProgramId(sorted[0].id)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const programCourses = useMemo(
    () => courses.filter((c) => {
      const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
      return pid === selectedProgramId
    }),
    [courses, selectedProgramId],
  )

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? programCourses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, programCourses, selectedCourseId],
  )

  // PO options: prefer freshly-loaded datasets, fall back to the preloaded list
  // so the PO dropdown works before the first View. Only the manager-inputted
  // POs (the CURRICULUM MAPPING categories for BSIT) are graph roots.
  const managerOnlyPos = useMemo(
    () => (datasets ? datasets.pos.filter((p) => isManagerCmCategory(p)) : []),
    [datasets],
  )

  const allPos = useMemo(
    () => (datasets ? sortPos(managerOnlyPos) : poList),
    [datasets, managerOnlyPos, poList],
  )

  const selectedPo = useMemo(
    () => allPos.find((p) => p.id === selectedPoId) ?? null,
    [allPos, selectedPoId],
  )

  // PEO options: prefer freshly-loaded datasets, fall back to the preloaded list.
  const allPeos = useMemo(
    () => (datasets ? [...datasets.peos].sort((a, b) => String(a.code).localeCompare(String(b.code))) : peoList),
    [datasets, peoList],
  )

  const selectedPeo = useMemo(
    () => allPeos.find((p) => p.id === selectedPeoId) ?? null,
    [allPeos, selectedPeoId],
  )

  // SG options: prefer freshly-loaded datasets, fall back to the preloaded list.
  const allSgs = useMemo(
    () => (datasets ? [...datasets.sgs].sort((a, b) => String(a.code).localeCompare(String(b.code))) : sgList),
    [datasets, sgList],
  )

  const selectedSg = useMemo(
    () => allSgs.find((s) => s.id === selectedSgId) ?? null,
    [allSgs, selectedSgId],
  )

  // CHED memorandum options, same fallback shape as the SG list.
  const allCmos = useMemo(
    () => (datasets ? [...datasets.cmos].sort((a, b) => String(a.code).localeCompare(String(b.code))) : cmoList),
    [datasets, cmoList],
  )

  const selectedCmo = useMemo(
    () => allCmos.find((c) => c.id === selectedCmoId) ?? null,
    [allCmos, selectedCmoId],
  )

  // CLO options: every active learning outcome, labelled with the course it
  // belongs to so two subjects' outcomes never blur together. Always built
  // from the datasets — there is no pre-View preload for standalone CLOs.
  const allClos = useMemo(
    () => (datasets
      ? [...datasets.clos].sort((a, b) => {
          const ca = String(a.course || '')
          const cb = String(b.course || '')
          if (ca !== cb) return ca.localeCompare(cb)
          return String(a.code).localeCompare(String(b.code))
        })
      : []),
    [datasets],
  )

  const selectedClo = useMemo(
    () => allClos.find((c) => c.id === selectedCloId) ?? null,
    [allClos, selectedCloId],
  )

  // Curriculum root options: the distinct curricula the selected program's
  // subjects actually carry. A program whose subjects have no curriculum
  // assigned offers none.
  const allCurricula = useMemo(() => {
    const found: Resource[] = []
    const seen = new Set<string>()
    for (const c of programCourses) {
      const opt = c.curriculum_id
      const cid = opt && typeof opt === 'object' ? opt.id : opt
      if (!cid || seen.has(cid)) continue
      seen.add(cid)
      const rec = datasets ? datasets.resources.find((r) => r.id === cid) : undefined
      if (rec) found.push(rec)
    }
    return found
  }, [programCourses, datasets])

  const selectedCurriculum = useMemo(
    () => allCurricula.find((r) => r.id === selectedCurriculumId) ?? null,
    [allCurricula, selectedCurriculumId],
  )

  // The Program root reuses the program dropdown as its selector.
  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  )

  // ── Landing default: Generate Map opens onto the OBE Curriculum Map ────────
  // The page's own point is the map, so as soon as the data is in, the first
  // program that carries curricula boots its default curriculum full screen —
  // the dashboard-style view faculty expect when they navigate here. The boot
  // is polite: it stands down if the visitor has picked any visualization
  // themselves, and it prefers their program when it qualifies.
  const mapBootRanRef = useRef(false)
  useEffect(() => {
    if (mapBootRanRef.current || loading || !datasets || rootType || programs.length === 0) return
    const qualifies = (p: { id: string } | undefined) =>
      p != null &&
      courses.some((c) => {
        const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
        if (pid !== p.id) return false
        const opt = c.curriculum_id
        const cid = opt && typeof opt === 'object' ? opt.id : opt
        return cid != null && datasets.resources.some((r) => r.id === cid)
      })
    const userProgram = programs.find((p) => p.id === selectedProgramId)
    const candidate = qualifies(userProgram) ? userProgram : programs.find(qualifies)
    if (!candidate) return
    mapBootRanRef.current = true
    setSelectedProgramId(candidate.id)
    for (const c of courses) {
      const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
      if (pid !== candidate.id) continue
      const opt = c.curriculum_id
      const cid = opt && typeof opt === 'object' ? opt.id : opt
      if (cid == null || !datasets.resources.some((r) => r.id === cid)) continue
      setSelectedCurriculumId(cid)
      setRootType('curriculum')
      setShowGraph(true)
      setIsFullscreen(true)
      break
    }
  }, [loading, datasets, rootType, programs, courses, selectedProgramId])

  // While the curriculum root is up, a program switch keeps the map on screen:
  // the new program's default curriculum replaces the stale pick (which belongs
  // to the previous program and would render nothing). A program without
  // curricula stand down the full screen — its empty picker already explains.
  useEffect(() => {
    if (rootType !== 'curriculum') return
    if (allCurricula.length === 0) {
      setIsFullscreen(false)
      return
    }
    if (selectedCurriculumId && allCurricula.some((r) => r.id === selectedCurriculumId)) return
    const first = allCurricula[0]
    setSelectedCurriculumId(first.id)
    setShowGraph(true)
    setIsFullscreen(true)
  }, [rootType, allCurricula, selectedCurriculumId])

  // Quick tallies shown in the left panel before View.
  // Subject mode: pre-req / co-req / CLO counts. PO mode: linked CLOs / subjects.
  // PEO mode: aligned POs / subjects reached through those POs.
  const leftCounts = useMemo(() => {
    if (rootType === 'po') {
      if (!selectedPo) return null
      const key = normalizeCode(selectedPo.code)
      const linkedClos = (datasets ? datasets.clos : []).filter((clo) =>
        extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(key)
      )
      const subjectIds = new Set<string>()
      for (const clo of linkedClos) {
        for (const c of courses) {
          if (cloMatchesSubject(clo.course || '', normalizeCode(c.code))) subjectIds.add(c.id)
        }
      }
      return { pre: linkedClos.length, core: subjectIds.size, clos: -2 }
    }
    if (rootType === 'peo') {
      if (!selectedPeo) return null
      const peoKey = normalizeCode(selectedPeo.code)
      const linkedPos = managerOnlyPos.filter((p) => {
        if (p.peo_id === selectedPeo.id) return true
        if (p.peo_id) return false
        return p.peo_text ? extractCodes(p.peo_text, 'PEO').map(normalizeCode).includes(peoKey) : false
      })
      const subjectIds = new Set<string>()
      for (const po of linkedPos) {
        const poKey = normalizeCode(po.code)
        for (const clo of datasets ? datasets.clos : []) {
          if (extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(poKey)) {
            for (const c of courses) {
              if (cloMatchesSubject(clo.course || '', normalizeCode(c.code))) subjectIds.add(c.id)
            }
          }
        }
      }
      return { pre: linkedPos.length, core: subjectIds.size, clos: -2 }
    }
    if (rootType === 'sg') {
      if (!selectedSg) return null
      const linkedPos = managerOnlyPos.filter((p) => {
        if (p.sg_id === selectedSg.id) return true
        if (p.sg_id) return false
        return p.sg_text
          ? extractSgCodes(p.sg_text).some((t) => findSgByToken((datasets ? datasets.sgs : []), t)?.id === selectedSg.id)
          : false
      })
      const subjectIds = new Set<string>()
      for (const po of linkedPos) {
        const poKey = normalizeCode(po.code)
        for (const clo of datasets ? datasets.clos : []) {
          if (extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(poKey)) {
            for (const c of courses) {
              if (cloMatchesSubject(clo.course || '', normalizeCode(c.code))) subjectIds.add(c.id)
            }
          }
        }
      }
      return { pre: linkedPos.length, core: subjectIds.size, clos: -2 }
    }
    if (rootType === 'cmo') {
      if (!selectedCmo) return null
      const cmoCode = normalizeCode(selectedCmo.code)
      const cmoTitle = normalizeCode(selectedCmo.title || '')
      const linkedPos = managerOnlyPos.filter((p) => {
        if (p.cmo_id === selectedCmo.id) return true
        if (p.cmo_id) return false
        const hay = normalizeCode(`${p.description || ''} ${p.title || ''}`)
        return (cmoCode !== '' && hay.includes(cmoCode)) || (cmoTitle !== '' && hay.includes(cmoTitle))
      })
      const subjectIds = new Set<string>()
      for (const po of linkedPos) {
        const poKey = normalizeCode(po.code)
        for (const clo of datasets ? datasets.clos : []) {
          if (extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(poKey)) {
            for (const c of courses) {
              if (cloMatchesSubject(clo.course || '', normalizeCode(c.code))) subjectIds.add(c.id)
            }
          }
        }
      }
      return { pre: linkedPos.length, core: subjectIds.size, clos: -2 }
    }
    if (rootType === 'clo') {
      if (!selectedClo) return null
      const namedKeys = [...new Set(extractCodes(selectedClo.title || '', 'PO').map(normalizeCode))]
      const linkedPos = managerOnlyPos.filter((p) => namedKeys.includes(normalizeCode(p.code)))
      const subjectIds = new Set<string>()
      for (const clo of datasets ? datasets.clos : []) {
        if (extractCodes(clo.title || '', 'PO').map(normalizeCode).some((k) => namedKeys.includes(k))) {
          for (const c of courses) {
            if (cloMatchesSubject(clo.course || '', normalizeCode(c.code))) subjectIds.add(c.id)
          }
        }
      }
      return { pre: linkedPos.length, core: subjectIds.size, clos: -2 }
    }
    // Curriculum/Program roots: how many subjects the branch starts with and
    // how many outcomes those subjects' CLOs name in total.
    if (rootType === 'curriculum') {
      if (!selectedCurriculum) return null
      const inCurriculum = courses.filter((c) => {
        const opt = c.curriculum_id
        const cid = opt && typeof opt === 'object' ? opt.id : opt
        return cid != null && cid === selectedCurriculum.id
      })
      let poCount = 0
      for (const c of inCurriculum) {
        for (const clo of datasets ? datasets.clos : []) {
          if (cloMatchesSubject(clo.course || '', normalizeCode(c.code)) && extractCodes(clo.title || '', 'PO').length > 0) {
            poCount += 1
          }
        }
      }
      return { pre: inCurriculum.length, core: poCount, clos: -2 }
    }
    if (rootType === 'program') {
      if (!selectedProgram) return null
      let poCount = 0
      for (const c of programCourses) {
        for (const clo of datasets ? datasets.clos : []) {
          if (cloMatchesSubject(clo.course || '', normalizeCode(c.code)) && extractCodes(clo.title || '', 'PO').length > 0) {
            poCount += 1
          }
        }
      }
      return { pre: programCourses.length, core: poCount, clos: -2 }
    }
    if (!selectedCourse) return null
    const pre = (selectedCourse.prerequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    const core = (selectedCourse.corequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    let clos = -1
    if (datasets) {
      const key = normalizeCode(selectedCourse.code)
      clos = datasets.clos.filter((clo) => cloMatchesSubject(clo.course || '', key)).length
    }
    return { pre, core, clos }
  }, [rootType, selectedPo, selectedPeo, selectedSg, selectedCmo, selectedClo, selectedCurriculum, selectedProgram, selectedCourse, datasets, courses, programCourses])

  // ── Load + cache outcome datasets ──────────────────────────────────────────
  // Called on mount (silently) so the About card can show the full CLO list
  // without waiting for Visualization, and again on View / Refresh.
  const loadDatasets = async (force = false, silent = false) => {
    if (datasets && !force) return
    if (!silent) setSpinner(true)
    setGraphError('')
    try {
      const [resources, clos, pos, peos, sgs, cmos] = await Promise.all([
        fetchResources(),
        fetchCourseLearningOutcomesStandalone(),
        fetchProgramOutcomesStandalone(),
        fetchProgramEducationalObjectives(),
        fetchStrategicGoals(),
        fetchChedMemoOrders(),
      ])
      const activePos = pos.filter(isActive)
      setDatasets({
        resources: resources.filter(isActive),
        clos: clos.filter(isActive),
        pos: activePos,
        peos: peos.filter(isActive),
        sgs: sgs.filter(isActive),
        cmos: cmos.filter(isActive),
      })
      setPoList(sortPos(activePos.filter((p) => isManagerCmCategory(p))))
      setPeoList(peos.filter(isActive))
      setSgList([...sgs.filter(isActive)].sort((a, b) => String(a.code).localeCompare(String(b.code))))
      setCmoList([...cmos.filter(isActive)].sort((a, b) => String(a.code).localeCompare(String(b.code))))
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to load relationships.')
    } finally {
      if (!silent) setSpinner(false)
    }
  }

  // Prefetch once on mount (guarded so StrictMode's double-invoke doesn't fire
  // two rounds of queries). Without this the About card's CLO list stays empty
  // until the user presses Visualization.
  const prefetched = useRef(false)
  useEffect(() => {
    if (prefetched.current) return
    prefetched.current = true
    loadDatasets(false, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Shared PO downstream leaves (PEO / SG / CMO) ──────────────────────────
  // Extracted so both Subject-rooted and PO-rooted builders stay identical.
  const attachPoLeaves = useCallback(
    (datasetsRef: OutcomeDatasets, poNode: GraphNodeData, poRec: ProgramOutcomeStandalone) => {
      const pushChild = (child: GraphNodeData) => {
        if (!poNode.children.some((c) => c.id === child.id)) poNode.children.push(child)
      }

      // PEO: id-first, then text-code fallback.
      if (poRec.peo_id) {
        const rec = datasetsRef.peos.find((p) => p.id === poRec.peo_id)
        if (rec) pushChild({ id: `peo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'peo', placeholder: false, peoId: rec.id, children: [] })
        else {
          const tok = poRec.peo_text ? extractCodes(poRec.peo_text, 'PEO')[0] : ''
          pushChild({ id: `peo-missing-${poRec.peo_id}`, code: tok || 'PEO', title: 'PEO not found or archived', kind: 'peo', placeholder: true, children: [] })
        }
      } else if (poRec.peo_text) {
        for (const tok of extractCodes(poRec.peo_text, 'PEO')) {
          const rec = datasetsRef.peos.find((p) => normalizeCode(p.code) === normalizeCode(tok))
          pushChild(rec
            ? { id: `peo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'peo', placeholder: false, peoId: rec.id, children: [] }
            : { id: `peo-missing-${tok}`, code: tok, title: 'PEO not found or archived', kind: 'peo', placeholder: true, children: [] })
        }
      }

      // Strategic Goal: id-first, then text-code fallback.
      if (poRec.sg_id) {
        const rec = datasetsRef.sgs.find((s) => s.id === poRec.sg_id)
        if (rec) pushChild({ id: `sg-${rec.id}`, code: rec.code, title: rec.title || rec.description || rec.code, kind: 'sg', placeholder: false, sgId: rec.id, children: [] })
        else {
          const tok = poRec.sg_text ? extractSgCodes(poRec.sg_text)[0] : ''
          pushChild({ id: `sg-missing-${poRec.sg_id}`, code: tok || 'SG', title: 'Strategic Goal not found or archived', kind: 'sg', placeholder: true, children: [] })
        }
      } else if (poRec.sg_text) {
        for (const tok of extractSgCodes(poRec.sg_text)) {
          const rec = findSgByToken(datasetsRef.sgs, tok)
          pushChild(rec
            ? { id: `sg-${rec.id}`, code: rec.code, title: rec.title || rec.description || rec.code, kind: 'sg', placeholder: false, sgId: rec.id, children: [] }
            : { id: `sg-missing-${tok}`, code: tok, title: 'Strategic Goal not found or archived', kind: 'sg', placeholder: true, children: [] })
        }
      }

      // CHED Memorandum Order: id-first, then description/title text fallback.
      if (poRec.cmo_id) {
        const rec = datasetsRef.cmos.find((c) => c.id === poRec.cmo_id)
        if (rec) pushChild({ id: `cmo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'cmo', placeholder: false, cmoId: rec.id, children: [] })
        else pushChild({ id: `cmo-missing-${poRec.cmo_id}`, code: 'CMO', title: 'CHED Memorandum Order not found or archived', kind: 'cmo', placeholder: true, children: [] })
      } else {
        const text = `${poRec.description || ''} ${poRec.title || ''}`.trim()
        const hay = normalizeCode(text)
        let cmoMatch: ChedMemoOrder | undefined
        for (const rec of datasetsRef.cmos) {
          const keyCode = normalizeCode(rec.code)
          const keyTitle = normalizeCode(rec.title || '')
          if ((keyCode && hay.includes(keyCode)) || (keyTitle && hay.includes(keyTitle))) {
            cmoMatch = rec
            break
          }
        }
        if (cmoMatch) {
          pushChild({ id: `cmo-${cmoMatch.id}`, code: cmoMatch.code, title: cmoMatch.title || cmoMatch.code, kind: 'cmo', placeholder: false, cmoId: cmoMatch.id, children: [] })
        } else if (text) {
          // Fixed CMO statements (e.g. "Common to all programs in all types of
          // schools") are stored as text only, with cmo_id NULL — surface them
          // as a resolved CMO leaf instead of dropping the alignment.
          pushChild({ id: `cmo-text-${normalizeCode(text).slice(0, 48) || 'x'}`, code: 'CMO', title: text, kind: 'cmo', placeholder: false, children: [] })
        }
      }
    },
    [],
  )

  // ── Outcome sub-tree for one course code ───────────────────────────────────
  // Every CLO whose course matches `courseKey`, each carrying the POs its title
  // names and those POs' PEO / SG / CMO leaves. Extracted so the subject itself
  // and its sibling subjects under the curriculum branch cannot drift into
  // producing different sub-trees for the same course.
  const buildCourseClos = useCallback(
    (datasetsRef: OutcomeDatasets, courseKey: string): GraphNodeData[] => {
      const subjectClos = datasetsRef.clos.filter((clo) =>
        cloMatchesSubject(clo.course || '', courseKey)
      )
      const poMap = new Map<string, GraphNodeData>()
      const out: GraphNodeData[] = []

      for (const clo of subjectClos) {
        const cloNode: GraphNodeData = {
          id: `clo-${clo.id}`,
          code: clo.code,
          title: clo.description || clo.code,
          kind: 'clo',
          placeholder: false,
          cloId: clo.id,
          children: [],
        }
        for (const tok of extractCodes(clo.title || '', 'PO')) {
          const key = normalizeCode(tok)
          let poNode = poMap.get(key)
          if (!poNode) {
            const poRec = datasetsRef.pos
              .filter((p) => isManagerCmCategory(p))
              .find((p) => normalizeCode(p.code) === key)
            poNode = {
              id: poRec ? `po-${poRec.id}` : `po-missing-${tok}`,
              code: tok,
              title: poRec ? (poRec.title || poRec.description || tok) : 'PO not found or archived',
              kind: 'po',
              placeholder: !poRec,
              poId: poRec?.id,
              children: [],
            }
            if (poRec) attachPoLeaves(datasetsRef, poNode, poRec)
            poMap.set(key, poNode)
          }
          if (!cloNode.children.some((c) => c.id === poNode!.id)) cloNode.children.push(poNode!)
        }
        out.push(cloNode)
      }

      return out
    },
    [attachPoLeaves],
  )

  // ── Build the subject-rooted graph model ───────────────────────────────────
  const buildGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, subject: Course): GraphNodeData => {
      const subjectKey = normalizeCode(subject.code)

      const subjectNode: GraphNodeData = {
        id: `course-${subject.id}`,
        code: subject.code,
        title: subject.title,
        kind: 'subject',
        placeholder: false,
        courseId: subject.id,
        children: [],
      }

      // Curriculum as a child of subject. It carries every other subject in the same
      // curriculum, each with its own CLO → PO → PEO/SG/CMO sub-tree, so the
      // branch opens into the whole curriculum instead of a dead end. Having
      // children makes the node `expandable` on its own — expandable is derived
      // from childCount — which gives it the +/− badge and click-to-toggle for
      // free. Pre-requisites are deliberately not pulled in here: at curriculum
      // breadth they would drag in the rest of the program and swamp the map.
      const cidOpt = subject.curriculum_id
      const cid = cidOpt && typeof cidOpt === 'object' ? cidOpt.id : cidOpt
      const curRec = cid ? datasetsRef.resources.find((r) => r.id === cid) : undefined

      const curriculumSiblings = curRec
        ? courses
            .filter((c) => {
              const opt = c.curriculum_id
              const other = opt && typeof opt === 'object' ? opt.id : opt
              return other != null && other === curRec.id && c.id !== subject.id
            })
            .map<GraphNodeData>((c) => ({
              id: `course-${c.id}`,
              code: c.code,
              title: c.title,
              kind: 'subject',
              placeholder: false,
              courseId: c.id,
              children: buildCourseClos(datasetsRef, normalizeCode(c.code)),
            }))
        : []

      subjectNode.children.push(
        curRec
          ? {
              id: `cur-${curRec.id}`,
              code: (curRec.code || curRec.title),
              title: curRec.title,
              kind: 'curriculum',
              placeholder: false,
              curId: curRec.id,
              children: curriculumSiblings,
            }
          : {
              id: `cur-none-${cid || 'x'}`,
              code: 'No curriculum',
              title: cid ? 'Curriculum not found or archived' : 'This subject has no curriculum assigned',
              kind: 'curriculum',
              placeholder: true,
              children: [],
            },
      )

      // Prerequisite + corequisite satellites attach to the subject.
      const addSat = (raw: string, kind: NodeKind) => {
        if (!raw) return
        for (const code of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
          const target = courses.find((c) => normalizeCode(c.code) === normalizeCode(code))
            ?? programCourses.find((c) => normalizeCode(c.code) === normalizeCode(code))
          subjectNode.children.push({
            id: target ? `course-${target.id}` : `${kind}-missing-${code}`,
            code,
            title: target ? target.title : 'Not found or archived',
            kind,
            placeholder: !target,
            courseId: target?.id,
            children: [],
          })
        }
      }
      addSat(subject.prerequisite, 'prerequisite')
      addSat(subject.corequisite, 'corequisite')

      // CLOs whose course matches the selected subject code.
      subjectNode.children.push(...buildCourseClos(datasetsRef, subjectKey))

      return subjectNode
    },
    [courses, programCourses, buildCourseClos],
  )

  // ── Shared PO upstream: CLOs → their Subjects ─────────────────────────────
  // Attaches every CLO whose title references the PO (each with the subject(s)
  // its course matches) to an existing PO node. Returns how many CLOs attached.
  const attachClosUpstream = useCallback(
    (datasetsRef: OutcomeDatasets, poNode: GraphNodeData, poRec: ProgramOutcomeStandalone): number => {
      const poKey = normalizeCode(poRec.code)
      const linkedClos = datasetsRef.clos.filter((clo) =>
        extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(poKey)
      )
      for (const clo of linkedClos) {
        const cloNode: GraphNodeData = {
          id: `clo-${clo.id}`,
          code: clo.code,
          title: clo.description || clo.title || clo.code,
          kind: 'clo',
          placeholder: false,
          children: [],
        }
        const rawCourse = (clo.course || '').trim()
        const matched = rawCourse
          ? courses.filter((c) => cloMatchesSubject(rawCourse, normalizeCode(c.code)))
          : []
        if (matched.length === 0) {
          cloNode.children.push({
            id: `subject-missing-${clo.id}-${normalizeCode(rawCourse).slice(0, 24) || 'x'}`,
            code: rawCourse || 'Unknown subject',
            title: 'Subject not found or archived',
            kind: 'subject',
            placeholder: true,
            children: [],
          })
        } else {
          for (const c of matched) {
            if (!cloNode.children.some((s) => s.id === `course-${c.id}`)) {
              cloNode.children.push({
                id: `course-${c.id}`,
                code: c.code,
                title: c.title,
                kind: 'subject',
                placeholder: false,
                courseId: c.id,
                children: [],
              })
            }
          }
        }
        poNode.children.push(cloNode)
      }
      return linkedClos.length
    },
    [courses],
  )

  // ── Build the PO-rooted graph model ────────────────────────────────────────
  // Root = PO. Upstream: CLOs that target this PO → their Subjects.
  // Downstream: the PO's own PEO / SG / CMO leaves (shared helper).
  const buildPoGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, poRec: ProgramOutcomeStandalone): GraphNodeData => {
      const root: GraphNodeData = {
        id: `po-${poRec.id}`,
        code: poRec.code,
        title: poRec.title || poRec.description || poRec.code,
        kind: 'po',
        placeholder: false,
        poId: poRec.id,
        children: [],
      }

      // Downstream first so PEO/SG/CMO order matches the subject graph.
      attachPoLeaves(datasetsRef, root, poRec)

      // Upstream: every CLO whose title references this PO code.
      if (attachClosUpstream(datasetsRef, root, poRec) === 0) {
        root.children.push({
          id: `clo-none-${poRec.id}`,
          code: 'No linked CLOs',
          title: 'No CLO references this PO yet',
          kind: 'clo',
          placeholder: true,
          children: [],
        })
      }

      return root
    },
    [attachPoLeaves, attachClosUpstream],
  )

  // ── Build the PEO-rooted graph model ───────────────────────────────────────
  // Root = PEO. Downstream: every PO aligned to this PEO (by peo_id first, then
  // by a PEO code token in peo_text) — each PO shows its SG/CMO leaves and its
  // upstream CLOs → subjects, so it looks like a slice of the subject graph.
  // PEO leaves are pruned from every slice: the root already heads the branch,
  // and re-stating "PEO 1" under each aligned PO painted the same label a dozen
  // times over — while the remaining "PEO 2 / PEO 3" repeats read as
  // duplication rather than as each PO's extra alignments. A PO's full PEO
  // story stays visible from a PO root, a subject graph, and the
  // connected-details card.
  const buildPeoGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, peoRec: ProgramEducationalObjective): GraphNodeData => {
      const peoKey = normalizeCode(peoRec.code)
      const root: GraphNodeData = {
        id: `peo-${peoRec.id}`,
        code: peoRec.code,
        title: peoRec.title || peoRec.code,
        kind: 'peo',
        placeholder: false,
        peoId: peoRec.id,
        children: [],
      }

      const linkedPos = datasetsRef.pos.filter((p) => {
        if (!isManagerCmCategory(p)) return false
        if (p.peo_id === peoRec.id) return true
        if (p.peo_id) return false // a concrete id wins over free text
        return p.peo_text
          ? extractCodes(p.peo_text, 'PEO').map(normalizeCode).includes(peoKey)
          : false
      })

      if (linkedPos.length === 0) {
        root.children.push({
          id: `po-none-${peoRec.id}`,
          code: 'No aligned POs',
          title: 'No program outcome aligns to this PEO yet',
          kind: 'po',
          placeholder: true,
          children: [],
        })
        return root
      }

      for (const po of sortPos(linkedPos)) {
        const poNode: GraphNodeData = {
          id: `po-${po.id}`,
          code: po.code,
          title: po.title || po.description || po.code,
          kind: 'po',
          placeholder: false,
          poId: po.id,
          children: [],
        }
        attachPoLeaves(datasetsRef, poNode, po)
        attachClosUpstream(datasetsRef, poNode, po)
        // A PEO branch never repeats PEOs: the root is one already, and the
        // slice-side PEO leaves — the root's own or a PO's extra alignments —
        // all read as the same label painted over and over. What remains on
        // each branch is what is unique to that PO: its goals, its CMO anchor,
        // and the CLOs → subjects that claim it.
        poNode.children = poNode.children.filter((c) => c.kind !== 'peo')
        root.children.push(poNode)
      }

      return root
    },
    [attachPoLeaves, attachClosUpstream],
  )

  // ── One PO as a slice of the web (shared by SG / CMO / CLO roots) ──────────
  // Root-side branches render each aligned PO carrying BOTH sides of the story:
  // its PEO / SG / CMO leaves and its upstream CLOs → subjects — exactly what
  // the PO root itself shows, so a branch never understates a PO's reach.
  // `omitId` drops one child — the root record's own leaf. A branch rooted at
  // a PEO / SG / CMO / CLO otherwise re-states that very record under every
  // PO slice (the same "PEO 1" painted once per aligned PO), which the root
  // already announces; the record itself navigates nowhere new from there.
  const poSliceNode = useCallback(
    (datasetsRef: OutcomeDatasets, poRec: ProgramOutcomeStandalone, omitId?: string): GraphNodeData => {
      const node: GraphNodeData = {
        id: `po-${poRec.id}`,
        code: poRec.code,
        title: poRec.title || poRec.description || poRec.code,
        kind: 'po',
        placeholder: false,
        poId: poRec.id,
        children: [],
      }
      attachPoLeaves(datasetsRef, node, poRec)
      attachClosUpstream(datasetsRef, node, poRec)
      if (omitId) node.children = node.children.filter((c) => c.id !== omitId)
      return node
    },
    [attachPoLeaves, attachClosUpstream],
  )

  // ── Build the SG-rooted graph model ───────────────────────────────────────
  // Root = Strategic Goal. Every PO aligned to this goal (sg_id first, then a
  // goal token in sg_text), each rendered as a full PO slice.
  const buildSgGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, sgRec: StrategicGoal): GraphNodeData => {
      const root: GraphNodeData = {
        id: `sg-${sgRec.id}`,
        code: sgRec.code,
        title: sgRec.title || sgRec.description || sgRec.code,
        kind: 'sg',
        placeholder: false,
        sgId: sgRec.id,
        children: [],
      }
      const linkedPos = datasetsRef.pos.filter((p) => {
        if (!isManagerCmCategory(p)) return false
        if (p.sg_id === sgRec.id) return true
        if (p.sg_id) return false // a concrete id wins over free text
        return p.sg_text
          ? extractSgCodes(p.sg_text).some((t) => findSgByToken(datasetsRef.sgs, t)?.id === sgRec.id)
          : false
      })
      if (linkedPos.length === 0) {
        root.children.push({
          id: `po-none-${sgRec.id}`,
          code: 'No aligned POs',
          title: 'No program outcome aligns to this goal yet',
          kind: 'po',
          placeholder: true,
          children: [],
        })
        return root
      }
      // Each aligned PO renders as a full slice, with the root goal's own leaf
      // pruned so "Goal 1" is not re-stated under every PO branch.
      for (const po of sortPos(linkedPos)) root.children.push(poSliceNode(datasetsRef, po, root.id))
      return root
    },
    [poSliceNode],
  )

  // ── Build the CMO-rooted graph model ──────────────────────────────────────
  // Root = CHED Memorandum Order. The POs it anchors: cmo_id first, then an
  // order code or title found in the PO's description/title — the same match
  // the leaf side uses, read from the other direction.
  const buildCmoGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, cmoRec: ChedMemoOrder): GraphNodeData => {
      const root: GraphNodeData = {
        id: `cmo-${cmoRec.id}`,
        code: cmoRec.code,
        title: cmoRec.title || cmoRec.code,
        kind: 'cmo',
        placeholder: false,
        cmoId: cmoRec.id,
        children: [],
      }
      const cmoCode = normalizeCode(cmoRec.code)
      const cmoTitle = normalizeCode(cmoRec.title || '')
      const linkedPos = datasetsRef.pos.filter((p) => {
        if (!isManagerCmCategory(p)) return false
        if (p.cmo_id === cmoRec.id) return true
        if (p.cmo_id) return false
        const hay = normalizeCode(`${p.description || ''} ${p.title || ''}`)
        return (cmoCode !== '' && hay.includes(cmoCode)) || (cmoTitle !== '' && hay.includes(cmoTitle))
      })
      if (linkedPos.length === 0) {
        root.children.push({
          id: `po-none-${cmoRec.id}`,
          code: 'No anchored POs',
          title: 'No program outcome anchors to this memorandum yet',
          kind: 'po',
          placeholder: true,
          children: [],
        })
        return root
      }
      // Each anchored PO renders as a full slice, with the root memorandum's
      // own leaf pruned so the CMO is not re-stated under every PO branch.
      for (const po of sortPos(linkedPos)) root.children.push(poSliceNode(datasetsRef, po, root.id))
      return root
    },
    [poSliceNode],
  )

  // ── Build the CLO-rooted graph model ──────────────────────────────────────
  // Root = one Course Learning Outcome. The branch starts at the outcome
  // statement and carries every PO its text names, each as a full slice, so
  // the reading is the one faculty want: this outcome, what it feeds, and what
  // those outcomes answer to.
  const buildCloGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, cloRec: CourseLearningOutcomeStandalone): GraphNodeData => {
      const root: GraphNodeData = {
        id: `clo-${cloRec.id}`,
        code: cloRec.code,
        title: cloRec.description || cloRec.code,
        kind: 'clo',
        placeholder: false,
        cloId: cloRec.id,
        children: [],
      }
      const seenKeys = new Set<string>()
      let named = 0
      for (const tok of extractCodes(cloRec.title || '', 'PO')) {
        const key = normalizeCode(tok)
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        const poRec = datasetsRef.pos
          .filter((p) => isManagerCmCategory(p))
          .find((p) => normalizeCode(p.code) === key)
        if (poRec) {
          // Full slice, minus the root outcome's own leaf — every named PO
          // would otherwise re-list this very CLO under itself.
          root.children.push(poSliceNode(datasetsRef, poRec, root.id))
        } else {
          root.children.push({
            id: `po-missing-${tok}`,
            code: tok,
            title: 'PO not found or archived',
            kind: 'po',
            placeholder: true,
            children: [],
          })
        }
        named += 1
      }
      if (named === 0) {
        root.children.push({
          id: `po-none-${cloRec.id}`,
          code: 'No named POs',
          title: 'This learning outcome names no program outcome yet',
          kind: 'po',
          placeholder: true,
          children: [],
        })
      }
      return root
    },
    [poSliceNode],
  )

  // ── Build the program-rooted graph model ──────────────────────────────────
  // Root = the program itself. The branch starts at the program and fans into
  // every subject it holds (matched through program_id), each subject carrying
  // its CLO → PO → PEO/SG/CMO sub-tree. This is the widest picture the map can
  // draw — the same fan the subject graph's curriculum branch opens.
  const buildProgramGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, program: Program): GraphNodeData => {
      const root: GraphNodeData = {
        id: `program-${program.id}`,
        code: program.code,
        title: program.name || program.code,
        kind: 'curriculum',
        placeholder: false,
        programId: program.id,
        children: [],
      }
      const subjectNodes = courses
        .filter((c) => {
          const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
          return pid === program.id
        })
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map<GraphNodeData>((c) => ({
          id: `course-${c.id}`,
          code: c.code,
          title: c.title,
          kind: 'subject',
          placeholder: false,
          courseId: c.id,
          children: buildCourseClos(datasetsRef, normalizeCode(c.code)),
        }))
      if (subjectNodes.length === 0) {
        root.children.push({
          id: `subject-none-${program.id}`,
          code: 'No subjects',
          title: 'This program holds no subjects yet',
          kind: 'subject',
          placeholder: true,
          children: [],
        })
      } else {
        root.children.push(...subjectNodes)
      }
      return root
    },
    [courses, buildCourseClos],
  )

  // ── Build the curriculum-rooted graph model ───────────────────────────────
  // Root = one curriculum. Subjects are matched through curriculum_id — the
  // linkage the subject graph uses to build its curriculum branch, read from
  // the other side so both views agree on who belongs where.
  const buildCurriculumGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, curRec: Resource): GraphNodeData => {
      const root: GraphNodeData = {
        id: `cur-${curRec.id}`,
        code: curRec.code || curRec.title,
        title: curRec.title,
        kind: 'curriculum',
        placeholder: false,
        curId: curRec.id,
        children: [],
      }
      const subjectNodes = courses
        .filter((c) => {
          const opt = c.curriculum_id
          const cid = opt && typeof opt === 'object' ? opt.id : opt
          return cid != null && cid === curRec.id
        })
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map<GraphNodeData>((c) => ({
          id: `course-${c.id}`,
          code: c.code,
          title: c.title,
          kind: 'subject',
          placeholder: false,
          courseId: c.id,
          children: buildCourseClos(datasetsRef, normalizeCode(c.code)),
        }))
      if (subjectNodes.length === 0) {
        root.children.push({
          id: `subject-none-${curRec.id}`,
          code: 'No subjects',
          title: 'No subject carries this curriculum yet',
          kind: 'subject',
          placeholder: true,
          children: [],
        })
      } else {
        root.children.push(...subjectNodes)
      }
      return root
    },
    [courses, buildCourseClos],
  )

  // ── OBE Curriculum Map model (the curriculum root's default view) ──────────
  // One entry per subject of the curriculum, plus the manager-aligned PO
  // vocabulary behind them. Each subject records:
  //  - poKeys  — every program outcome its CLOs name. Drives both the
  //              subject↔subject cross-links ("these two feed PO 3") and the
  //              right-hand PGO column, so the map never invents a link.
  //  - cloIds  — the subject's own course learning outcomes. The PI filter
  //              reads them ("which subject teaches this indicator").
  //  - year / sem — term placement straight from the courses table, so the
  //              columns are the real timetable, not an assumption.
  const buildCurriculumMapModel = useCallback(
    (datasetsRef: OutcomeDatasets, curRec: Resource) => {
      const subjects = courses
        .filter((c) => {
          const opt = c.curriculum_id
          const cid = opt && typeof opt === 'object' ? opt.id : opt
          return cid != null && cid === curRec.id
        })
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map((c) => {
          const courseKey = normalizeCode(c.code)
          const subjectClos = datasetsRef.clos.filter((clo) =>
            cloMatchesSubject(clo.course || '', courseKey)
          )
          const poKeys = new Set<string>()
          for (const clo of subjectClos) {
            for (const tok of extractCodes(clo.title || '', 'PO')) {
              const key = normalizeCode(tok)
              const anchored = datasetsRef.pos
                .filter((p) => isManagerCmCategory(p))
                .some((p) => normalizeCode(p.code) === key)
              if (anchored) poKeys.add(key)
            }
          }
          return {
            courseId: c.id,
            code: c.code,
            title: c.title,
            // Guard: the column only anchors a real program year level (1–12).
            // A four-digit academic year — the column's older reading — would
            // otherwise try to span thousands of map columns; such a row falls
            // into the "No term recorded" catch-all instead.
            year: c.year_level != null && c.year_level >= 1 && c.year_level <= 12 ? c.year_level : null,
            sem: c.semester ?? null,
            cloIds: subjectClos.map((clo) => clo.id),
            poKeys,
          }
        })
      const pos = datasetsRef.pos
        .filter((p) => isManagerCmCategory(p))
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map((p) => ({ id: p.id, code: p.code, title: p.title || p.description || p.code }))
      // The grid always spans at least four years — an early-stage curriculum
      // that only lists 1st-year subjects still reads as a full OBE map.
      const maxYear = Math.max(4, ...subjects.map((s) => s.year ?? 1))
      return { subjects, pos, maxYear }
    },
    [courses],
  )

  // Filter vocabularies for the map's two selects. The PGO list carries only
  // outcomes the curriculum actually feeds; the PI list carries the CLOs of
  // those subjects that name the chosen PGO (the OBE "performance indicator"
  // is the subject-level outcome behind the program one — here that is the
  // CLO-to-PO relation the system already stores).
  const mapFilterOptions = useMemo(() => {
    if (!datasets || rootType !== 'curriculum' || !selectedCurriculum) return { pos: [], clos: [] }
    const map = buildCurriculumMapModel(datasets, selectedCurriculum)
    const poById = new Map(map.pos.map((p) => [p.id, p]))
    const activeKey = mapPoId ? normalizeCode(poById.get(mapPoId)?.code ?? '') : null
    const fedKeys = new Set<string>()
    for (const s of map.subjects) for (const k of s.poKeys) fedKeys.add(k)
    return {
      pos: map.pos.filter((p) => fedKeys.has(normalizeCode(p.code))),
      clos: datasets.clos
        .filter((clo) => map.subjects.some((s) => s.cloIds.includes(clo.id)))
        .filter((clo) => !activeKey
          || extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(activeKey)),
    }
  }, [datasets, rootType, selectedCurriculum, mapPoId, buildCurriculumMapModel])

  // Unique node counts per kind once a graph is on screen (used in the legend).
  const graphStats = useMemo(() => {
    if (!datasets) return null
    try {
      if (rootType === 'subject') {
        if (!selectedCourse) return null
        return countKinds(buildGraphModel(datasets, selectedCourse))
      }
      if (rootType === 'clo') {
        if (!selectedClo) return null
        return countKinds(buildCloGraphModel(datasets, selectedClo))
      }
      if (rootType === 'peo') {
        if (!selectedPeo) return null
        return countKinds(buildPeoGraphModel(datasets, selectedPeo))
      }
      if (rootType === 'sg') {
        if (!selectedSg) return null
        return countKinds(buildSgGraphModel(datasets, selectedSg))
      }
      if (rootType === 'cmo') {
        if (!selectedCmo) return null
        return countKinds(buildCmoGraphModel(datasets, selectedCmo))
      }
      if (rootType === 'curriculum') {
        if (!selectedCurriculum) return null
        return countKinds(buildCurriculumGraphModel(datasets, selectedCurriculum))
      }
      if (rootType === 'program') {
        if (!selectedProgram) return null
        return countKinds(buildProgramGraphModel(datasets, selectedProgram))
      }
      if (!selectedPo) return null
      return countKinds(buildPoGraphModel(datasets, selectedPo))
    } catch {
      return null
    }
  }, [rootType, selectedCourse, selectedClo, selectedPo, selectedPeo, selectedSg, selectedCmo, selectedCurriculum, selectedProgram, datasets, buildGraphModel, buildCloGraphModel, buildPoGraphModel, buildPeoGraphModel, buildSgGraphModel, buildCmoGraphModel, buildCurriculumGraphModel, buildProgramGraphModel])

  // Every node connected to a graph root, bucketed by category. Walks the exact
  // model the graph renders, so a details card and the map can never disagree.
  // The root is skipped (it is not "connected" to itself) and shared nodes are
  // de-duplicated by id — a PEO aligned to several POs is listed once.
  const collectConnected = useCallback((root: GraphNodeData): ConnectedGroup[] => {
    const buckets = new Map<ConnectedGroup['kind'], Map<string, ConnectedItem>>()
    const walk = (n: GraphNodeData) => {
      if (n.id !== root.id) {
        const kind = n.kind as ConnectedGroup['kind']
        if (connectedCategoryDefs.some((d) => d.kind === kind)) {
          let bucket = buckets.get(kind)
          if (!bucket) { bucket = new Map(); buckets.set(kind, bucket) }
          if (!bucket.has(n.id)) {
            bucket.set(n.id, { code: n.code, text: n.title, unresolved: n.placeholder })
          }
        }
      }
      n.children.forEach(walk)
    }
    walk(root)
    return connectedCategoryDefs.map(({ kind, label }) => ({
      kind,
      label,
      items: [...(buckets.get(kind)?.values() ?? [])],
    }))
  }, [])

  

  // True when a node's children are hidden. Curriculum branches are closed until
  // explicitly opened; everything else is open until explicitly collapsed.
  const isNodeCollapsed = useCallback(
    (id: string, kind: NodeKind) => (kind === 'curriculum' ? !openCurriculumIds.has(id) : collapsedIds.has(id)),
    [collapsedIds, openCurriculumIds],
  )

  const toggleNode = useCallback((id: string, kind: NodeKind) => {
    const swap = (prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    }
    if (kind === 'curriculum') setOpenCurriculumIds(swap)
    else setCollapsedIds(swap)
  }, [])

  const buildActiveModel = useCallback(() => {
    if (!datasets) return null
    if (rootType === 'subject') return selectedCourse ? buildGraphModel(datasets, selectedCourse) : null
    if (rootType === 'clo') return selectedClo ? buildCloGraphModel(datasets, selectedClo) : null
    if (rootType === 'peo') return selectedPeo ? buildPeoGraphModel(datasets, selectedPeo) : null
    if (rootType === 'sg') return selectedSg ? buildSgGraphModel(datasets, selectedSg) : null
    if (rootType === 'cmo') return selectedCmo ? buildCmoGraphModel(datasets, selectedCmo) : null
    if (rootType === 'curriculum') return selectedCurriculum ? buildCurriculumGraphModel(datasets, selectedCurriculum) : null
    if (rootType === 'program') return selectedProgram ? buildProgramGraphModel(datasets, selectedProgram) : null
    return selectedPo ? buildPoGraphModel(datasets, selectedPo) : null
  }, [datasets, rootType, selectedCourse, selectedClo, selectedPo, selectedPeo, selectedSg, selectedCmo, selectedCurriculum, selectedProgram, buildGraphModel, buildCloGraphModel, buildPoGraphModel, buildPeoGraphModel, buildSgGraphModel, buildCmoGraphModel, buildCurriculumGraphModel, buildProgramGraphModel])

  // Memoized so the derived card state below keeps a stable identity between
  // renders — buildActiveModel() rebuilds the entire tree on every call.
  const activeModel = useMemo(() => buildActiveModel(), [buildActiveModel])

  const findNodeById = useCallback((id: string): GraphNodeData | null => {
    if (!activeModel || !id) return null
    const stack: GraphNodeData[] = [activeModel]
    while (stack.length > 0) {
      const n = stack.pop() as GraphNodeData
      if (n.id === id) return n
      for (let i = n.children.length - 1; i >= 0; i -= 1) stack.push(n.children[i])
    }
    return null
  }, [activeModel])

  // What the card describes: the clicked branch if there is one, else the root.
  // A stale id (root changed, node dropped out of the tree) falls back to the
  // root rather than leaving the card blank.
  const inspectedNode = useMemo(() => {
    if (!inspectedNodeId || inspectedNodeId === activeModel?.id) return activeModel
    return findNodeById(inspectedNodeId) ?? activeModel
  }, [inspectedNodeId, activeModel, findNodeById])

  // True while the card is pointed at something below the root.
  const isInspecting = !!inspectedNode && !!activeModel && inspectedNode.id !== activeModel.id

  // Buckets for whichever node is in focus, so the card and the map are always
  // walking the same tree.
  const inspectedConnected = useMemo<ConnectedGroup[]>(() => {
    if (!inspectedNode) return []
    try {
      return collectConnected(inspectedNode)
    } catch {
      return []
    }
  }, [inspectedNode, collectConnected])

  // Collapse every expandable node except the center root.
  const collapseAll = useCallback(() => {
    const data = buildActiveModel()
    if (!data) return
    const ids = new Set<string>()
    const collect = (n: GraphNodeData) => {
      if (n.children?.length) { ids.add(n.id); n.children.forEach(collect) }
    }
    collect(data)
    ids.delete(data.id) // keep the root ring visible
    setCollapsedIds(ids)
    // Curriculum branches are closed unless open, so clearing this closes any
    // that were opened — otherwise Collapse All would leave them hanging open.
    setOpenCurriculumIds(new Set())
  }, [buildActiveModel])

  // Reset the SVG zoom/pan transform to its default framed view.
  const resetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity)
    }
  }, [])

  const handleRefresh = async () => {
    if ((rootType === 'subject' && !selectedCourse)
      || (rootType === 'clo' && !selectedClo)
      || (rootType === 'po' && !selectedPo)
      || (rootType === 'peo' && !selectedPeo)
      || (rootType === 'sg' && !selectedSg)
      || (rootType === 'cmo' && !selectedCmo)
      || (rootType === 'curriculum' && !selectedCurriculum)
      || (rootType === 'program' && !selectedProgram)) return
    setGraphError('')
    await loadDatasets(true)
  }

  // Re-root helpers — push the current root onto the trail before switching.
  // Every node-driven jump shares one trail push: remember whatever root is on
  // screen now, then move. The click guard already excludes re-rooting onto
  // the root that is currently displayed.
  const pushTrail = useCallback(() => {
    const current: NavEntry | null =
      rootType === 'subject' && selectedCourseId ? { type: 'subject', id: selectedCourseId }
      : rootType === 'clo' && selectedCloId ? { type: 'clo', id: selectedCloId }
      : rootType === 'po' && selectedPoId ? { type: 'po', id: selectedPoId }
      : rootType === 'peo' && selectedPeoId ? { type: 'peo', id: selectedPeoId }
      : rootType === 'sg' && selectedSgId ? { type: 'sg', id: selectedSgId }
      : rootType === 'cmo' && selectedCmoId ? { type: 'cmo', id: selectedCmoId }
      : rootType === 'curriculum' && selectedCurriculumId ? { type: 'curriculum', id: selectedCurriculumId }
      : rootType === 'program' && selectedProgramId ? { type: 'program', id: selectedProgramId }
      : null
    if (current) setNavStack((prev) => [...prev, current])
  }, [rootType, selectedCourseId, selectedCloId, selectedPoId, selectedPeoId, selectedSgId, selectedCmoId, selectedCurriculumId, selectedProgramId])

  const gotoPoRoot = useCallback((poId: string) => {
    pushTrail()
    setRootType('po')
    setSelectedPoId(poId)
    setShowGraph(true)
    setGraphError('')
  }, [pushTrail])

  const gotoSubjectRoot = useCallback((courseId: string) => {
    pushTrail()
    setRootType('subject')
    setSelectedCourseId(courseId)
    setShowGraph(true)
    setGraphError('')
  }, [pushTrail])

  const gotoPeoRoot = useCallback((peoId: string) => {
    pushTrail()
    setRootType('peo')
    setSelectedPeoId(peoId)
    setShowGraph(true)
    setGraphError('')
  }, [pushTrail])

  const gotoCloRoot = useCallback((cloId: string) => {
    pushTrail()
    setRootType('clo')
    setSelectedCloId(cloId)
    setShowGraph(true)
    setGraphError('')
  }, [pushTrail])

  const gotoSgRoot = useCallback((sgId: string) => {
    pushTrail()
    setRootType('sg')
    setSelectedSgId(sgId)
    setShowGraph(true)
    setGraphError('')
  }, [pushTrail])

  const gotoCmoRoot = useCallback((cmoId: string) => {
    pushTrail()
    setRootType('cmo')
    setSelectedCmoId(cmoId)
    setShowGraph(true)
    setGraphError('')
  }, [pushTrail])

  // Step back one root in the travel trail — undoing the last click-to-re-root.
  // The previous root replaces the current one, which is simply dropped, so
  // repeated Back presses walk the trail one step at a time.
  const goBack = useCallback(() => {
    const target = navStack[navStack.length - 1]
    if (!target) return
    setRootType(target.type)
    if (target.type === 'subject') setSelectedCourseId(target.id)
    else if (target.type === 'clo') setSelectedCloId(target.id)
    else if (target.type === 'peo') setSelectedPeoId(target.id)
    else if (target.type === 'sg') setSelectedSgId(target.id)
    else if (target.type === 'cmo') setSelectedCmoId(target.id)
    else if (target.type === 'curriculum') setSelectedCurriculumId(target.id)
    else if (target.type === 'program') setSelectedProgramId(target.id)
    else setSelectedPoId(target.id)
    setNavStack(navStack.slice(0, -1))
    setShowGraph(true)
    setGraphError('')
  }, [navStack])

  // ── D3 force simulation — Observable-style (width 928 / height 680) ───────
  // ── Render the OBE Curriculum Map (the curriculum root's default) ──────────
  // A fixed timetable layout, deliberately not force-driven: every subject
  // stands in its "Year · Semester" column, colored by year (purple → yellow),
  // cross-linked to the other subjects that feed the same program outcome and
  // to that outcome itself in the PGO column on the right. The PGO / PI
  // selects above the canvas narrow the picture; Reset View clears them and
  // reframes. Layout never needs physics — only the zoom is live.
  const renderCurriculumMap = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !datasets || !selectedCurriculum) return () => {}
    const map = buildCurriculumMapModel(datasets, selectedCurriculum)

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    const viewW = containerSize.w || svgEl.clientWidth || 928
    const viewH = containerSize.h || svgEl.clientHeight || 680

    interface MapNode {
      id: string
      kind: 'subject' | 'po'
      code: string
      title: string
      courseId?: string
      poId?: string
      color: string
      dim: boolean
      x: number
      y: number
      r: number
    }
    interface MapLink { source: string; target: string; dim: boolean }

    const COL_W = 200
    const ROW_H = 46
    const MARGIN_X = 70
    const RULE_Y = 30
    const FIRST_ROW_Y = 58

    const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
    const ordOf = (n: number) => ordinals[n - 1] ?? `${n}th`
    const semLabel = (s: number) => (s === 1 ? '1st Sem' : s === 2 ? '2nd Sem' : 'Off Sem')
    const maxYear = map.maxYear
    // Sequential year palette, purple → yellow like the OBE maps faculty are
    // used to reading. Unplaced subjects stay neutral gray.
    const yearColor = (year: number | null): string => {
      if (!year) return '#94a3b8'
      const t = maxYear <= 1 ? 0.5 : (year - 1) / (maxYear - 1)
      return d3.interpolateViridis(t)
    }

    type MapColumn = { key: string; label: string }
    const columns: MapColumn[] = []
    for (let y = 1; y <= maxYear; y += 1) {
      for (let s = 1; s <= 3; s += 1) {
        columns.push({ key: `y${y}s${s}`, label: `${ordOf(y)} Year · ${semLabel(s)}` })
      }
    }
    // Subjects with no recorded term (or an out-of-range semester) share one
    // trailing catch-all column, then the outcome vocabulary closes the map.
    const placedOf = (s: { year: number | null; sem: number | null }): string | null => {
      if (!s.year) return null
      const sem = s.sem && s.sem >= 1 && s.sem <= 3 ? s.sem : null
      return sem ? `y${s.year}s${sem}` : null
    }
    if (map.subjects.some((s) => !placedOf(s))) {
      columns.push({ key: 'no-term', label: 'No term recorded' })
    }
    columns.push({ key: 'pgo', label: 'PGO' })

    const colIndexOf = (key: string) => columns.findIndex((c) => c.key === key)
    const colX = (key: string) => MARGIN_X + colIndexOf(key) * COL_W
    const legendX = colX('pgo') + 128

    const buckets = new Map<string, typeof map.subjects>()
    for (const col of columns) {
      if (col.key === 'pgo') continue
      buckets.set(
        col.key,
        map.subjects.filter((s) => placedOf(s) === col.key),
      )
    }
    const rows = Math.max(
      1,
      ...Array.from(buckets.values()).map((list) => list.length),
      map.pos.length,
    )
    const contentH = FIRST_ROW_Y + rows * ROW_H + 42
    const totalW = legendX + 40

    // Filter rules: the chosen PGO by normalized code, the chosen PI by clo id.
    const poKeyById = new Map(map.pos.map((p) => [p.id, normalizeCode(p.code)]))
    const activePoKey = mapPoId ? poKeyById.get(mapPoId) ?? null : null
    const subjectOf = new Map(map.subjects.map((s) => [s.courseId, s]))
    // A subject stays lit when it feeds the selected PGO *and* — once a PI is
    // picked — teaches that specific indicator. Everything else sits dim.
    const dimSubject = (s: typeof map.subjects[number]): boolean =>
      (activePoKey !== null && !s.poKeys.has(activePoKey)) ||
      (mapCloId !== '' && !s.cloIds.includes(mapCloId))

    const nodes: MapNode[] = []
    for (const [key, list] of buckets) {
      const x0 = colX(key)
      list.forEach((s, i) => {
        nodes.push({
          id: `course-${s.courseId}`,
          kind: 'subject',
          code: s.code,
          title: s.title,
          courseId: s.courseId,
          color: yearColor(s.year),
          dim: dimSubject(s),
          x: x0,
          y: FIRST_ROW_Y + i * ROW_H,
          r: 7,
        })
      })
    }
    const poNodes: MapNode[] = map.pos.map((p, i) => ({
      id: `po-${p.id}`,
      kind: 'po',
      code: p.code,
      title: p.title,
      poId: p.id,
      color: colorMap.po as string,
      dim: activePoKey !== null && p.id !== mapPoId,
      x: colX('pgo'),
      y: FIRST_ROW_Y + i * ROW_H,
      r: 8,
    }))
    const allNodes = [...nodes, ...poNodes]
    const nodeById = new Map(allNodes.map((n) => [n.id, n]))

    const links: MapLink[] = []
    const seenEdge = new Set<string>()
    const pushEdge = (a: MapNode, b: MapNode, dim: boolean) => {
      const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seenEdge.has(pair)) return
      seenEdge.add(pair)
      links.push({ source: a.id, target: b.id, dim })
    }
    // Subject ↔ subject: every pair whose CLOs feed the same outcome. With a
    // PGO chosen, only that outcome's constellation stays lit.
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      const aRec = subjectOf.get(a.courseId ?? '')
      if (!aRec) continue
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        const bRec = subjectOf.get(b.courseId ?? '')
        if (!bRec) continue
        let shared = false
        for (const k of aRec.poKeys) {
          if (bRec.poKeys.has(k)) { shared = true; break }
        }
        if (!shared) continue
        const dim =
          (activePoKey !== null && !(aRec.poKeys.has(activePoKey) && bRec.poKeys.has(activePoKey))) ||
          a.dim || b.dim
        pushEdge(a, b, dim)
      }
    }
    // Subject → PGO: the outcome itself, drawn from the same CLO evidence.
    for (const a of nodes) {
      const aRec = subjectOf.get(a.courseId ?? '')
      if (!aRec) continue
      for (const k of aRec.poKeys) {
        const poNode = poNodes.find((p) => normalizeCode(p.code) === k)
        if (!poNode) continue
        pushEdge(a, poNode, activePoKey !== null && poNode.id !== mapPoId)
      }
    }

    svg
      .attr('width', viewW)
      .attr('height', viewH)
      .attr('viewBox', [-24, -16, totalW, contentH] as unknown as string)
      .attr('style', 'max-width: 100%; height: auto;')

    const defs = svg.append('defs')
    defs.append('filter')
      .attr('id', 'subject-view-shadow')
      .attr('x', '-60%').attr('y', '-60%')
      .attr('width', '220%').attr('height', '220%')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 2.5)
      .attr('flood-color', 'rgba(15, 23, 42, 0.28)')

    const zoomGroup = svg.append('g')

    // Column headers + hairline rule, like the reference map's year bands.
    for (const col of columns) {
      const x = colX(col.key)
      zoomGroup.append('text')
        .attr('x', x).attr('y', RULE_Y - 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11.5px')
        .attr('font-weight', '600')
        .attr('fill', '#94a3b8')
        .text(col.label)
      zoomGroup.append('line')
        .attr('x1', x - COL_W / 2 + 14).attr('x2', x + COL_W / 2 - 14)
        .attr('y1', RULE_Y).attr('y2', RULE_Y)
        .attr('stroke', '#e2e8f0').attr('stroke-width', 1)
    }

    // Year legend chips (1st yr … Nth yr) beside the PGO column.
    for (let y = 1; y <= maxYear; y += 1) {
      const ly = FIRST_ROW_Y - 22 + (y - 1) * 26
      zoomGroup.append('rect')
        .attr('x', legendX).attr('y', ly).attr('width', 15).attr('height', 15)
        .attr('rx', 3).attr('fill', yearColor(y))
      zoomGroup.append('text')
        .attr('x', legendX + 22).attr('y', ly + 11.5)
        .attr('font-size', '10.5px').attr('font-weight', '600')
        .attr('fill', '#64748b')
        .text(`${ordOf(y)} yr`)
    }

    const link = zoomGroup.append('g')
      .selectAll<SVGLineElement, MapLink>('line')
      .data(links)
      .join('line')
      .attr('x1', (d) => nodeById.get(d.source)!.x)
      .attr('y1', (d) => nodeById.get(d.source)!.y)
      .attr('x2', (d) => nodeById.get(d.target)!.x)
      .attr('y2', (d) => nodeById.get(d.target)!.y)
      .attr('stroke', (d) => (nodeById.get(d.target)!.kind === 'po' ? '#3b82f6' : '#93c5fd'))
      .attr('stroke-width', 1.1)
      .attr('stroke-opacity', (d) => (d.dim ? 0.08 : 0.55))
    const visibleLinks = links.filter((l) => !l.dim).length

    const nodeGroup = zoomGroup.append('g').attr('stroke', '#fff').attr('stroke-width', 1.5)
    const checkedRing = nodeGroup
      .selectAll<SVGCircleElement, MapNode>('circle.subject-view__ring')
      .data(allNodes, (d) => d.id)
      .join(
        (enter) => enter.append('circle')
          .attr('class', 'subject-view__ring')
          .classed('subject-view__ring--on', (d) => focusedIdRef.current === d.id),
        (update) => update,
      )
      .attr('fill', 'none')
      .attr('stroke-width', 2.5)
      .attr('r', (d) => d.r + 6)
      .attr('pointer-events', 'none')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)

    const node = nodeGroup
      .selectAll<SVGCircleElement, MapNode>('circle:not(.subject-view__ring)')
      .data(allNodes, (d) => d.id)
      .join((enter) => enter.append('circle').attr('class', 'subject-view__node'), (update) => update)
      .attr('r', (d) => d.r)
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('fill', (d) => d.color)
      .attr('opacity', (d) => (d.dim ? 0.22 : 1))
      .attr('cursor', 'pointer')
      .attr('filter', 'url(#subject-view-shadow)')

    node.append('title').text((d) => `${d.code} — ${d.title}`)

    const label = zoomGroup.append('g')
      .selectAll<SVGTextElement, MapNode>('text')
      .data(allNodes, (d) => d.id)
      .join('text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y - 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('fill', '#0f172a')
      .attr('opacity', (d) => (d.dim ? 0.25 : 1))
      .attr('pointer-events', 'none')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'rgba(255,255,255,0.85)')
      .attr('stroke-width', '3')
      .text((d) => (d.code.length > 14 ? `${d.code.slice(0, 13)}…` : d.code))

    const mapCaption = `${map.subjects.length} subject${map.subjects.length === 1 ? '' : 's'} · `
      + `${visibleLinks} connection${visibleLinks === 1 ? '' : 's'} · click a subject or PGO to view its graph`
    zoomGroup.append('text')
      .attr('x', MARGIN_X).attr('y', contentH - 22)
      .attr('font-size', '11px')
      .attr('fill', '#94a3b8')
      .text(mapCaption)

    const neighborsOf = new Map<string, Set<string>>()
    for (const l of links) {
      if (!neighborsOf.has(l.source)) neighborsOf.set(l.source, new Set())
      if (!neighborsOf.has(l.target)) neighborsOf.set(l.target, new Set())
      neighborsOf.get(l.source)!.add(l.target)
      neighborsOf.get(l.target)!.add(l.source)
    }

    node
      .on('mouseenter', (event, d) => {
        const near = neighborsOf.get(d.id) ?? new Set<string>()
        node.classed('subject-view__node--highlight', (n) => near.has(n.id))
        link.classed('subject-view__link--highlight', (l) => l.source === d.id || l.target === d.id)
        tip.style.opacity = '1'
        tip.style.left = `${event.offsetX + 12}px`
        tip.style.top = `${event.offsetY - 28}px`
        tip.innerHTML = `<strong>${d.code}</strong><br/>${d.title}<br/><em>Click to view as root</em>`
      })
      .on('mousemove', (event) => {
        tip.style.left = `${event.offsetX + 12}px`
        tip.style.top = `${event.offsetY - 28}px`
      })
      .on('mouseleave', () => {
        node.classed('subject-view__node--highlight', false)
        link.classed('subject-view__link--highlight', false)
        tip.style.opacity = '0'
      })

    node.on('click', (event, d) => {
      event.stopPropagation()
      setInspectedNodeId(d.id)
      if (d.kind === 'po' && d.poId) gotoPoRoot(d.poId)
      else if (d.kind === 'subject' && d.courseId) gotoSubjectRoot(d.courseId)
    })

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => zoomGroup.attr('transform', event.transform))
    svg.call(zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>)
    zoomRef.current = zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>

    return () => {
      svg.on('.zoom', null)
      zoomRef.current = null
    }
  }, [containerSize, datasets, selectedCurriculum, mapPoId, mapCloId, buildCurriculumMapModel, gotoPoRoot, gotoSubjectRoot])

  // Dual-root: subject mode (subject → curriculum / prereq / coreq / CLO → PO
  // → PEO/SG/CMO) or PO mode (PO → CLOs → subjects + PEO/SG/CMO), with the
  // existing collapse/expand and zoom behavior preserved.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !datasets) return () => {}
    if (rootType === 'subject' && !selectedCourse) return () => {}
    if (rootType === 'po' && !selectedPo) return () => {}
    if (rootType === 'peo' && !selectedPeo) return () => {}
    if (rootType === 'curriculum' && selectedCurriculum) {
      // The curriculum root's default visualization is the OBE Curriculum
      // Map — a real year·semester timetable layout, drawn by the dedicated
      // renderer above instead of this force tree.
      return renderCurriculumMap()
    }

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    // Dimensions as per the example — responsive via containerSize
    const width = 928
    const height = 680
    const viewW = containerSize.w || svgEl.clientWidth || width
    const viewH = containerSize.h || svgEl.clientHeight || height

    // Color scale exactly as in the example (schemeCategory10)
    const color = d3.scaleOrdinal(d3.schemeCategory10)

    // ── Build hierarchy + flatten with expand/collapse (same pathKey trick) ──
    interface ForceNode extends d3.SimulationNodeDatum {
      id: string
      rId: string
      code: string
      title: string
      kind: NodeKind
      placeholder: boolean
      courseId?: string
      poId?: string
      peoId?: string
      sgId?: string
      cmoId?: string
      cloId?: string
      group: number
      expandable: boolean
      collapsed: boolean
    }
    interface ForceLink extends d3.SimulationLinkDatum<ForceNode> {
      source: ForceNode
      target: ForceNode
      dashed: boolean
      value: number
    }

    const pathKey = (d: d3.HierarchyNode<GraphNodeData>): string => {
      const parts: string[] = []
      let cur: d3.HierarchyNode<GraphNodeData> | null = d
      while (cur) { parts.unshift(cur.data.id); cur = cur.parent }
      return parts.join('>')
    }

    const kindGroup: Record<NodeKind, number> = {
      curriculum: 0,
      subject: 1,
      prerequisite: 2,
      corequisite: 3,
      clo: 4,
      po: 5,
      peo: 6,
      sg: 7,
      cmo: 8,
    }

    const data = rootType === 'subject' && selectedCourse
      ? buildGraphModel(datasets, selectedCourse)
      : rootType === 'clo' && selectedClo
        ? buildCloGraphModel(datasets, selectedClo)
        : rootType === 'po' && selectedPo
          ? buildPoGraphModel(datasets, selectedPo)
          : rootType === 'peo' && selectedPeo
            ? buildPeoGraphModel(datasets, selectedPeo)
            : rootType === 'sg' && selectedSg
              ? buildSgGraphModel(datasets, selectedSg)
              : rootType === 'cmo' && selectedCmo
                ? buildCmoGraphModel(datasets, selectedCmo)
                : rootType === 'curriculum' && selectedCurriculum
                  ? buildCurriculumGraphModel(datasets, selectedCurriculum)
                  : rootType === 'program' && selectedProgram
                    ? buildProgramGraphModel(datasets, selectedProgram)
                    : null
    if (!data) return () => {}
    const rootId = data.id
    const root = d3.hierarchy<GraphNodeData>(data, (d) =>
      isNodeCollapsed(d.id, d.kind) ? undefined : d.children
    )

    // Tree layout for initial left-to-right positions (subject on left, branches right)
    // Fixed branching: wider separation so sibling branches don't collapse
    const treeLayout = d3.tree<GraphNodeData>()
      .nodeSize([110, 190])
      .separation((a, b) => (a.parent === b.parent ? 1.2 : 1.9))
    treeLayout(root)
    const initialPos = new Map<string, { x: number; y: number }>()
    root.each((d) => {
      const rId = pathKey(d)
      // Horizontal: y = depth (goes right), x = breadth (vertical)
      // Shift so subject starts near left edge (-width/2+80), vertically centered
      const hx = -width / 2 + 80 + (d.y ?? 0)
      const vy = (d.x ?? 0)
      initialPos.set(rId, { x: hx, y: vy })
    })
    // Center vertically around 0 for the force's centered viewBox
    const ys = Array.from(initialPos.values()).map((p) => p.y)
    const yOffset = ys.length ? -(Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) / 2) : 0

    const hierarchyNodes = root.descendants()
    const hierarchyLinks = root.links()

    const nodes: ForceNode[] = hierarchyNodes.map((d) => {
      const rId = pathKey(d)
      const pos = initialPos.get(rId) ?? { x: 0, y: 0 }
      return {
        id: d.data.id,
        rId,
        code: d.data.code,
        title: d.data.title,
        kind: d.data.kind,
        placeholder: d.data.placeholder,
        courseId: d.data.courseId,
        poId: d.data.poId,
        peoId: d.data.peoId,
        sgId: d.data.sgId,
        cmoId: d.data.cmoId,
        cloId: d.data.cloId,
        group: kindGroup[d.data.kind] ?? 4,
        expandable: !!(d.data.children && d.data.children.length > 0),
        collapsed: isNodeCollapsed(d.data.id, d.data.kind),
        x: pos.x,
        y: pos.y + yOffset,
      }
    })
    const nodeByRId = new Map(nodes.map((n) => [n.rId, n]))
    const links: ForceLink[] = hierarchyLinks.map((l) => ({
      source: nodeByRId.get(pathKey(l.source))!,
      target: nodeByRId.get(pathKey(l.target))!,
      dashed: l.target.data.kind === 'corequisite' || l.target.data.placeholder,
      value: 1,
    }))

    // Create a copy so re-evaluating produces the same result (as per example)
    const simNodes = nodes.map((d) => ({ ...d })) as ForceNode[]
    const simNodeByRId = new Map(simNodes.map((n) => [n.rId, n]))
    const simLinks: ForceLink[] = links.map((l) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: simNodeByRId.get((l.source as ForceNode).rId)! as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: simNodeByRId.get((l.target as ForceNode).rId)! as any,
      dashed: l.dashed,
      value: l.value,
    }))

    // Root fixed on the left, branches flow to the right (subject or PO root)
    const rootSim = simNodes.find((n) => n.id === rootId) ?? simNodes[0]
    if (rootSim) {
      rootSim.fx = -width / 2 + 80
      rootSim.fy = 0
    }

    // Branching fix: tiered link distances so root→CLO/PO fan out, PO→leaves stay tight,
    // plus collide + weaker charge to keep sibling branches from overlapping.
    const linkDistance = (d: ForceLink) => {
      const targetKind = (d.target as ForceNode).kind
      if (targetKind === 'po' || targetKind === 'clo') return 120
      if (targetKind === 'curriculum' || targetKind === 'prerequisite' || targetKind === 'corequisite') return 95
      return 75
    }
    const simulation = d3.forceSimulation<ForceNode>(simNodes)
      .force('link', d3.forceLink<ForceNode, ForceLink>(simLinks).id((d) => d.rId).distance((d) => linkDistance(d as ForceLink)).strength(0.85))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('x', d3.forceX(60).strength(0.08))
      .force('y', d3.forceY(0).strength(0.12))
      .force('collide', d3.forceCollide<ForceNode>().radius((d) => (d.kind === 'subject' ? 22 : d.kind === 'po' || d.kind === 'clo' ? 16 : 12)).strength(0.7))

    // SVG container as per the example
    svg
      .attr('width', viewW)
      .attr('height', viewH)
      .attr('viewBox', [-width / 2, -height / 2, width, height] as unknown as string)
      .attr('style', 'max-width: 100%; height: auto;')

    // Defs: subtle shadow
    const defs = svg.append('defs')
    defs.append('filter')
      .attr('id', 'subject-view-shadow')
      .attr('x', '-60%').attr('y', '-60%')
      .attr('width', '220%').attr('height', '220%')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 2.5)
      .attr('flood-color', 'rgba(15, 23, 42, 0.28)')

    const zoomGroup = svg.append('g')

    // Links as <line> (exactly as in the example, with our dashed + color tweaks)
    const link = zoomGroup.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll<SVGLineElement, ForceLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke-width', (d) => Math.sqrt(d.value) * 1.5)
      .attr('stroke-dasharray', (d) => (d.dashed ? '6 4' : 'none'))
      .attr('stroke', (d) => ((d.target as ForceNode).placeholder ? '#a5b4c8' : '#999'))

    // Nodes as <circle> groups with outer <g> for labels/badges — keeps drag on the circle
    const nodeGroup = zoomGroup.append('g')
      .attr('class', 'subject-view__nodes')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    // Circle radius per node kind. A root reads larger than its kind so the
    // focus of the map is obvious (a PO root would otherwise be 8 like any PO).
    const nodeRadius = (d: ForceNode) => {
      if (d.id === rootId) return 14
      if (d.kind === 'subject') return 14
      if (d.kind === 'curriculum') return 12
      if (d.kind === 'po' || d.kind === 'clo') return 8
      return 5
    }

    // Outer ring layer, one per node, drawn before the circles so only the band
    // around them shows — an actual double ring rather than a thicker stroke.
    // The ring for the focused node is lit here, at creation: this effect wipes
    // and rebuilds the SVG on resize / collapse / root change, and the separate
    // inspection effect only re-runs when the focus itself changes, so a rebuilt
    // map would otherwise come up with every ring dark.
    // Both classes are set in the enter function only — a blanket .attr('class', …)
    // would also rewrite on update and wipe --on.
    const checkedRing = nodeGroup
      .selectAll<SVGCircleElement, ForceNode>('circle.subject-view__ring')
      .data(simNodes, (d) => d.rId)
      .join(
        (enter) => enter.append('circle')
          .attr('class', 'subject-view__ring')
          .classed('subject-view__ring--on', (d: ForceNode) => focusedIdRef.current === d.id),
        (update) => update,
      )
      .attr('fill', 'none')
      .attr('stroke-width', 2.5)
      .attr('r', (d) => nodeRadius(d) + 6)
      .attr('pointer-events', 'none')

    // `:not(.subject-view__ring)` keeps the ring layer out of this selection.
    const node = nodeGroup
      .selectAll<SVGCircleElement, ForceNode>('circle:not(.subject-view__ring)')
      .data(simNodes, (d) => d.rId)
      .join((enter) => enter.append('circle').attr('class', 'subject-view__node'), (update) => update)
      .attr('r', nodeRadius)
      .attr('fill', (d) => (d.placeholder ? '#f8fafc' : (colorMap[d.kind] as string) || color(String(d.group))))
      .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : '#fff'))
      .attr('cursor', (d) => (d.expandable || d.courseId || (d.kind === 'po' && d.poId) || (d.kind === 'peo' && d.peoId) || (d.kind === 'clo' && d.cloId) || (d.kind === 'sg' && d.sgId) || (d.kind === 'cmo' && d.cmoId) ? 'pointer' : 'grab'))
      .attr('filter', 'url(#subject-view-shadow)')

    node.append('title').text((d) => `${d.code} — ${d.title}`)

    // Text labels beside each node (code) — not in the minimal example, but useful for the outcome map
    const label = zoomGroup.append('g')
      .selectAll<SVGTextElement, ForceNode>('text')
      .data(simNodes, (d) => d.rId)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (d.id === rootId || d.kind === 'subject' ? 26 : d.kind === 'curriculum' ? 22 : 16))
      .attr('font-size', (d) => (d.id === rootId || d.kind === 'subject' ? '11px' : '9px'))
      .attr('font-weight', '700')
      .attr('fill', '#0f172a')
      .attr('pointer-events', 'none')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'rgba(255,255,255,0.85)')
      .attr('stroke-width', '3')
      .text((d) => {
        const max = d.kind === 'subject' ? 14 : 10
        return d.code.length > max ? d.code.slice(0, max - 1) + '…' : d.code
      })

    // Expand/collapse badge — tiny +/− circle near the node (never on the root)
    const badge = zoomGroup.append('g')
      .selectAll<SVGGElement, ForceNode>('g')
      .data(simNodes.filter((d) => d.expandable && d.id !== rootId), (d) => d.rId)
      .join('g')
      .attr('pointer-events', 'none')

    badge.append('circle')
      .attr('r', 7)
      .attr('fill', '#fff')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.2)

    badge.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.32em')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('fill', '#334155')
      .text((d) => (d.collapsed ? '+' : '−'))

    // Tick — keep links, circles, labels, badges in sync (core of the example)
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as ForceNode).x ?? 0)
        .attr('y1', (d) => (d.source as ForceNode).y ?? 0)
        .attr('x2', (d) => (d.target as ForceNode).x ?? 0)
        .attr('y2', (d) => (d.target as ForceNode).y ?? 0)

      node
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0)

      checkedRing
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0)

      label
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => d.y ?? 0)

      badge
        .attr('transform', (d) => `translate(${(d.x ?? 0) + 10},${(d.y ?? 0) - 10})`)
    })

    // Drag behavior exactly as in the example (reheat, fix fx/fy, release)
    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, ForceNode, ForceNode>, d: ForceNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }
    function dragged(event: d3.D3DragEvent<SVGCircleElement, ForceNode, ForceNode>, d: ForceNode) {
      d.fx = event.x
      d.fy = event.y
    }
    function dragended(event: d3.D3DragEvent<SVGCircleElement, ForceNode, ForceNode>, d: ForceNode) {
      if (!event.active) simulation.alphaTarget(0)
      if (d.id === rootId) {
        d.fx = -width / 2 + 80
        d.fy = 0
      } else {
        d.fx = null
        d.fy = null
      }
    }

    node.call(
      d3.drag<SVGCircleElement, ForceNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as unknown as d3.DragBehavior<SVGCircleElement, ForceNode, unknown>
    )

    // Hover — keep the custom tooltip + highlight
    const highlightConnections = (d: ForceNode) => {
      const connectedIds = new Set<string>()
      simLinks.forEach((l) => {
        const s = l.source as ForceNode
        const t = l.target as ForceNode
        if (s.rId === d.rId) connectedIds.add(t.rId)
        else if (t.rId === d.rId) connectedIds.add(s.rId)
      })
      node.classed('subject-view__node--highlight', (n) => connectedIds.has(n.rId))
      link.classed('subject-view__link--highlight', (l) => {
        const s = l.source as ForceNode, t = l.target as ForceNode
        return s.rId === d.rId || t.rId === d.rId
      })
    }

    node
      .on('mouseenter', (event, d) => {
        highlightConnections(d)
        tip.style.opacity = '1'
        tip.style.left = `${event.offsetX + 12}px`
        tip.style.top = `${event.offsetY - 28}px`
        const canReroot =
          (d.kind === 'po' && d.poId && !(rootType === 'po' && d.id === rootId)) ||
          (d.kind === 'subject' && d.courseId && !(rootType === 'subject' && d.id === rootId)) ||
          (d.kind === 'peo' && d.peoId && !(rootType === 'peo' && d.id === rootId)) ||
          (d.kind === 'clo' && d.cloId && !(rootType === 'clo' && d.id === rootId)) ||
          (d.kind === 'sg' && d.sgId && !(rootType === 'sg' && d.id === rootId)) ||
          (d.kind === 'cmo' && d.cmoId && !(rootType === 'cmo' && d.id === rootId))
        tip.innerHTML = `<strong>${d.code}</strong><br/>${d.title}${canReroot ? '<br/><em>Click to view as root</em>' : ''}<br/><em>Click to see its connections</em>`
      })
      .on('mousemove', (event) => {
        tip.style.left = `${event.offsetX + 12}px`
        tip.style.top = `${event.offsetY - 28}px`
      })
      .on('mouseleave', () => {
        node.classed('subject-view__node--highlight', false)
        link.classed('subject-view__link--highlight', false)
        tip.style.opacity = '0'
      })

    // Click — cross-root re-root + drill-down + expand/collapse on force nodes
    node.on('click', (event, d) => {
      event.stopPropagation()
      // Every click inspects, recorded before any re-root below: the
      // connected-details card describes whatever was clicked, including the
      // expandable Curriculum/CLO nodes that have no re-root of their own.
      // Re-rooting clears this again (see the root-change effect), so the card
      // and the tree never disagree about what "current" means.
      setInspectedNodeId(d.id)
      // PO node → re-root visualization at that PO (works from subject graph
      // and from upstream CLO branches inside a PO graph).
      if (d.kind === 'po' && d.poId && !d.placeholder) {
        if (!((rootType === 'po' && d.id === rootId))) {
          gotoPoRoot(d.poId)
          return
        }
      }
      // PEO node → re-root visualization at that PEO (works from any graph).
      if (d.kind === 'peo' && d.peoId && !d.placeholder) {
        if (!((rootType === 'peo' && d.id === rootId))) {
          gotoPeoRoot(d.peoId)
          return
        }
      }
      // CLO node → re-root at that learning outcome (evidence-first view).
      if (d.kind === 'clo' && d.cloId && !d.placeholder) {
        if (!((rootType === 'clo' && d.id === rootId))) {
          gotoCloRoot(d.cloId)
          return
        }
      }
      // SG node → re-root at that strategic goal (deep-linked from any graph).
      if (d.kind === 'sg' && d.sgId && !d.placeholder) {
        if (!((rootType === 'sg' && d.id === rootId))) {
          gotoSgRoot(d.sgId)
          return
        }
      }
      // CMO node → re-root at that memorandum (deep-linked from any graph).
      if (d.kind === 'cmo' && d.cmoId && !d.placeholder) {
        if (!((rootType === 'cmo' && d.id === rootId))) {
          gotoCmoRoot(d.cmoId)
          return
        }
      }
      // Subject leaf (prereq / coreq / PO-graph subject) → jump to that subject.
      if (d.courseId && !d.expandable) {
        const target = courses.find((c) => c.id === d.courseId)
        if (target && target.id !== selectedCourseId) {
          gotoSubjectRoot(target.id)
        }
        return
      }
      if (d.expandable) {
        toggleNode(d.id, d.kind)
      }
    })

    // Zoom / pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => zoomGroup.attr('transform', event.transform))
    svg.call(zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>)
    zoomRef.current = zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>

    return () => {
      simulation.stop()
      svg.on('.zoom', null)
      zoomRef.current = null
    }
  }, [rootType, selectedCourse, selectedClo, selectedPo, selectedPeo, selectedSg, selectedCmo, selectedCurriculum, selectedProgram, datasets, containerSize, collapsedIds, isNodeCollapsed, toggleNode, buildGraphModel, buildCloGraphModel, buildPoGraphModel, buildPeoGraphModel, buildSgGraphModel, buildCmoGraphModel, buildCurriculumGraphModel, buildProgramGraphModel, courses, selectedCourseId, gotoPoRoot, gotoSubjectRoot, gotoPeoRoot, gotoCloRoot, gotoSgRoot, gotoCmoRoot, renderCurriculumMap])

  // The node the connected-details card is describing: an inspected branch when
  // the user has picked one, otherwise the root. Falls back to the root so there
  // is always exactly one checked circle — including after a re-root, which is
  // when inspectedNodeId gets cleared.
  const focusedId = inspectedNodeId ?? activeModel?.id ?? null
  // Assigned during render, which always runs before any effect — so the render
  // effect above reads the current focus even though it does not depend on it.
  focusedIdRef.current = focusedId

  // Lights the checked ring around that node. Deliberately a separate effect
  // from the render above: adding the focus to that dependency list would tear
  // down and rebuild the entire force simulation on every click, throwing away
  // node positions. Toggling one class leaves the layout alone.
  // Typed structurally rather than as ForceNode — that interface is declared
  // inside the render effect and is not visible out here; only the id matters.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !focusedId) return
    d3.select(svg)
      .selectAll<SVGCircleElement, { id: string }>('circle.subject-view__ring')
      .classed('subject-view__ring--on', (d) => d.id === focusedId)
  }, [focusedId, showGraph])

  // ResizeObserver keeps the SVG sized responsively.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setContainerSize((prev) => {
        const w = el.clientWidth
        const h = el.clientHeight
        return prev.w === w && prev.h === h ? prev : { w, h }
      })
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [showGraph, datasets, isFullscreen])

  // Render the graph once everything is ready.
  useEffect(() => {
    if (!showGraph || !datasets) return
    if (rootType === 'subject' && !selectedCourse) return
    if (rootType === 'clo' && !selectedClo) return
    if (rootType === 'po' && !selectedPo) return
    if (rootType === 'peo' && !selectedPeo) return
    if (rootType === 'sg' && !selectedSg) return
    if (rootType === 'cmo' && !selectedCmo) return
    if (rootType === 'curriculum' && !selectedCurriculum) return
    if (rootType === 'program' && !selectedProgram) return
    try {
      return renderGraph()
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to render graph.')
      return undefined
    }
  }, [showGraph, rootType, selectedCourse, selectedClo, selectedPo, selectedPeo, selectedSg, selectedCmo, selectedCurriculum, selectedProgram, datasets, containerSize, renderGraph, setGraphError])

  const handleView = async () => {
    if (!rootType) return
    if (rootType === 'subject' && !selectedCourse) return
    if (rootType === 'clo' && !selectedCloId) return
    if (rootType === 'po' && !selectedPoId) return
    if (rootType === 'peo' && !selectedPeoId) return
    if (rootType === 'sg' && !selectedSgId) return
    if (rootType === 'cmo' && !selectedCmoId) return
    if (rootType === 'curriculum' && !selectedCurriculumId) return
    if (rootType === 'program' && !selectedProgramId) return
    setShowGraph(true)
    // Every generated graph reads like the reference dashboard: it opens full
    // screen right away (Esc / Exit fullscreen steps back to the panel).
    setIsFullscreen(true)
    setGraphError('')
    await loadDatasets()
    // Logged after the data is in hand so the audit RPC never sits in front of
    // the graph. addActivityLog() swallows its own errors (console.warn only),
    // so a failed insert cannot break the visualization.
    //
    // Only the Visualization button is logged. Re-rooting by clicking a PO or
    // PEO node inside an open graph is browsing within one run, not a new run,
    // and logging every click would bury the log in one browsing session's
    // worth of entries.
    const root =
      rootType === 'subject' && selectedCourse
        ? { action: 'course.viewed', entity: 'course', entity_id: selectedCourse.id, label: `${selectedCourse.code} — ${selectedCourse.title}` }
        : rootType === 'clo' && selectedClo
          ? { action: 'course_learning_outcome.viewed', entity: 'course_learning_outcome', entity_id: selectedClo.id, label: `${selectedClo.code} — ${selectedClo.description || ''}`.trim() }
          : rootType === 'po' && selectedPo
            ? { action: 'program_outcome.viewed', entity: 'program_outcome', entity_id: selectedPo.id, label: `${selectedPo.code} — ${selectedPo.title}` }
            : rootType === 'peo' && selectedPeo
              ? { action: 'peo.viewed', entity: 'peo', entity_id: selectedPeo.id, label: `${selectedPeo.code} — ${selectedPeo.title}` }
              : rootType === 'sg' && selectedSg
                ? { action: 'strategic_goal.viewed', entity: 'strategic_goal', entity_id: selectedSg.id, label: `${selectedSg.code} — ${selectedSg.title || selectedSg.description || ''}`.trim() }
                : rootType === 'cmo' && selectedCmo
                  ? { action: 'ched_memo_order.viewed', entity: 'ched_memo_order', entity_id: selectedCmo.id, label: `${selectedCmo.code} — ${selectedCmo.title}`.trim() }
                  : rootType === 'curriculum' && selectedCurriculum
                    ? { action: 'curriculum.viewed', entity: 'curriculum', entity_id: selectedCurriculum.id, label: `${selectedCurriculum.code || selectedCurriculum.title} — ${selectedCurriculum.title}` }
                    : rootType === 'program' && selectedProgram
                      ? { action: 'program.viewed', entity: 'program', entity_id: selectedProgram.id, label: `${selectedProgram.code} — ${selectedProgram.name || selectedProgram.code}` }
                      : null
    if (root) await addActivityLog(root.action, root)
  }

  // Full "CODE — name" for the Back button's tooltip: where one step back leads.
  const navEntryTitle = (entry: NavEntry): string => {
    if (entry.type === 'subject') {
      const c = courses.find((x) => x.id === entry.id)
      return c ? `${c.code} — ${c.title}` : 'Unknown subject'
    }
    if (entry.type === 'clo') {
      const c = allClos.find((x) => x.id === entry.id)
      return c ? `${c.code} — ${c.description || ''}`.trim() : 'Unknown learning outcome'
    }
    if (entry.type === 'peo') {
      const p = allPeos.find((x) => x.id === entry.id)
      return p ? `${p.code} — ${p.title}` : 'Unknown PEO'
    }
    if (entry.type === 'sg') {
      const s = allSgs.find((x) => x.id === entry.id)
      return s ? `${s.code} — ${s.title || s.description || s.code}` : 'Unknown goal'
    }
    if (entry.type === 'cmo') {
      const c = allCmos.find((x) => x.id === entry.id)
      return c ? `${c.code} — ${c.title || c.code}` : 'Unknown memorandum'
    }
    if (entry.type === 'curriculum') {
      const r = allCurricula.find((x) => x.id === entry.id)
      return r ? `${r.code || r.title} — ${r.title}` : 'Unknown curriculum'
    }
    if (entry.type === 'program') {
      const pr = programs.find((x) => x.id === entry.id)
      return pr ? `${pr.code} — ${pr.name || pr.code}` : 'Unknown program'
    }
    const p = allPos.find((x) => x.id === entry.id)
    return p ? `${p.code} — ${p.title || p.description}` : 'Unknown outcome'
  }

  const graphTitle = selectedCourse ? `${selectedCourse.code} — ${selectedCourse.title}`
    : selectedClo ? `${selectedClo.code} — ${selectedClo.description || selectedClo.code}`
    : selectedPo ? `${selectedPo.code} — ${selectedPo.title || selectedPo.description}`
    : selectedPeo ? `${selectedPeo.code} — ${selectedPeo.title || selectedPeo.code}`
    : selectedSg ? `${selectedSg.code} — ${selectedSg.title || selectedSg.code}`
    : selectedCmo ? `${selectedCmo.code} — ${selectedCmo.title || selectedCmo.code}`
    : selectedCurriculum ? `${selectedCurriculum.code || selectedCurriculum.title} — ${selectedCurriculum.title}`
    : selectedProgram ? `${selectedProgram.code} — ${selectedProgram.name || selectedProgram.code}`
    : ''
  const graphHint = rootType === 'curriculum'
    ? 'Every subject stands in its Year · Semester column, colored by year (1st purple → last yellow). Lines connect subjects that feed the same program outcome; the right column lists the outcomes themselves. Click a subject or a PGO to view the graph from there. Narrow the picture with the PGO / PI filters, or press Reset View to clear them. Scroll to zoom, drag to pan.'
    : rootType === 'subject'
    ? 'Click any branch node to see what is connected to it in the panel below. Click a PO, CLO, PEO, goal or memorandum to view the graph from there. Click a pre-req or co-req to jump to that subject. Click a curriculum to open its sibling subjects. Drag nodes to reposition. Scroll to zoom. Use Back to undo a re-root.'
    : rootType === 'po'
      ? 'Click any branch node to see what is connected to it in the panel below. Click a subject to view the graph from that subject. Click a PO to switch PO root. Drag nodes to reposition. Scroll to zoom. Use Back to undo a re-root.'
      : 'Click any branch node to see what is connected to it in the panel below. Click a PO to view the graph from that PO. Click a CLO, PEO, strategic goal or CHED memorandum to re-root the graph there. Drag nodes to reposition. Scroll to zoom. Use Back to undo a re-root.'

  // The About area leads with the compact connected-details card for every
  // root, then follows it with the full report document where one exists — the
  // *exact* Curriculum Report document for a subject, through the shared
  // SyllabusReport component (the same one View.tsx renders), reusing the
  // report page's chrome. A PO or a PEO gets only the card.
  // The card follows `inspectedNode`, so it describes whichever branch was last
  // clicked rather than only the root.
  // `datasets` is prefetched on mount, so it is ready before Visualization.
  const detailsCard = (() => {
    if (!datasets || !inspectedNode) return null
    // While the root is in focus, use the source record's own code, title and
    // description verbatim so none of the three root views change. Inspecting a
    // branch below it falls back to that graph node's own code and title.
    const rootProps = (() => {
      if (isInspecting) return null
      if (rootType === 'subject' && selectedCourse) {
        return { heading: selectedCourse.code, title: selectedCourse.title, description: null }
      }
      if (rootType === 'po' && selectedPo) {
        return { heading: selectedPo.code, title: selectedPo.title, description: selectedPo.description }
      }
      if (rootType === 'peo' && selectedPeo) {
        return { heading: selectedPeo.code, title: selectedPeo.title, description: selectedPeo.description }
      }
      if (rootType === 'clo' && selectedClo) {
        return { heading: selectedClo.code, title: selectedClo.description || selectedClo.code, description: selectedClo.description }
      }
      if (rootType === 'sg' && selectedSg) {
        return { heading: selectedSg.code, title: selectedSg.title || selectedSg.description || selectedSg.code, description: selectedSg.description }
      }
      if (rootType === 'cmo' && selectedCmo) {
        return { heading: selectedCmo.code, title: selectedCmo.title || selectedCmo.code, description: selectedCmo.description }
      }
      if (rootType === 'curriculum' && selectedCurriculum) {
        return { heading: selectedCurriculum.code || selectedCurriculum.title, title: selectedCurriculum.title, description: selectedCurriculum.description }
      }
      if (rootType === 'program' && selectedProgram) {
        return { heading: selectedProgram.code, title: selectedProgram.name || selectedProgram.code, description: selectedProgram.description }
      }
      return null
    })()
    const props = rootProps ?? { heading: inspectedNode.code, title: inspectedNode.title, description: null }
    return (
      <OutcomeDetailsCard
        {...props}
        groups={inspectedConnected}
        inspecting={isInspecting}
        rootCode={activeModel?.code}
        onBackToRoot={() => setInspectedNodeId(null)}
        emptyHint={
          isInspecting
            ? `Nothing is connected to ${inspectedNode.code} yet.`
            : rootType === 'po'
              ? 'No course learning outcome references this program outcome yet.'
              : rootType === 'peo'
                ? 'Nothing is connected to this PEO yet. Add aligned program outcomes to build the map.'
                : rootType === 'clo'
                  ? 'Nothing is connected to this learning outcome yet. Name program outcomes in its text to build the map.'
                  : rootType === 'sg'
                    ? 'Nothing is connected to this goal yet. Align program outcomes to it to build the map.'
                    : rootType === 'cmo'
                      ? 'Nothing is connected to this memorandum yet. Anchor program outcomes to it to build the map.'
                      : rootType === 'curriculum'
                        ? 'Nothing is connected to this curriculum yet. Assign subjects to it to build the map.'
                        : rootType === 'program'
                          ? 'Nothing is connected to this program yet. Add subjects to build the map.'
                          : 'Nothing is connected to this subject yet. Add a curriculum, prerequisites or course learning outcomes to build the map.'
        }
      />
    )
  })()

  // The Curriculum Report's two PO groupings (admin list vs the manager
  // Curriculum Mapping matrix). Shared by the on-screen document and the Word
  // download so both spell out the same groups.
  const subjectGroups = useMemo(() => {
    if (!datasets || rootType !== 'subject') return { adminGroups: [], managerGroups: [] }
    const { adminPos, managerPos } = splitReportPos(datasets.pos)
    return {
      adminGroups: buildGroups(adminPos, datasets.cmos),
      managerGroups: buildGroups(managerPos, datasets.cmos),
    }
  }, [datasets, rootType])

  // The Curriculum Report belongs to the subject root alone. While a branch
  // below it is being inspected the card stands on its own, so the syllabus on
  // screen always matches the card above it.
  // ── Download the Curriculum Report (subject root only) ────────────────────
  // The same two exports the Curriculum Report page offers, scoped to the
  // subject on screen: PDF rasterises the live report node ref; Word rebuilds
  // the document from the exact same groups the screen shows.
  const handleSubjectDownload = async () => {
    if (!selectedCourse || !datasets) return
    setDlOpen(false)
    setDownloading(true)
    setDlNotice(null)
    setDlError(null)
    try {
      if (dlFormat === 'pdf') {
        if (!reportRootRef.current) throw new Error('The report is not ready yet.')
        await downloadSyllabusPdf(
          reportRootRef.current,
          reportFileName(selectedCourse.code, 'pdf'),
          'landscape',
        )
        setDlNotice('PDF downloaded.')
      } else {
        // Lazy: docx is ~450kB and only needed on the Word path.
        const { downloadSyllabusDocx } = await import('../../utils/syllabusDocx')
        await downloadSyllabusDocx(
          {
            course: selectedCourse,
            courses,
            goals: datasets.sgs,
            peos: datasets.peos,
            adminGroups: subjectGroups.adminGroups,
            managerGroups: subjectGroups.managerGroups,
            subjectClos: datasets.clos.filter((c) =>
              cloMatchesSubject(c.course || '', normalizeCode(selectedCourse.code))),
          },
          'landscape',
        )
        setDlNotice('Word document downloaded.')
      }
    } catch (e) {
      setDlError(
        e instanceof Error
          ? `Could not create the ${dlFormat === 'pdf' ? 'PDF' : 'Word document'}: ${e.message}`
          : 'Download failed.',
      )
    } finally {
      setDownloading(false)
    }
  }

  // The download control rides inside the report page's own padding, at its
  // right bottom edge — SyllabusReport renders it as a screen-only footer
  // that the PDF snapshot strips, so the exported file stays clean.
  const reportDownloadFoot = (
    <div className="subject-view__report-foot" ref={dlMenuRef}>
      {dlNotice && <p className="msg msg--success" role="status">{dlNotice}</p>}
      {dlError && <p className="msg msg--error" role="alert">{dlError}</p>}
      <div className="sd-download">
        <button
          className="btn btn--primary btn--sm sd-download__main"
          onClick={handleSubjectDownload}
          disabled={downloading || loading}
          title="Save the report to a file"
        >
          <Icon name="download" />
          {downloading ? 'Preparing...' : `Download ${dlFormat === 'pdf' ? 'PDF' : 'Word'}`}
        </button>
        <button
          className="btn btn--primary btn--sm sd-download__toggle"
          onClick={() => setDlOpen((o) => !o)}
          disabled={downloading || loading}
          aria-expanded={dlOpen}
          aria-haspopup="true"
          aria-label="Download options"
          title="Choose the format"
        >
          <Icon name="chevron" />
        </button>
        {dlOpen && (
          <div className="sd-download__menu no-print" role="menu">
            <div className="sd-download__group">
              <span className="sd-download__label">Format</span>
              <div className="sd-download__opts">
                <button
                  className={`sd-download__opt${dlFormat === 'pdf' ? ' is-active' : ''}`}
                  onClick={() => setDlFormat('pdf')}
                  role="menuitemradio"
                  aria-checked={dlFormat === 'pdf'}
                >
                  PDF
                </button>
                <button
                  className={`sd-download__opt${dlFormat === 'docx' ? ' is-active' : ''}`}
                  onClick={() => setDlFormat('docx')}
                  role="menuitemradio"
                  aria-checked={dlFormat === 'docx'}
                >
                  Word
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const subjectReport = (() => {
    if (!datasets || !selectedCourse || rootType !== 'subject' || isInspecting) return null
    return (
      <SyllabusReport
        rootRef={reportRootRef}
        footer={reportDownloadFoot}
        course={selectedCourse}
        courses={courses}
        goals={datasets.sgs}
        peos={datasets.peos}
        adminGroups={subjectGroups.adminGroups}
        managerGroups={subjectGroups.managerGroups}
        subjectClos={datasets.clos.filter((c) =>
          cloMatchesSubject(c.course || '', normalizeCode(selectedCourse.code)))}
      />
    )
  })()

  if (loading) return <p role="status">Loading subjects...</p>

  return (
    <div className="subject-view">
      <PageBanner title="Generate Map" sub="Explore every course, outcome." />
      {error && <p className="msg msg--error" role="alert">{error}</p>}

      <div className="subject-view__panels">
        {/* ── Left panel: root choice + program/subject/PO selection ─────── */}
        <div className="panel subject-view__left">
          <h3 className="subject-view__course-heading">Visualize</h3>
          <label className="field">
            <span>Select</span>
            <select
              className="input input--sm"
              value={rootType}
              onChange={(e) => { setRootType(e.target.value as RootType | ''); setShowGraph(false); setNavStack([]); setGraphError('') }}
            >
              <option value="">--- select to Visualize ---</option>
              <option value="curriculum">Curriculum</option>
              <option value="subject">Subject</option>
              <option value="po">PO — Program Outcome</option>
              <option value="peo">PEO — Program Educational Objective</option>
              {/* Hidden roots — never offered here. They stay in the DOM so
                  the select keeps a valid value when one of them is active,
                  which only happens by clicking a node inside an open graph
                  (CLO, SG, CMO and Program nodes all re-root on click). */}
              <option value="clo" hidden>Course Learning Outcomes</option>
              <option value="sg" hidden>Strategic Goals</option>
              <option value="cmo" hidden>CHED Memorandum Orders</option>
              <option value="program" hidden>Program</option>
            </select>
          </label>

          <h3>Program</h3>
          <label className="field">
            <span className="sr-only">Select program</span>
            <select className="input input--sm" value={selectedProgramId}
              disabled={programs.length === 0}
              onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedCourseId(null); setSelectedCurriculumId(null); setNavStack([]); if (rootType !== 'curriculum') setShowGraph(false) }}>
              {programs.length === 0 && <option value="">No programs available</option>}
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.code}</option>
              ))}
            </select>
          </label>
          <p className="subject-view__helper">{programs.length === 0 ? 'Create a program first to get started.' : `${programCourses.length} subject${programCourses.length === 1 ? '' : 's'} in this program.`}</p>

          {rootType === 'subject' && (
            <>
              <h3 className="subject-view__course-heading">Subject Code</h3>
              <label className="field">
                <span className="sr-only">Select course</span>
                <select className="input input--sm" value={selectedCourseId ?? ''}
                  disabled={programs.length === 0 || programCourses.length === 0}
                  onChange={(e) => { setSelectedCourseId(e.target.value || null); setShowGraph(false); setNavStack([]) }}>
                  {programCourses.length === 0 ? (
                    <option value="">No subjects in this program</option>
                  ) : (
                    <>
                      <option value="">— Select a subject —</option>
                      {programCourses.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            </>
          )}
          {rootType === 'po' && (
            <>
              <h3 className="subject-view__course-heading">PO Code</h3>
              <label className="field">
                <span className="sr-only">Select program outcome</span>
                <select className="input input--sm" value={selectedPoId ?? ''}
                  disabled={allPos.length === 0}
                  onChange={(e) => { setSelectedPoId(e.target.value || null); setShowGraph(false); setNavStack([]) }}>
                  {allPos.length === 0 ? (
                    <option value="">No program outcomes yet</option>
                  ) : (
                    <>
                      <option value="">— Select a PO —</option>
                      {allPos.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {p.title || p.description || p.code}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allPos.length === 0 ? 'Add a program outcome first.' : `${allPos.length} PO${allPos.length === 1 ? '' : 's'} available as graph root.`}</p>
            </>
          )}
          {rootType === 'peo' && (
            <>
              <h3 className="subject-view__course-heading">PEO Code</h3>
              <label className="field">
                <span className="sr-only">Select program educational objective</span>
                <select className="input input--sm" value={selectedPeoId ?? ''}
                  disabled={allPeos.length === 0}
                  onChange={(e) => { setSelectedPeoId(e.target.value || null); setShowGraph(false); setNavStack([]) }}>
                  {allPeos.length === 0 ? (
                    <option value="">No PEOs yet</option>
                  ) : (
                    <>
                      <option value="">— Select a PEO —</option>
                      {allPeos.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {(p.title || '').slice(0, 60)}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allPeos.length === 0 ? 'Add a program educational objective first.' : `${allPeos.length} PEO${allPeos.length === 1 ? '' : 's'} available as graph root.`}</p>
            </>
          )}
          {rootType === 'clo' && (
            <>
              <h3 className="subject-view__course-heading">CLO Code</h3>
              <label className="field">
                <span className="sr-only">Select course learning outcome</span>
                <select className="input input--sm" value={selectedCloId ?? ''}
                  disabled={allClos.length === 0}
                  onChange={(e) => { setSelectedCloId(e.target.value || null); setShowGraph(false); setNavStack([]) }}>
                  {allClos.length === 0 ? (
                    <option value="">No course learning outcomes yet</option>
                  ) : (
                    <>
                      <option value="">— Select a CLO —</option>
                      {allClos.map((c) => (
                        <option key={c.id} value={c.id}>{String(c.course || '—')} · {c.code} — {(c.description || '').slice(0, 60)}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allClos.length === 0 ? 'Add a course learning outcome first.' : `${allClos.length} CLO${allClos.length === 1 ? '' : 's'} available as graph root.`}</p>
            </>
          )}
          {rootType === 'sg' && (
            <>
              <h3 className="subject-view__course-heading">SG Code</h3>
              <label className="field">
                <span className="sr-only">Select strategic goal</span>
                <select className="input input--sm" value={selectedSgId ?? ''}
                  disabled={allSgs.length === 0}
                  onChange={(e) => { setSelectedSgId(e.target.value || null); setShowGraph(false); setNavStack([]) }}>
                  {allSgs.length === 0 ? (
                    <option value="">No strategic goals yet</option>
                  ) : (
                    <>
                      <option value="">— Select a SG —</option>
                      {allSgs.map((s) => (
                        <option key={s.id} value={s.id}>{s.code} — {(s.title || s.description || '').slice(0, 60)}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allSgs.length === 0 ? 'Add a strategic goal first.' : `${allSgs.length} SG${allSgs.length === 1 ? '' : 's'} available as graph root.`}</p>
            </>
          )}
          {rootType === 'cmo' && (
            <>
              <h3 className="subject-view__course-heading">CMO Code</h3>
              <label className="field">
                <span className="sr-only">Select CHED memorandum order</span>
                <select className="input input--sm" value={selectedCmoId ?? ''}
                  disabled={allCmos.length === 0}
                  onChange={(e) => { setSelectedCmoId(e.target.value || null); setShowGraph(false); setNavStack([]) }}>
                  {allCmos.length === 0 ? (
                    <option value="">No CHED memorandum orders yet</option>
                  ) : (
                    <>
                      <option value="">— Select a CMO —</option>
                      {allCmos.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {(c.title || '').slice(0, 60)}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allCmos.length === 0 ? 'Add a CHED memorandum order first.' : `${allCmos.length} CMO${allCmos.length === 1 ? '' : 's'} available as graph root.`}</p>
            </>
          )}
          {rootType === 'curriculum' && (
            <>
              <h3 className="subject-view__course-heading">Curriculum Code</h3>
              <label className="field">
                <span className="sr-only">Select curriculum</span>
                <select className="input input--sm" value={selectedCurriculumId ?? ''}
                  disabled={allCurricula.length === 0}
                  onChange={(e) => {
                    setSelectedCurriculumId(e.target.value || null)
                    // The OBE Curriculum Map *is* the curriculum's default
                    // visualization, and it opens full screen right away —
                    // clearing the pick stands down to the normal panel.
                    setShowGraph(Boolean(e.target.value))
                    setIsFullscreen(Boolean(e.target.value))
                    setNavStack([])
                  }}>
                  {allCurricula.length === 0 ? (
                    <option value="">No curricula assigned in this program yet</option>
                  ) : (
                    <>
                      <option value="">— Select a curriculum —</option>
                      {allCurricula.map((r) => (
                        <option key={r.id} value={r.id}>{r.code || r.title} — {r.title}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allCurricula.length === 0 ? 'Subjects in this program carry no curriculum yet.' : `${allCurricula.length} curriculum${allCurricula.length === 1 ? '' : 'a'} available as graph root.`}</p>
            </>
          )}

          {leftCounts && (
            <div className="subject-view__summary">
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">{rootType === 'po' ? 'CLOs' : rootType === 'peo' || rootType === 'clo' || rootType === 'sg' || rootType === 'cmo' ? 'POs' : rootType === 'curriculum' || rootType === 'program' ? 'Subjects' : 'Pre-reqs'}</span>
                <span className="subject-view__summary-value" style={{ color: '#b45309' }}>{leftCounts.pre}</span>
              </div>
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">{rootType === 'curriculum' || rootType === 'program' ? 'POs' : rootType === 'subject' ? 'Co-reqs' : 'Subjects'}</span>
                <span className="subject-view__summary-value" style={{ color: '#15803d' }}>{leftCounts.core}</span>
              </div>
              {rootType === 'subject' && (
                <div className="subject-view__summary-item">
                  <span className="subject-view__summary-label">CLOs</span>
                  <span className="subject-view__summary-value" style={{ color: '#15803d' }}>{leftCounts.clos >= 0 ? leftCounts.clos : '–'}</span>
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn--sm subject-view__view-btn"
            disabled={(rootType === 'subject' ? !selectedCourse
              : rootType === 'clo' ? !selectedCloId
              : rootType === 'po' ? !selectedPoId
              : rootType === 'peo' ? !selectedPeoId
              : rootType === 'sg' ? !selectedSgId
              : rootType === 'cmo' ? !selectedCmoId
              : rootType === 'curriculum' ? !selectedCurriculumId
              : rootType === 'program' ? !selectedProgramId
              : true) || loading || spinner}
            onClick={handleView}>
            {spinner ? 'Loading…' : 'Generate Visualization'}
          </button>
        </div>

        {/* ── Right panel: D3 hierarchy graph ───────────────────────────── */}
        <div
          className={`panel subject-view__right${isFullscreen ? ' subject-view__right--fullscreen' : ''}`}
          style={{ position: 'relative' }}
        >
          {!showGraph ? (
            <div className="subject-view__placeholder">
              <div className="subject-view__placeholder-card">
                <div className="subject-view__placeholder-icon">
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="6" cy="6" r="2.5" />
                    <circle cx="18" cy="6" r="2.5" />
                    <circle cx="12" cy="18" r="2.5" />
                    <path d="M8 7l2.5 9M16 7l-3.5 9M6 6h12" />
                  </svg>
                </div>
                <h4>Visualization for a subject, PO, PEO, or curriculum</h4>
                <p>Choose <strong>Subject</strong>, <strong>PO</strong>, <strong>PEO</strong>, or <strong>Curriculum</strong> on the left, pick a code, then press <strong>Generate Visualization</strong>. Once a map is open, clicking any PO, CLO, PEO, strategic goal, or CHED memorandum re-roots the branch right there — wherever you click becomes where the graph starts. Clicking a subject jumps back to that subject; clicking a curriculum opens its sibling subjects.</p>
              </div>
            </div>
          ) : graphError ? (
            <p className="msg msg--error">{graphError}</p>
          ) : spinner || !datasets ? (
            <div className="subject-view__loading">
              <span className="subject-view__spinner" aria-hidden />
              <span>Loading relationships…</span>
            </div>
          ) : (rootType === 'subject' && !selectedCourse) || (rootType === 'clo' && !selectedClo) || (rootType === 'po' && !selectedPo) || (rootType === 'peo' && !selectedPeo) || (rootType === 'sg' && !selectedSg) || (rootType === 'cmo' && !selectedCmo) || (rootType === 'curriculum' && !selectedCurriculum) || (rootType === 'program' && !selectedProgram) ? (
            <div className="subject-view__placeholder">
              <p>{({
                subject: 'Select a subject on the left, then press Generate Visualization.',
                clo: 'Select a CLO on the left, then press Generate Visualization.',
                po: 'Select a PO on the left, then press Generate Visualization.',
                peo: 'Select a PEO on the left, then press Generate Visualization.',
                sg: 'Select a strategic goal on the left, then press Generate Visualization.',
                cmo: 'Select a CHED memorandum on the left, then press Generate Visualization.',
                curriculum: 'Select a curriculum on the left, then press Generate Visualization.',
                program: 'Select a program on the left, then press Generate Visualization.',
              } as Record<string, string>)[rootType] ?? 'Select what to visualize on the left, then press Generate Visualization.'}</p>
            </div>
          ) : (
            <div className="subject-view__graph-area">
              {/* OBE Curriculum Map filters — the curriculum root's default
                  view narrows by outcome, then by the course learning outcome
                  that carries it as its performance indicator. */}
              {rootType === 'curriculum' && (
                <div className="subject-view__map-filters">
                  <label>
                    <b>1. Program Graduate Outcomes (PGO):</b>
                    <select
                      className="input input--sm"
                      value={mapPoId}
                      onChange={(e) => { setMapPoId(e.target.value); setMapCloId('') }}
                    >
                      <option value="">— All outcomes —</option>
                      {mapFilterOptions.pos.map((p) => (
                        <option key={p.id} value={p.id}>{p.code}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <b>2. Performance Indicators (PI):</b>
                    <select
                      className="input input--sm"
                      value={mapCloId}
                      disabled={!mapPoId}
                      title={!mapPoId ? 'Choose a program graduate outcome first' : undefined}
                      onChange={(e) => setMapCloId(e.target.value)}
                    >
                      <option value="">— All indicators —</option>
                      {mapFilterOptions.clos.map((clo) => (
                        <option key={clo.id} value={clo.id}>{clo.code}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => { setMapPoId(''); setMapCloId(''); resetZoom() }}
                    title="Clear the filters and reframe the map"
                  >
                    ⟳ Reset View
                  </button>
                </div>
              )}
              <div className="subject-view__graph-toolbar">
                <h3 className="subject-view__graph-title">{graphTitle}</h3>
                <div className="subject-view__graph-actions">
                  {navStack.length > 0 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={goBack}
                      title={`Back to ${navEntryTitle(navStack[navStack.length - 1])}`}
                    >
                      ← Back
                    </button>
                  )}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={collapseAll} title="Collapse all branches except the root">
                    Collapse
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={resetZoom} title="Reset zoom and pan">
                    Reset zoom
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setIsFullscreen((v) => !v)}
                    aria-pressed={isFullscreen}
                    title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Expand map to fullscreen'}
                  >
                    {isFullscreen ? 'Exit fullscreen' : '⤢ Fullscreen'}
                  </button>
                </div>
              </div>
              <p className="subject-view__graph-hint">{graphHint}{isFullscreen ? ' Press Esc to exit fullscreen.' : ''}</p>
              {rootType !== 'curriculum' && (
                <div className="subject-view__legend">
                  {legendDefs.map((l) => {
                    const n = graphStats?.counts[l.kind] ?? 0
                    return (
                      <span key={l.kind} title={l.tip}>
                        <span className={`subject-view__dot ${dotClass(l.kind)}`} /> {l.label} <em className="subject-view__legend-count">{n}</em>
                      </span>
                    )
                  })}
                  <span className={graphStats && graphStats.unresolved > 0 ? '' : 'subject-view__legend--muted'} title="References that could not be resolved">
                    <span className="subject-view__dot subject-view__dot--placeholder" /> Unresolved <em className="subject-view__legend-count">{graphStats?.unresolved ?? 0}</em>
                  </span>
                </div>
              )}
              <div className="subject-view__graph-wrap">
                <svg ref={svgRef} className="subject-view__svg" />
              </div>
              <div ref={tooltipRef} className="subject-view__tooltip" />
            </div>
          )}
        </div>
      </div>

      {/* Below Program + Visualization — full-width. Every root leads with the
          compact connected-details card. A subject then follows it with the
          Curriculum Report document itself (no extra card frame); a PO or a
          PEO stops at the card. */}
      {(rootType === 'subject' && selectedCourse) ||
      (rootType === 'po' && selectedPo) ||
      (rootType === 'peo' && selectedPeo) ? (
        <div className="subject-view__about">
          {detailsCard ?? (
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
              Loading the connected details…
            </p>
          )}
          {rootType === 'subject' && (
            <div className="subject-view__report">
              {subjectReport ?? (
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                  {isInspecting
                    ? 'Click “Back to root” above to return to the full Curriculum Report.'
                    : 'Loading the course report…'}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
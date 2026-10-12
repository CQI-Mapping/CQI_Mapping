// Admin Subject View: two-panel layout — left panel has a Subject/PO root
// toggle plus program + subject/PO dropdowns; right panel renders a D3.js
// outcome hierarchy graph. Two roots are supported:
//
//   Subject (root)
//     ├─ Curriculum
//     ├─ Prerequisite(s)
//     ├─ Corequisite(s)
//     └─ CLO(s)
//        └─ PO(s)  ← clicking a PO re-roots the visualization at that PO
//           ├─ PEO
//           ├─ Strategic Goal
//           └─ CHED Memorandum Order
//
//   PO (root)
//     ├─ PEO / Strategic Goal / CHED Memorandum Order (downstream)
//     └─ CLO(s) → Subject(s) (upstream)
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
import { normalizeCode, cloMatchesSubject, courseCreditLabel, courseHoursSentence } from '../../utils/courseCodes'

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
  children: GraphNodeData[]
}

type RootType = 'subject' | 'po'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showGraph, setShowGraph] = useState(false)
  const [spinner, setSpinner] = useState(false)
  const [graphError, setGraphError] = useState('')
  const [datasets, setDatasets] = useState<OutcomeDatasets | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [navStack, setNavStack] = useState<NavEntry[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // Reset expand/collapse when the root changes — like branch-visualizer fresh state.
  useEffect(() => { setCollapsedIds(new Set()) }, [selectedCourseId, selectedPoId, rootType])

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
          setPoList(sortPos(pos.filter(isActive)))
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
  // so the PO dropdown works before the first View.
  const allPos = useMemo(
    () => (datasets ? sortPos(datasets.pos) : poList),
    [datasets, poList],
  )

  const selectedPo = useMemo(
    () => allPos.find((p) => p.id === selectedPoId) ?? null,
    [allPos, selectedPoId],
  )

  // Quick tallies shown in the left panel before View.
  // Subject mode: pre-req / co-req / CLO counts. PO mode: linked CLOs / subjects.
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
    if (!selectedCourse) return null
    const pre = (selectedCourse.prerequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    const core = (selectedCourse.corequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    let clos = -1
    if (datasets) {
      const key = normalizeCode(selectedCourse.code)
      clos = datasets.clos.filter((clo) => cloMatchesSubject(clo.course || '', key)).length
    }
    return { pre, core, clos }
  }, [rootType, selectedPo, selectedCourse, datasets, courses])

  // ── Load + cache outcome datasets on first View ────────────────────────────
  const loadDatasets = async (force = false) => {
    if (datasets && !force) return
    setSpinner(true)
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
      setPoList(sortPos(activePos))
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to load relationships.')
    } finally {
      setSpinner(false)
    }
  }

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
        if (rec) pushChild({ id: `peo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'peo', placeholder: false, children: [] })
        else {
          const tok = poRec.peo_text ? extractCodes(poRec.peo_text, 'PEO')[0] : ''
          pushChild({ id: `peo-missing-${poRec.peo_id}`, code: tok || 'PEO', title: 'PEO not found or archived', kind: 'peo', placeholder: true, children: [] })
        }
      } else if (poRec.peo_text) {
        for (const tok of extractCodes(poRec.peo_text, 'PEO')) {
          const rec = datasetsRef.peos.find((p) => normalizeCode(p.code) === normalizeCode(tok))
          pushChild(rec
            ? { id: `peo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'peo', placeholder: false, children: [] }
            : { id: `peo-missing-${tok}`, code: tok, title: 'PEO not found or archived', kind: 'peo', placeholder: true, children: [] })
        }
      }

      // Strategic Goal: id-first, then text-code fallback.
      if (poRec.sg_id) {
        const rec = datasetsRef.sgs.find((s) => s.id === poRec.sg_id)
        if (rec) pushChild({ id: `sg-${rec.id}`, code: rec.code, title: rec.title || rec.description || rec.code, kind: 'sg', placeholder: false, children: [] })
        else {
          const tok = poRec.sg_text ? extractSgCodes(poRec.sg_text)[0] : ''
          pushChild({ id: `sg-missing-${poRec.sg_id}`, code: tok || 'SG', title: 'Strategic Goal not found or archived', kind: 'sg', placeholder: true, children: [] })
        }
      } else if (poRec.sg_text) {
        for (const tok of extractSgCodes(poRec.sg_text)) {
          const rec = findSgByToken(datasetsRef.sgs, tok)
          pushChild(rec
            ? { id: `sg-${rec.id}`, code: rec.code, title: rec.title || rec.description || rec.code, kind: 'sg', placeholder: false, children: [] }
            : { id: `sg-missing-${tok}`, code: tok, title: 'Strategic Goal not found or archived', kind: 'sg', placeholder: true, children: [] })
        }
      }

      // CHED Memorandum Order: id-first, then description/title text fallback.
      if (poRec.cmo_id) {
        const rec = datasetsRef.cmos.find((c) => c.id === poRec.cmo_id)
        if (rec) pushChild({ id: `cmo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'cmo', placeholder: false, children: [] })
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
          pushChild({ id: `cmo-${cmoMatch.id}`, code: cmoMatch.code, title: cmoMatch.title || cmoMatch.code, kind: 'cmo', placeholder: false, children: [] })
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

      // Curriculum as a child of subject
      const cidOpt = subject.curriculum_id
      const cid = cidOpt && typeof cidOpt === 'object' ? cidOpt.id : cidOpt
      const curRec = cid ? datasetsRef.resources.find((r) => r.id === cid) : undefined
      subjectNode.children.push(
        curRec
          ? {
              id: `cur-${curRec.id}`,
              code: (curRec.code || curRec.title),
              title: curRec.title,
              kind: 'curriculum',
              placeholder: false,
              children: [],
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
      const subjectClos = datasetsRef.clos.filter((clo) =>
        cloMatchesSubject(clo.course || '', subjectKey)
      )

      const poMap = new Map<string, GraphNodeData>()

      for (const clo of subjectClos) {
        const cloNode: GraphNodeData = {
          id: `clo-${clo.id}`,
          code: clo.code,
          title: clo.description || clo.code,
          kind: 'clo',
          placeholder: false,
          children: [],
        }
        const poTokens = extractCodes(clo.title || '', 'PO')
        for (const tok of poTokens) {
          const key = normalizeCode(tok)
          let poNode = poMap.get(key)
          if (!poNode) {
            const poRec = datasetsRef.pos.find((p) => normalizeCode(p.code) === key)
            poNode = {
              id: poRec ? `po-${poRec.id}` : `po-missing-${tok}`,
              code: tok,
              title: poRec ? (poRec.description || poRec.title || tok) : 'PO not found or archived',
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
        subjectNode.children.push(cloNode)
      }

      return subjectNode
    },
    [courses, programCourses, attachPoLeaves],
  )

  // ── Build the PO-rooted graph model ────────────────────────────────────────
  // Root = PO. Upstream: CLOs that target this PO → their Subjects.
  // Downstream: the PO's own PEO / SG / CMO leaves (shared helper).
  const buildPoGraphModel = useCallback(
    (datasetsRef: OutcomeDatasets, poRec: ProgramOutcomeStandalone): GraphNodeData => {
      const poKey = normalizeCode(poRec.code)
      const root: GraphNodeData = {
        id: `po-${poRec.id}`,
        code: poRec.code,
        title: poRec.description || poRec.title || poRec.code,
        kind: 'po',
        placeholder: false,
        poId: poRec.id,
        children: [],
      }

      // Downstream first so PEO/SG/CMO order matches the subject graph.
      attachPoLeaves(datasetsRef, root, poRec)

      // Upstream: every CLO whose title references this PO code.
      const linkedClos = datasetsRef.clos.filter((clo) =>
        extractCodes(clo.title || '', 'PO').map(normalizeCode).includes(poKey)
      )

      if (linkedClos.length === 0) {
        root.children.push({
          id: `clo-none-${poRec.id}`,
          code: 'No linked CLOs',
          title: 'No CLO references this PO yet',
          kind: 'clo',
          placeholder: true,
          children: [],
        })
        return root
      }

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
        root.children.push(cloNode)
      }

      return root
    },
    [courses, attachPoLeaves],
  )

  // Unique node counts per kind once a graph is on screen (used in the legend).
  const graphStats = useMemo(() => {
    if (!datasets) return null
    try {
      if (rootType === 'subject') {
        if (!selectedCourse) return null
        return countKinds(buildGraphModel(datasets, selectedCourse))
      }
      if (!selectedPo) return null
      return countKinds(buildPoGraphModel(datasets, selectedPo))
    } catch {
      return null
    }
  }, [rootType, selectedCourse, selectedPo, datasets, buildGraphModel, buildPoGraphModel])

  const buildActiveModel = useCallback(() => {
    if (!datasets) return null
    if (rootType === 'subject') return selectedCourse ? buildGraphModel(datasets, selectedCourse) : null
    return selectedPo ? buildPoGraphModel(datasets, selectedPo) : null
  }, [datasets, rootType, selectedCourse, selectedPo, buildGraphModel, buildPoGraphModel])

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
  }, [buildActiveModel])

  // Reset the SVG zoom/pan transform to its default framed view.
  const resetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity)
    }
  }, [])

  const handleRefresh = async () => {
    if ((rootType === 'subject' && !selectedCourse) || (rootType === 'po' && !selectedPo)) return
    setGraphError('')
    await loadDatasets(true)
  }

  // Re-root helpers — push the current root onto the trail before switching.
  const gotoPoRoot = useCallback((poId: string) => {
    if (rootType === 'subject' && selectedCourseId) {
      setNavStack((prev) => [...prev, { type: 'subject', id: selectedCourseId }])
    } else if (rootType === 'po' && selectedPoId && selectedPoId !== poId) {
      setNavStack((prev) => [...prev, { type: 'po', id: selectedPoId }])
    }
    setRootType('po')
    setSelectedPoId(poId)
    setShowGraph(true)
    setGraphError('')
  }, [rootType, selectedCourseId, selectedPoId])

  const gotoSubjectRoot = useCallback((courseId: string) => {
    if (rootType === 'po' && selectedPoId) {
      setNavStack((prev) => [...prev, { type: 'po', id: selectedPoId }])
    } else if (rootType === 'subject' && selectedCourseId && selectedCourseId !== courseId) {
      setNavStack((prev) => [...prev, { type: 'subject', id: selectedCourseId }])
    }
    setRootType('subject')
    setSelectedCourseId(courseId)
    setShowGraph(true)
    setGraphError('')
  }, [rootType, selectedPoId, selectedCourseId])

  // Jump back to an earlier entry in the navigation trail.
  const handleCrumb = useCallback((i: number) => {
    const current: NavEntry | null =
      rootType === 'subject' && selectedCourseId ? { type: 'subject', id: selectedCourseId }
      : rootType === 'po' && selectedPoId ? { type: 'po', id: selectedPoId }
      : null
    if (!current) return
    const trail = [...navStack, current]
    if (i >= trail.length - 1) return
    const target = trail[i]
    setRootType(target.type)
    if (target.type === 'subject') setSelectedCourseId(target.id)
    else setSelectedPoId(target.id)
    setNavStack(navStack.slice(0, i))
    setShowGraph(true)
    setGraphError('')
  }, [rootType, selectedCourseId, selectedPoId, navStack])

  // ── D3 force simulation — Observable-style (width 928 / height 680) ───────
  // Dual-root: subject mode (subject → curriculum / prereq / coreq / CLO → PO
  // → PEO/SG/CMO) or PO mode (PO → CLOs → subjects + PEO/SG/CMO), with the
  // existing collapse/expand and zoom behavior preserved.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !datasets) return () => {}
    if (rootType === 'subject' && !selectedCourse) return () => {}
    if (rootType === 'po' && !selectedPo) return () => {}

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
      : rootType === 'po' && selectedPo
        ? buildPoGraphModel(datasets, selectedPo)
        : null
    if (!data) return () => {}
    const rootId = data.id
    const root = d3.hierarchy<GraphNodeData>(data, (d) =>
      collapsedIds.has(d.id) ? undefined : d.children
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
        group: kindGroup[d.data.kind] ?? 4,
        expandable: !!(d.data.children && d.data.children.length > 0),
        collapsed: collapsedIds.has(d.data.id),
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
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    const node = nodeGroup
      .selectAll<SVGCircleElement, ForceNode>('circle')
      .data(simNodes, (d) => d.rId)
      .join('circle')
      .attr('r', (d) => {
        if (d.id === rootId) return 14
        if (d.kind === 'subject') return 14
        if (d.kind === 'curriculum') return 12
        if (d.kind === 'po' || d.kind === 'clo') return 8
        return 5
      })
      .attr('fill', (d) => (d.placeholder ? '#f8fafc' : (colorMap[d.kind] as string) || color(String(d.group))))
      .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : '#fff'))
      .attr('cursor', (d) => (d.expandable || d.courseId || (d.kind === 'po' && d.poId) ? 'pointer' : 'grab'))
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
          (d.kind === 'subject' && d.courseId && !(rootType === 'subject' && d.id === rootId))
        tip.innerHTML = `<strong>${d.code}</strong><br/>${d.title}${canReroot ? '<br/><em>Click to view as root</em>' : ''}`
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
      // PO node → re-root visualization at that PO (works from subject graph
      // and from upstream CLO branches inside a PO graph).
      if (d.kind === 'po' && d.poId && !d.placeholder) {
        if (!((rootType === 'po' && d.id === rootId))) {
          gotoPoRoot(d.poId)
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
        setCollapsedIds((prev) => {
          const next = new Set(prev)
          if (next.has(d.id)) next.delete(d.id)
          else next.add(d.id)
          return next
        })
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
  }, [rootType, selectedCourse, selectedPo, datasets, containerSize, collapsedIds, buildGraphModel, buildPoGraphModel, courses, selectedCourseId, gotoPoRoot, gotoSubjectRoot])

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
    if (rootType === 'po' && !selectedPo) return
    try {
      return renderGraph()
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to render graph.')
      return undefined
    }
  }, [showGraph, rootType, selectedCourse, selectedPo, datasets, containerSize, renderGraph, setGraphError])

  const handleView = async () => {
    if (!rootType) return
    if (rootType === 'subject' && !selectedCourse) return
    if (rootType === 'po' && !selectedPoId) return
    setShowGraph(true)
    setGraphError('')
    await loadDatasets()
  }

  const crumbLabel = (entry: NavEntry): string => {
    if (entry.type === 'subject') {
      return courses.find((c) => c.id === entry.id)?.code ?? allPos.find((p) => p.id === entry.id)?.code ?? '…'
    }
    return allPos.find((p) => p.id === entry.id)?.code ?? courses.find((c) => c.id === entry.id)?.code ?? '…'
  }

  const crumbTitle = (entry: NavEntry): string => {
    if (entry.type === 'subject') {
      const c = courses.find((x) => x.id === entry.id)
      return c ? `${c.code} — ${c.title}` : 'Unknown subject'
    }
    const p = allPos.find((x) => x.id === entry.id)
    return p ? `${p.code} — ${p.description || p.title}` : 'Unknown outcome'
  }

  const currentEntry: NavEntry | null =
    rootType === 'subject' && selectedCourseId ? { type: 'subject', id: selectedCourseId }
    : rootType === 'po' && selectedPoId ? { type: 'po', id: selectedPoId }
    : null

  const graphTitle = rootType === 'subject'
    ? (selectedCourse ? `${selectedCourse.code} — ${selectedCourse.title}` : '')
    : (selectedPo ? `${selectedPo.code} — ${selectedPo.description || selectedPo.title}` : '')
  const graphHint = rootType === 'subject'
    ? 'Click a branch node to expand or collapse. Click a PO to view the graph from that PO. Click a pre-req or co-req to jump to that subject. Drag nodes to reposition. Scroll to zoom.'
    : 'Click a branch node to expand or collapse. Click a subject to view the graph from that subject. Click a PO to switch PO root. Drag nodes to reposition. Scroll to zoom.'

  if (loading) return <p role="status">Loading subjects...</p>

  return (
    <div className="subject-view">
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
              <option value="subject">Subject</option>
              <option value="po">PO</option>
            </select>
          </label>

          <h3>Program</h3>
          <label className="field">
            <span className="sr-only">Select program</span>
            <select className="input input--sm" value={selectedProgramId}
              disabled={programs.length === 0}
              onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedCourseId(null); setShowGraph(false); setNavStack([]) }}>
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
                        <option key={p.id} value={p.id}>{p.code} — {(p.description || p.title || '').slice(0, 60)}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <p className="subject-view__helper">{allPos.length === 0 ? 'Add a program outcome first.' : `${allPos.length} PO${allPos.length === 1 ? '' : 's'} available as graph root.`}</p>
            </>
          )}

          {leftCounts && (
            <div className="subject-view__summary">
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">{rootType === 'po' ? 'CLOs' : 'Pre-reqs'}</span>
                <span className="subject-view__summary-value" style={{ color: '#b45309' }}>{leftCounts.pre}</span>
              </div>
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">{rootType === 'po' ? 'Subjects' : 'Co-reqs'}</span>
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
            disabled={(rootType === 'subject' ? !selectedCourse : !selectedPoId) || loading || spinner}
            onClick={handleView}>
            {spinner ? 'Loading…' : 'View Graph'}
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
                <h4>Outcome map for a subject or PO</h4>
                <p>Choose <strong>Subject</strong> or <strong>PO</strong> on the left, pick a code, then press <strong>View Graph</strong>. Clicking a PO re-roots the visualization at that PO; clicking a subject jumps back to that subject.</p>
              </div>
            </div>
          ) : graphError ? (
            <p className="msg msg--error">{graphError}</p>
          ) : spinner || !datasets ? (
            <div className="subject-view__loading">
              <span className="subject-view__spinner" aria-hidden />
              <span>Loading relationships…</span>
            </div>
          ) : (rootType === 'subject' && !selectedCourse) || (rootType === 'po' && !selectedPo) ? (
            <div className="subject-view__placeholder">
              <p>{rootType === 'subject' ? 'Select a subject on the left, then press View.' : 'Select a PO on the left, then press View.'}</p>
            </div>
          ) : (
            <div className="subject-view__graph-area">
              {navStack.length > 0 && currentEntry && (
                <nav className="subject-view__crumbs" aria-label="Outcome trail">
                  {[...navStack, currentEntry].map((entry, i) => {
                    const isLast = i === navStack.length
                    return (
                      <span className="subject-view__crumb-node" key={`${entry.type}-${entry.id}-${i}`}>
                        {i > 0 && <span className="subject-view__crumb-sep" aria-hidden>→</span>}
                        <button
                          type="button"
                          className={`subject-view__crumb${isLast ? ' subject-view__crumb--current' : ''}`}
                          disabled={isLast}
                          title={crumbTitle(entry)}
                          onClick={() => handleCrumb(i)}>
                          {crumbLabel(entry)}
                        </button>
                      </span>
                    )
                  })}
                </nav>
              )}
              <div className="subject-view__graph-toolbar">
                <h3 className="subject-view__graph-title">{graphTitle}</h3>
                <div className="subject-view__graph-actions">
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
              <div className="subject-view__graph-wrap">
                <svg ref={svgRef} className="subject-view__svg" />
              </div>
              <div ref={tooltipRef} className="subject-view__tooltip" />
            </div>
          )}
        </div>
      </div>

      {/* Below Program + Visualization — padded About card (full-width, outside grid) */}
      {((rootType === 'subject' && selectedCourse) || (rootType === 'po' && selectedPo)) && (
        <div className="panel subject-view__about" style={{ marginTop: 16, padding: 20 }}>
          {rootType === 'subject' && selectedCourse ? (
            <>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
                About {selectedCourse.code} — {selectedCourse.title}
              </h3>
              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
                {(() => {
                  const prog = programs.find((p) => p.id === selectedProgramId)
                  return prog ? `${prog.code} · ${prog.name}` : ''
                })()}
              </p>
              <div className="subject-view__inside" style={{ marginTop: 0, background: '#fff', border: '1px solid #e2e8f0' }}>
                <h4 className="subject-view__inside-title">Inside {selectedCourse.code}</h4>
                <p className="subject-view__inside-subtitle">{selectedCourse.title}</p>
                {selectedCourse.description && <p className="subject-view__inside-desc">{selectedCourse.description}</p>}
                <div className="subject-view__inside-grid">
                  <span><strong>Prerequisite:</strong> {selectedCourse.prerequisite?.trim() || '—'}</span>
                  <span><strong>Corequisite:</strong> {selectedCourse.corequisite?.trim() || '—'}</span>
                  {/* Credit + hours wording is shared with the report's Course
                      Details (V. Credit / VIII. Number of Hours). */}
                  <span><strong>Credit:</strong> {courseCreditLabel(selectedCourse)}</span>
                  <span><strong>Number of Hours:</strong> {courseHoursSentence(selectedCourse)}</span>
                  <span><strong>Status:</strong> <span className={`status-badge status-badge--${selectedCourse.status}`}>{selectedCourse.status}</span></span>
                  {(() => {
                    const cid = typeof selectedCourse.curriculum_id === 'object' ? (selectedCourse.curriculum_id as any)?.code ?? (selectedCourse.curriculum_id as any)?.id : selectedCourse.curriculum_id
                    const curLabel = typeof selectedCourse.curriculum_id === 'object' ? (selectedCourse.curriculum_id as any)?.code : cid
                    return <span><strong>Curriculum:</strong> {curLabel || '—'}</span>
                  })()}
                </div>
                {(() => {
                  if (!datasets) return <p className="subject-view__inside-hint">Press <strong>View Graph</strong> to load CLOs / POs inside this subject.</p>
                  const key = normalizeCode(selectedCourse.code)
                  const insideClos = datasets.clos.filter((c) => cloMatchesSubject(c.course || '', key))
                  if (insideClos.length === 0) return <p className="subject-view__inside-empty">No CLOs linked to this subject yet.</p>
                  return (
                    <div className="subject-view__inside-list">
                      <strong className="subject-view__inside-list-title">CLOs inside ({insideClos.length}):</strong>
                      <ul>
                        {/* Every CLO, matching the report's VII. list. */}
                        {insideClos.map((clo) => (
                          <li key={clo.id} title={clo.description || clo.title}>
                            <span className="subject-view__inside-code">{clo.code}</span> — {clo.description || clo.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#64748b' }}>
                This is what <strong>{selectedCourse.code}</strong> is all about — its description, credits, prerequisites, curriculum, and the CLOs that drive the outcome map above.
              </p>
            </>
          ) : selectedPo ? (
            <>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
                About {selectedPo.code} — {selectedPo.description || selectedPo.title}
              </h3>
              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
                Program Outcome · aligns CLOs upstream and PEO / Strategic Goal / CMO downstream
              </p>
              <div className="subject-view__inside" style={{ marginTop: 0, background: '#fff', border: '1px solid #e2e8f0' }}>
                <h4 className="subject-view__inside-title">Inside {selectedPo.code}</h4>
                <p className="subject-view__inside-subtitle">{selectedPo.description || selectedPo.title}</p>
                <div className="subject-view__inside-grid">
                  <span><strong>PEO:</strong> {selectedPo.peo_text?.trim() || '—'}</span>
                  <span><strong>Strategic Goal:</strong> {selectedPo.sg_text?.trim() || '—'}</span>
                  <span><strong>Status:</strong> <span className={`status-badge status-badge--${selectedPo.status}`}>{selectedPo.status}</span></span>
                </div>
                {(() => {
                  if (!datasets) return <p className="subject-view__inside-hint">Press <strong>View Graph</strong> to load CLOs / subjects linked to this PO.</p>
                  const key = normalizeCode(selectedPo.code)
                  const linked = datasets.clos.filter((c) =>
                    extractCodes(c.title || '', 'PO').map(normalizeCode).includes(key))
                  if (linked.length === 0) return <p className="subject-view__inside-empty">No CLOs reference this PO yet.</p>
                  return (
                    <div className="subject-view__inside-list">
                      <strong className="subject-view__inside-list-title">CLOs targeting {selectedPo.code} ({linked.length}):</strong>
                      <ul>
                        {linked.slice(0, 6).map((clo) => (
                          <li key={clo.id} title={`${clo.course || ''} — ${clo.description || clo.title}`}>
                            <span className="subject-view__inside-code">{clo.code}</span> — {clo.description || clo.title}
                            {clo.course ? <span style={{ color: '#64748b' }}> ({clo.course})</span> : null}
                          </li>
                        ))}
                        {linked.length > 6 && <li className="subject-view__inside-more">+ {linked.length - 6} more — see graph</li>}
                      </ul>
                    </div>
                  )
                })()}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#64748b' }}>
                This is what <strong>{selectedPo.code}</strong> connects — the CLOs/subjects that target it upstream and the PEO, Strategic Goal, and CMO it aligns to downstream.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
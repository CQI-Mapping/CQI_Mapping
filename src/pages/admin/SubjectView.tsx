// Admin Subject View: two-panel layout — left panel has program dropdown +
// subject dropdown; right panel renders a D3.js outcome hierarchy graph:
//
//   Subject (double-ring, root)
//     ├─ Curriculum (oval)
//     ├─ Prerequisite(s)
//     ├─ Corequisite(s)
//     ├─ Next / Dependent(s)  (subjects that list this subject as pre/co-req)
//     └─ CLO(s)
//        └─ PO(s)
//           ├─ PEO
//           ├─ Strategic Goal
//           └─ CHED Memorandum Order
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

type NodeKind =
  | 'curriculum'
  | 'subject'
  | 'prerequisite'
  | 'corequisite'
  | 'dependent'
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
  children: GraphNodeData[]
}

interface OutcomeDatasets {
  resources: Resource[]
  clos: CourseLearningOutcomeStandalone[]
  pos: ProgramOutcomeStandalone[]
  peos: ProgramEducationalObjective[]
  sgs: StrategicGoal[]
  cmos: ChedMemoOrder[]
}

const colorMap: Record<NodeKind, string> = {
  curriculum: '#9333ea',
  subject: '#2563eb',
  prerequisite: '#f97316',
  corequisite: '#22c55e',
  dependent: '#eab308',
  clo: '#06b6d4',
  po: '#7c3aed',
  peo: '#db2777',
  sg: '#d97706',
  cmo: '#0891b2',
}

const isActive = <T extends { status?: string }>(x: T) => !x.status || x.status === 'active'

const normalizeCode = (code: string) =>
  code.trim().toUpperCase().replace(/[\s\-–—._/,]+/g, '')

const firstToken = (s: string) => {
  const m = s.trim().split(/[\s\-–—]+/)[0]
  return m || ''
}

const extractCodes = (text: string, prefix: 'PO' | 'PEO' | 'SG'): string[] => {
  const re = new RegExp(`${prefix}\\s*-?\\s*(\\d+)`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(`${prefix}-${m[1]}`)
  return out
}

// True when a CLO record's `course` field refers to the given subject code.
// Lenient: handles "IT 21", "IT21", "IT 21 - OOP", "IT21-OOP", "IT-21" etc.
const cloMatchesSubject = (cloCourse: string, subjectKey: string) => {
  const raw = (cloCourse || '').trim()
  if (!raw) return false
  const norm = normalizeCode(raw)
  if (norm === subjectKey) return true
  if (normalizeCode(firstToken(raw)) === subjectKey) return true
  if (norm.includes(subjectKey)) return true
  const tokens = raw.split(/[\s,;|]+/).map((s) => normalizeCode(s)).filter(Boolean)
  return tokens.includes(subjectKey)
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
    case 'dependent': return 'subject-view__dot--dependent'
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
  { kind: 'dependent', label: 'Next', tip: 'Subject(s) that require this subject as pre-req / co-req' },
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showGraph, setShowGraph] = useState(false)
  const [spinner, setSpinner] = useState(false)
  const [graphError, setGraphError] = useState('')
  const [datasets, setDatasets] = useState<OutcomeDatasets | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [navStack, setNavStack] = useState<string[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // Reset expand/collapse when subject changes — like branch-visualizer fresh state.
  useEffect(() => { setCollapsedIds(new Set()) }, [selectedCourseId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, c] = await Promise.all([fetchPrograms(), fetchCourses()])
        if (!cancelled) {
          const sorted = [...p].sort((a, b) =>
            String(a.name || a.code).localeCompare(String(b.name || b.code)))
          setPrograms(sorted)
          setCourses(c.filter(isActive).sort((a, b) => String(a.code).localeCompare(String(b.code))))
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
    () => programCourses.find((c) => c.id === selectedCourseId) ?? null,
    [programCourses, selectedCourseId],
  )

  // Quick pre-req / co-req / dependent / CLO tallies shown in the left panel before View.
  const leftCounts = useMemo(() => {
    if (!selectedCourse) return null
    const pre = (selectedCourse.prerequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    const core = (selectedCourse.corequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    const norm = normalizeCode(selectedCourse.code)
    const next = programCourses.filter((c) => {
      if (c.id === selectedCourse.id) return false
      const preCodes = (c.prerequisite || '').split(',').map((s) => normalizeCode(s.trim())).filter(Boolean)
      const coCodes = (c.corequisite || '').split(',').map((s) => normalizeCode(s.trim())).filter(Boolean)
      return preCodes.includes(norm) || coCodes.includes(norm)
    }).length
    let clos = -1
    if (datasets) {
      const key = normalizeCode(selectedCourse.code)
      clos = datasets.clos.filter((clo) => cloMatchesSubject(clo.course || '', key)).length
    }
    return { pre, core, next, clos }
  }, [selectedCourse, datasets, programCourses])

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
      setDatasets({
        resources: resources.filter(isActive),
        clos: clos.filter(isActive),
        pos: pos.filter(isActive),
        peos: peos.filter(isActive),
        sgs: sgs.filter(isActive),
        cmos: cmos.filter(isActive),
      })
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to load relationships.')
    } finally {
      setSpinner(false)
    }
  }

  // ── Build the graph model ──────────────────────────────────────────────────
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
          const target = programCourses.find((c) => normalizeCode(c.code) === normalizeCode(code))
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

      // Subjects that require this subject (reverse pre-req / co-req) — e.g. IT12 lists IT10.
      const subjectCodeNorm = normalizeCode(subject.code)
      for (const c of programCourses) {
        if (c.id === subject.id) continue
        const preCodes = (c.prerequisite || '').split(',').map((s) => normalizeCode(s.trim())).filter(Boolean)
        const coCodes = (c.corequisite || '').split(',').map((s) => normalizeCode(s.trim())).filter(Boolean)
        if (preCodes.includes(subjectCodeNorm) || coCodes.includes(subjectCodeNorm)) {
          // Avoid duplicate if already added as a satellite (circular prereq)
          if (subjectNode.children.some((ch) => ch.courseId === c.id)) continue
          subjectNode.children.push({
            id: `dependent-${c.id}`,
            code: c.code,
            title: c.title,
            kind: 'dependent',
            placeholder: false,
            courseId: c.id,
            children: [],
          })
        }
      }

      // CLOs whose course matches the selected subject code.
      const subjectClos = datasetsRef.clos.filter((clo) =>
        cloMatchesSubject(clo.course || '', subjectKey)
      )

      const poMap = new Map<string, GraphNodeData>()

      const addLeaves = (poNode: GraphNodeData, poRec: ProgramOutcomeStandalone) => {
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
            const tok = poRec.sg_text ? extractCodes(poRec.sg_text, 'SG')[0] : ''
            pushChild({ id: `sg-missing-${poRec.sg_id}`, code: tok || 'SG', title: 'Strategic Goal not found or archived', kind: 'sg', placeholder: true, children: [] })
          }
        } else if (poRec.sg_text) {
          for (const tok of extractCodes(poRec.sg_text, 'SG')) {
            const rec = datasetsRef.sgs.find((s) => normalizeCode(s.code) === normalizeCode(tok))
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
          const hay = normalizeCode(`${poRec.description || ''} ${poRec.title || ''}`)
          for (const rec of datasetsRef.cmos) {
            const key = normalizeCode(rec.code)
            if (key && hay.includes(key)) {
              pushChild({ id: `cmo-${rec.id}`, code: rec.code, title: rec.title || rec.code, kind: 'cmo', placeholder: false, children: [] })
              break
            }
          }
        }
      }

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
              children: [],
            }
            if (poRec) addLeaves(poNode, poRec)
            poMap.set(key, poNode)
          }
          if (!cloNode.children.some((c) => c.id === poNode!.id)) cloNode.children.push(poNode!)
        }
        subjectNode.children.push(cloNode)
      }

      return subjectNode
    },
    [programCourses],
  )

  // Unique node counts per kind once a graph is on screen (used in the legend).
  const graphStats = useMemo(() => {
    if (!selectedCourse || !datasets) return null
    try {
      return countKinds(buildGraphModel(datasets, selectedCourse))
    } catch {
      return null
    }
  }, [selectedCourse, datasets, buildGraphModel])

  // Collapse every expandable node except the center subject.
  const collapseAll = useCallback(() => {
    if (!datasets || !selectedCourse) return
    const data = buildGraphModel(datasets, selectedCourse)
    const ids = new Set<string>()
    const collect = (n: GraphNodeData) => {
      if (n.children?.length) { ids.add(n.id); n.children.forEach(collect) }
    }
    collect(data)
    ids.delete(data.id) // keep the subject ring visible
    setCollapsedIds(ids)
  }, [datasets, selectedCourse, buildGraphModel])

  // Reset the SVG zoom/pan transform to its default framed view.
  const resetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity)
    }
  }, [])

  const handleRefresh = async () => {
    if (!selectedCourse) return
    setGraphError('')
    await loadDatasets(true)
  }

  // Jump back to a subject earlier in the navigation trail.
  const handleCrumb = useCallback((i: number) => {
    if (!selectedCourseId || navStack.length === 0) return
    const trail = [...navStack, selectedCourseId]
    if (i >= trail.length - 1) return
    setSelectedCourseId(trail[i])
    setNavStack(navStack.slice(0, i))
    setShowGraph(true)
    setGraphError('')
  }, [selectedCourseId, navStack])

  // ── D3 tree render (advanced branching visualization) ─────────────────────
  // Vertical top-down tree: Subject (root) → Curriculum / CLO / Pre-req / Co-req → PO → PEO/SG/CMO
  // Smooth curved links (d3.linkVertical with the default bumpY curve),
  // drop-shadow nodes, keyed enter/update/exit transitions, hover, drag, zoom.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !selectedCourse || !datasets) return () => {}

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    const width = containerSize.w || svgEl.clientWidth || 760

    // ── Build hierarchy + flatten with expand/collapse ───────────────
    interface TreeNode {
      id: string
      code: string
      title: string
      kind: NodeKind
      placeholder: boolean
      courseId?: string
      depth: number
      x: number
      y: number
      expandable: boolean
      collapsed: boolean
    }
    interface TreeLink {
      source: TreeNode
      target: TreeNode
      dashed: boolean
    }

    const data = buildGraphModel(datasets, selectedCourse)

    const root = d3.hierarchy<GraphNodeData>(data, (d) =>
      collapsedIds.has(d.id) ? undefined : d.children
    )
    const treeLayout = d3.tree<GraphNodeData>()
      .nodeSize([190, 135])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.55))
    treeLayout(root)

    // Center horizontally, keep a comfortable top margin.
    const xs = root.descendants().map((d) => d.x ?? 0)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const treeWidth = maxX - minX || 1
    const offsetX = width / 2 - (minX + treeWidth / 2)
    const offsetY = 62

    const nodes: TreeNode[] = root.descendants().map((d) => ({
      id: d.data.id,
      code: d.data.code,
      title: d.data.title,
      kind: d.data.kind,
      placeholder: d.data.placeholder,
      courseId: d.data.courseId,
      depth: d.depth,
      x: (d.x ?? 0) + offsetX,
      y: (d.y ?? 0) + offsetY,
      expandable: !!(d.data.children && d.data.children.length > 0),
      collapsed: collapsedIds.has(d.data.id),
    }))
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const links: TreeLink[] = root.links().map((l) => ({
      source: nodeById.get(l.source.data.id)!,
      target: nodeById.get(l.target.data.id)!,
      dashed: l.target.data.kind === 'corequisite' || l.target.data.placeholder,
    }))

    const radiusOf = (d: TreeNode) =>
      d.depth === 1 ? 27 : d.depth === 2 ? 23 : 18

    // ── Defs: drop shadow + glow for nodes ──────────────────────────
    const defs = svg.append('defs')
    defs.append('filter')
      .attr('id', 'subject-view-shadow')
      .attr('x', '-60%').attr('y', '-60%')
      .attr('width', '220%').attr('height', '220%')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 2.5)
      .attr('flood-color', 'rgba(15, 23, 42, 0.28)')

    const zoomGroup = svg.append('g')

    // ── Links: smooth vertical S-curves ─────────────────────────────
    const linkPath = d3.linkVertical<TreeLink, TreeNode>()
      .x((d) => d.x)
      .y((d) => d.y)

    const link = zoomGroup.append('g')
      .attr('class', 'subject-view__links')
      .selectAll<SVGPathElement, TreeLink>('path.subject-view__link')
      .data(links, (l) => l.target.id)
      .join(
        (enter) => enter
          .append('path')
          .attr('class', 'subject-view__link')
          .attr('fill', 'none')
          .attr('stroke', (l) => (l.target.placeholder ? '#a5b4c8' : '#7c8ba1'))
          .attr('stroke-width', 2)
          .attr('stroke-linecap', 'round')
          .attr('stroke-dasharray', (l) => (l.dashed ? '6 4' : 'none'))
          .attr('d', (l) => linkPath(l))
          .style('opacity', 0)
          .call((s) => s.transition().duration(500).delay(160).style('opacity', 1)),
        (update) => update
          .attr('stroke', (l) => (l.target.placeholder ? '#a5b4c8' : '#7c8ba1'))
          .attr('stroke-dasharray', (l) => (l.dashed ? '6 4' : 'none'))
          .call((s) => s.transition().duration(450).ease(d3.easeCubicInOut).attr('d', (l) => linkPath(l))),
        (exit) => exit.call((s) => s.transition().duration(200).style('opacity', 0).remove()),
      )

    // ── Nodes: keyed <g> groups with animated transitions ───────────
    const node = zoomGroup.append('g')
      .attr('class', 'subject-view__nodes')
      .selectAll<SVGGElement, TreeNode>('g.subject-view__node')
      .data(nodes, (d) => d.id)
      .join(
        (enter) => {
          const g = enter.append('g')
            .attr('class', 'subject-view__node')
            .attr('transform', (d) => `translate(${d.x},${d.y + 16})`)
            .style('opacity', 0)
            .style('filter', 'url(#subject-view-shadow)')
            .attr('cursor', (d) => (d.expandable || d.courseId ? 'pointer' : 'default'))

          // Subject double-ring (root)
          g.filter((d) => d.kind === 'subject')
            .append('circle').attr('class', 'subject-view__ring')
            .attr('r', 42)
            .attr('fill', 'rgba(37, 99, 235, 0.16)')
            .attr('stroke', '#2563eb')
            .attr('stroke-width', 1.5)
          g.filter((d) => d.kind === 'subject')
            .append('circle').attr('class', 'subject-view__core')
            .attr('r', 34)
            .attr('fill', colorMap.subject)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2.5)

          // Curriculum ellipse
          g.filter((d) => d.kind === 'curriculum')
            .append('ellipse').attr('class', 'subject-view__shape')
            .attr('rx', 58).attr('ry', 25)
            .attr('fill', (d) => (d.placeholder ? '#f8fafc' : colorMap.curriculum))
            .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : colorMap.curriculum))
            .attr('stroke-dasharray', (d) => (d.placeholder ? '5 3' : 'none'))
            .attr('stroke-width', '2')

          // All other nodes as circles
          g.filter((d) => d.kind !== 'subject' && d.kind !== 'curriculum')
            .append('circle').attr('class', 'subject-view__shape')
            .attr('r', radiusOf)
            .attr('fill', (d) => (d.placeholder ? '#f8fafc' : colorMap[d.kind]))
            .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : colorMap[d.kind]))
            .attr('stroke-dasharray', (d) => (d.placeholder ? '5 3' : 'none'))
            .attr('stroke-width', '2')

          // Code label inside the node
          g.append('text').attr('class', 'subject-view__label')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', (d) => (d.placeholder ? '#64748b' : '#fff'))
            .attr('font-size', (d) => (d.depth <= 1 ? 13.5 : d.depth === 2 ? 11 : 9.5))
            .attr('font-weight', 'bold')
            .attr('pointer-events', 'none')
            .text((d) => {
              const max = d.depth <= 1 ? 16 : d.depth === 2 ? 9 : 7
              const code = d.code.length > max ? d.code.slice(0, max - 1) + '…' : d.code
              return code + (d.placeholder && d.kind !== 'curriculum' ? '?' : '')
            })

          // Expand / collapse badge
          g.filter((d) => d.expandable && d.depth !== 0)
            .each(function (d) {
              const sel = d3.select(this)
              const bx = d.kind === 'curriculum' ? 58 : radiusOf(d)
              const by = d.kind === 'curriculum' ? 0 : -radiusOf(d)
              sel.append('circle').attr('class', 'subject-view__badge')
                .attr('r', 9).attr('cx', bx).attr('cy', by)
                .attr('fill', '#fff')
                .attr('stroke', '#cbd5e1')
                .attr('stroke-width', 1.5)
              sel.append('text').attr('class', 'subject-view__badge-text')
                .attr('x', bx).attr('y', by)
                .attr('dy', '0.32em').attr('text-anchor', 'middle')
                .attr('font-size', '12px').attr('font-weight', '700')
                .attr('fill', '#334155').attr('pointer-events', 'none')
                .text(d.collapsed ? '+' : '−')
            })

          // Entrance: rise up and fade in, staggered by depth.
          g.transition()
            .duration(450)
            .delay((d) => d.depth * 60)
            .ease(d3.easeCubicOut)
            .style('opacity', 1)
            .attr('transform', (d) => `translate(${d.x},${d.y})`)

          return g
        },
        (update) => {
          update
            .attr('cursor', (d) => (d.expandable || d.courseId ? 'pointer' : 'default'))
            .select('.subject-view__badge-text')
            .text((d) => (d.collapsed ? '+' : '−'))
          update.transition()
            .duration(450).ease(d3.easeCubicInOut)
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
          return update
        },
        (exit) => exit.call((s) => s.transition().duration(200).style('opacity', 0).remove()),
      )

    // ── Drag: fix position on drag, release on end ──────────────────
    const drag = d3.drag<SVGGElement, TreeNode>()
      .on('start', (event, d) => {
        node.interrupt()
        link.interrupt()
        d.x = event.x
        d.y = event.y
      })
      .on('drag', (event, d) => {
        d.x = event.x
        d.y = event.y
        d3.select(event.sourceEvent.target.parentNode as Element)
          .attr('transform', `translate(${d.x},${d.y})`)
        link.attr('d', (l) => linkPath(l))
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.each(function () { (d3 as any).select(this).call(drag) })

    // ── Hover: highlight connected nodes + links, show tooltip ──────
    const highlightConnections = (d: TreeNode) => {
      const connectedIds = new Set<string>()
      const connectedLinks: TreeLink[] = []
      links.forEach((l) => {
        if (l.source.id === d.id) { connectedIds.add(l.target.id); connectedLinks.push(l) }
        else if (l.target.id === d.id) { connectedIds.add(l.source.id); connectedLinks.push(l) }
      })
      node.classed('subject-view__node--highlight', (n: TreeNode) => connectedIds.has(n.id))
      link.classed('subject-view__link--highlight', (l: TreeLink) => connectedLinks.includes(l))
    }

    node
      .on('mouseenter', (event, d) => {
        highlightConnections(d)
        tip.style.opacity = '1'
        tip.style.left = `${event.offsetX + 12}px`
        tip.style.top = `${event.offsetY - 28}px`
        tip.innerHTML = `<strong>${d.code}</strong><br/>${d.title}`
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

    // ── Click: expand/collapse, jump to a linked subject, or drill ──
    node.on('click', (event, d) => {
      event.stopPropagation()
      if (d.courseId && !d.expandable) {
        const target = programCourses.find((c) => c.id === d.courseId)
        if (target && selectedCourseId && target.id !== selectedCourseId) {
          // Connected subject: jump straight to its graph and remember the trail.
          setNavStack((prev) => [...prev, selectedCourseId])
          setSelectedCourseId(target.id)
          setShowGraph(true)
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

    // ── Zoom / pan ──────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => zoomGroup.attr('transform', event.transform))
    svg.call(zoom)
    zoomRef.current = zoom

    return () => { svg.on('.zoom', null); zoomRef.current = null }
  }, [selectedCourse, datasets, containerSize, collapsedIds, buildGraphModel, programCourses, selectedCourseId, setSelectedCourseId])

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
  }, [showGraph, datasets])

  // Render the graph once everything is ready.
  useEffect(() => {
    if (!showGraph || !selectedCourse || !datasets) return
    try {
      return renderGraph()
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to render graph.')
      return undefined
    }
  }, [showGraph, selectedCourse, datasets, containerSize, renderGraph, setGraphError])

  const handleView = async () => {
    if (!selectedCourse) return
    setShowGraph(true)
    setGraphError('')
    await loadDatasets()
  }

  if (loading) return <p>Loading subjects...</p>

  return (
    <div className="subject-view">
      {error && <p className="msg msg--error">{error}</p>}

      <div className="subject-view__panels">
        {/* ── Left panel: program + subject selection ───────────────────── */}
        <div className="panel subject-view__left">
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

          {leftCounts && (
            <div className="subject-view__summary">
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">Pre-reqs</span>
                <span className="subject-view__summary-value" style={{ color: '#f97316' }}>{leftCounts.pre}</span>
              </div>
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">Co-reqs</span>
                <span className="subject-view__summary-value" style={{ color: '#22c55e' }}>{leftCounts.core}</span>
              </div>
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">Next</span>
                <span className="subject-view__summary-value" style={{ color: '#eab308' }}>{leftCounts.next}</span>
              </div>
              <div className="subject-view__summary-item">
                <span className="subject-view__summary-label">CLOs</span>
                <span className="subject-view__summary-value" style={{ color: '#06b6d4' }}>{leftCounts.clos >= 0 ? leftCounts.clos : '–'}</span>
              </div>
            </div>
          )}

          <button className="btn btn--sm subject-view__view-btn" disabled={!selectedCourse || loading || spinner}
            onClick={handleView}>
            {spinner ? 'Loading…' : 'View Graph'}
          </button>
        </div>

        {/* ── Right panel: D3 hierarchy graph ───────────────────────────── */}
        <div className="panel subject-view__right" style={{ position: 'relative' }}>
          {!showGraph ? (
            <div className="subject-view__placeholder">
              <div className="subject-view__placeholder-card">
                <div className="subject-view__placeholder-icon">
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="6" cy="6" r="2.5" />
                    <circle cx="18" cy="6" r="2.5" />
                    <circle cx="12" cy="18" r="2.5" />
                    <path d="M8 7l2.5 9M16 7l-3.5 9M6 6h12" />
                  </svg>
                </div>
                <h4>Outcome map for a subject</h4>
                <p>Pick a <strong>program</strong> and a <strong>subject</strong> on the left, then press <strong>View Graph</strong> to see how its CLOs, POs, PEOs, Strategic Goals, and CMOs connect.</p>
              </div>
            </div>
          ) : graphError ? (
            <p className="msg msg--error">{graphError}</p>
          ) : spinner || !datasets ? (
            <div className="subject-view__loading">
              <span className="subject-view__spinner" aria-hidden />
              <span>Loading relationships…</span>
            </div>
          ) : !selectedCourse ? (
            <div className="subject-view__placeholder">
              <p>Select a subject on the left, then press View.</p>
            </div>
          ) : (
            <div className="subject-view__graph-area">
              {navStack.length > 0 && (
                <nav className="subject-view__crumbs" aria-label="Subject trail">
                  {[...navStack, selectedCourse.id].map((id, i) => {
                    const crumb = programCourses.find((c) => c.id === id)
                    const isLast = i === navStack.length
                    return (
                      <span className="subject-view__crumb-node" key={`${id}-${i}`}>
                        {i > 0 && <span className="subject-view__crumb-sep" aria-hidden>→</span>}
                        <button
                          type="button"
                          className={`subject-view__crumb${isLast ? ' subject-view__crumb--current' : ''}`}
                          disabled={isLast}
                          title={crumb ? `${crumb.code} — ${crumb.title}` : 'Unknown subject'}
                          onClick={() => handleCrumb(i)}>
                          {crumb?.code ?? '…'}
                        </button>
                      </span>
                    )
                  })}
                </nav>
              )}
              <div className="subject-view__graph-toolbar">
                <h3 className="subject-view__graph-title">{selectedCourse.code} — {selectedCourse.title}</h3>
                <div className="subject-view__graph-actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => setCollapsedIds(new Set())} title="Expand every branch">Expand all</button>
                  <button className="btn btn--ghost btn--sm" onClick={collapseAll} title="Collapse to the first ring">Collapse all</button>
                  <button className="btn btn--ghost btn--sm" onClick={resetZoom} title="Center the graph and reset zoom">Reset view</button>
                  <button className="btn btn--ghost btn--sm" onClick={handleRefresh} disabled={spinner} title="Reload relationship data">Refresh</button>
                </div>
              </div>
              <p className="subject-view__graph-hint">Click a branch node to expand or collapse. Click a pre-req, co-req or next subject to jump to that subject. Drag nodes to reposition. Scroll to zoom.</p>
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
    </div>
  )
}
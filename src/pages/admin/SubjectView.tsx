// Admin Subject View: two-panel layout — left panel has program dropdown +
// subject dropdown; right panel renders a D3.js outcome hierarchy graph:
//
//   Curriculum
//     └─ Subject
//        ├─ Prerequisite(s)
//        ├─ Corequisite(s)
//        └─ CLO(s)
//           └─ PO(s)
//              ├─ PEO
//              ├─ Strategic Goal
//              └─ CHED Memorandum Order
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

// Strategic Goals in DB use code "Goal N" (e.g. "Goal 1") not "SG-N". Accept both prefixes
// and normalize to "Goal-N" for matching against strategic_goals.code.
const extractSgCodes = (text: string): string[] => {
  const out: string[] = []
  const re = /(?:SG|Goal)\s*-?\s*(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(`Goal-${m[1]}`)
  return Array.from(new Set(out))
}

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
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Reset expand/collapse when subject changes — like branch-visualizer fresh state.
  useEffect(() => { setCollapsedIds(new Set()) }, [selectedCourseId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, c] = await Promise.all([fetchPrograms(), fetchCourses()])
        if (!cancelled) {
          setPrograms(p)
          setCourses(c.filter(isActive))
          if (p.length > 0 && !selectedProgramId) setSelectedProgramId(p[0].id)
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

  // ── Load + cache outcome datasets on first View ────────────────────────────
  const loadDatasets = async () => {
    if (datasets) return
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

      // CLOs whose course matches the selected subject code.
      // Lenient: handles "IT 21", "IT21", "IT 21 - OOP", "IT21-OOP", "IT-21" etc.
      const subjectClos = datasetsRef.clos.filter((clo) => {
        const raw = (clo.course || '').trim()
        if (!raw) return false
        const norm = normalizeCode(raw)
        if (norm === subjectKey) return true
        if (normalizeCode(firstToken(raw)) === subjectKey) return true
        // contains check for "IT 21 - OOP" -> "IT21OOP" contains "IT21"
        if (norm.includes(subjectKey)) return true
        // token-wise check: split raw into tokens and see if any token normalizes to subject
        const tokens = raw.split(/[\s,;|]+/).map((s) => normalizeCode(s)).filter(Boolean)
        if (tokens.includes(subjectKey)) return true
        return false
      })

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
        // DB strategic_goals use code "Goal N" (e.g. "Goal 1") — accept both "SG-N" and "Goal N" forms.
        if (poRec.sg_id) {
          const rec = datasetsRef.sgs.find((s) => s.id === poRec.sg_id)
          if (rec) pushChild({ id: `sg-${rec.id}`, code: rec.code, title: rec.description || rec.title || rec.code, kind: 'sg', placeholder: false, children: [] })
          else {
            const tok = poRec.sg_text ? (extractSgCodes(poRec.sg_text)[0] || extractCodes(poRec.sg_text, 'SG')[0]) : ''
            pushChild({ id: `sg-missing-${poRec.sg_id}`, code: tok || 'SG', title: 'Strategic Goal not found or archived', kind: 'sg', placeholder: true, children: [] })
          }
        } else if (poRec.sg_text) {
          for (const tok of extractSgCodes(poRec.sg_text)) {
            // Match by normalized code ("Goal-1" vs "Goal 1" => "GOAL1") or by numeric fallback
            const rec = datasetsRef.sgs.find((s) => normalizeCode(s.code) === normalizeCode(tok))
              ?? datasetsRef.sgs.find((s) => (s.code.match(/\d+/)?.[0] ?? '') === (tok.match(/\d+/)?.[0] ?? ''))
            pushChild(rec
              ? { id: `sg-${rec.id}`, code: rec.code, title: rec.description || rec.title || rec.code, kind: 'sg', placeholder: false, children: [] }
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

      // Curriculum root.
      const cidOpt = subject.curriculum_id
      const cid = cidOpt && typeof cidOpt === 'object' ? cidOpt.id : cidOpt
      const curRec = cid ? datasetsRef.resources.find((r) => r.id === cid) : undefined
      const curriculumNode: GraphNodeData = curRec
        ? {
            id: `cur-${curRec.id}`,
            code: (curRec.code || curRec.title),
            title: curRec.title,
            kind: 'curriculum',
            placeholder: false,
            children: [subjectNode],
          }
        : {
            id: `cur-none-${cid || 'x'}`,
            code: 'No curriculum',
            title: cid ? 'Curriculum not found or archived' : 'This subject has no curriculum assigned',
            kind: 'curriculum',
            placeholder: true,
            children: [subjectNode],
          }

      return curriculumNode
    },
    [programCourses],
  )

  // ── D3 tree render matching hand sketch e9b5b3f5: curriculum → IT10 → CLO1/CLO2 → PO1/PO2/PO11 … → CMO/PEO/SG
  // Vertical top-down tree, straight lines like branch-visualizer.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !selectedCourse || !datasets) return () => {}

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    const width = containerSize.w || svgEl.clientWidth || 760
    const height = Math.max(containerSize.h || svgEl.clientHeight || 560, 560)

    // Keep the original hierarchy (curriculum at top) — matches the sketch:
    // curriculum → subject (IT10) → CLO1/CLO2 → PO… → PEO/SG/CMO
    const data = buildGraphModel(datasets, selectedCourse)

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
      stroke: string
    }

    // d3 tree: top-down, hide collapsed children like expandable branch visualizer
    const root = d3.hierarchy<GraphNodeData>(data, (d) =>
      collapsedIds.has(d.id) ? undefined : d.children
    )
    const treeLayout = d3.tree<GraphNodeData>().nodeSize([150, 110])
    treeLayout(root)

    // Center the tree horizontally in the SVG
    const xs = root.descendants().map((d) => d.x ?? 0)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const treeWidth = maxX - minX || 1
    const offsetX = width / 2 - (minX + treeWidth / 2)
    const offsetY = 50

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
    const links: TreeLink[] = root.links().map((l) => {
      const s = nodeById.get(l.source.data.id)!
      const t = nodeById.get(l.target.data.id)!
      return {
        source: s,
        target: t,
        dashed: l.target.data.kind === 'corequisite' || l.target.data.placeholder,
        stroke: l.target.data.placeholder ? '#94a3b8' : '#64748b',
      }
    })

    const radiusOf = (d: TreeNode) =>
      d.depth === 0 ? 28 : d.depth === 1 ? 30 : d.depth === 2 ? 26 : d.depth === 3 ? 22 : 18

    const zoomGroup = svg.append('g')

    // ── Links as straight <line> like branch-visualizer ─────
    const link = zoomGroup.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', (l) => l.stroke)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (l) => (l.dashed ? '6 4' : 'none'))
      .attr('x1', (l) => l.source.x)
      .attr('y1', (l) => l.source.y)
      .attr('x2', (l) => l.target.x)
      .attr('y2', (l) => l.target.y)

    // ── Nodes ───────────────────────────────────────────────────────────
    const node = zoomGroup.append('g')
      .selectAll<SVGGElement, TreeNode>('g')
      .data(nodes)
      .join('g')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .attr('cursor', (d) => (d.expandable ? 'pointer' : d.courseId ? 'pointer' : 'default'))

    const drag = d3.drag<SVGGElement, TreeNode>()
      .on('drag', (event, d) => {
        d.x = event.x
        d.y = event.y
        d3.select(event.sourceEvent.target.parentNode as Element).attr('transform', `translate(${d.x},${d.y})`)
        link
          .attr('x1', (l) => l.source.x)
          .attr('y1', (l) => l.source.y)
          .attr('x2', (l) => l.target.x)
          .attr('y2', (l) => l.target.y)
      })

    node.each(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(d3 as any).select(this).call(drag)
    })

    // Subject (IT10 in sketch) is double-ring; curriculum (top oval) is single.
    node.filter((d) => d.depth === 1 && d.kind === 'subject').append('circle')
      .attr('r', 37)
      .attr('fill', 'rgba(37, 99, 235, 0.22)')
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 2)
    node.filter((d) => d.depth === 1 && d.kind === 'subject').append('circle')
      .attr('r', 30)
      .attr('fill', colorMap.subject)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Curriculum oval (top) — matches hand sketch: wide oval, not circle
    node.filter((d) => d.depth === 0).append('ellipse')
      .attr('rx', 52)
      .attr('ry', 22)
      .attr('fill', (d) => (d.placeholder ? '#f8fafc' : colorMap.curriculum))
      .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : colorMap.curriculum))
      .attr('stroke-dasharray', (d) => (d.placeholder ? '5 3' : 'none'))
      .attr('stroke-width', (d) => (d.expandable && d.collapsed ? 3 : 2))

    node.filter((d) => d.depth !== 0 && !(d.depth === 1 && d.kind === 'subject')).append('circle')
      .attr('r', (d) => radiusOf(d))
      .attr('fill', (d) => (d.placeholder ? '#f8fafc' : colorMap[d.kind]))
      .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : colorMap[d.kind]))
      .attr('stroke-dasharray', (d) => (d.placeholder ? '5 3' : 'none'))
      .attr('stroke-width', (d) => (d.expandable && d.collapsed ? 3 : 2))

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('fill', (d) => (d.placeholder ? '#64748b' : '#fff'))
      .attr('font-size', (d) => (d.depth <= 1 ? 13 : d.code.length > 10 ? 9 : 11))
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => (d.code.length > 14 ? d.code.slice(0, 12) + '…' : d.code) + (d.placeholder && d.kind !== 'curriculum' ? '?' : ''))

    // Expand/collapse badge — exactly like branch-visualizer expandable
    const badge = node.filter((d) => d.expandable && d.depth !== 0)
    badge.append('circle')
      .attr('r', 7)
      .attr('cx', (d) => (d.kind === 'curriculum' ? 52 : radiusOf(d)) - 2)
      .attr('cy', (d) => (d.kind === 'curriculum' ? 0 : -radiusOf(d)) + 2)
      .attr('fill', '#fff')
      .attr('stroke', (d) => colorMap[d.kind])
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none')
    badge.append('text')
      .attr('x', (d) => (d.kind === 'curriculum' ? 52 : radiusOf(d)) - 2)
      .attr('y', (d) => (d.kind === 'curriculum' ? 4 : -radiusOf(d)) + 6.5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('fill', (d) => colorMap[d.kind])
      .attr('pointer-events', 'none')
      .text((d) => (d.collapsed ? '+' : '−'))

    // Hover: highlight connected (branch-visualizer style)
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

    // Click: expand/collapse if expandable, else drill into course
    node.on('click', (event, d) => {
      event.stopPropagation()
      if (d.courseId && !d.expandable) { setSelectedCourseId(d.courseId); setShowGraph(false); return }
      if (d.expandable) {
        setCollapsedIds((prev) => {
          const next = new Set(prev)
          if (next.has(d.id)) next.delete(d.id)
          else next.add(d.id)
          return next
        })
      } else if (d.courseId) {
        setSelectedCourseId(d.courseId); setShowGraph(false)
      }
    })

    // ── Zoom / pan ──────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => zoomGroup.attr('transform', event.transform))

    svg.call(zoom)

    return () => {
      svg.on('.zoom', null)
    }
  }, [selectedCourse, datasets, containerSize, collapsedIds, buildGraphModel, setSelectedCourseId])

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

  const graphBlockVisible = showGraph && selectedCourse && datasets

  return (
    <div className="subject-view">
      {error && <p className="msg msg--error">{error}</p>}

      <div className="subject-view__panels">
        {/* ── Left panel: program + subject selection ───────────────────── */}
        <div className="panel subject-view__left">
          <h3>Programs</h3>
          <label className="field">
            <span className="sr-only">Select program</span>
            <select className="input input--sm" value={selectedProgramId}
              onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedCourseId(null); setShowGraph(false) }}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.code}</option>
              ))}
            </select>
          </label>

          <h3 className="subject-view__course-heading">Subject Code</h3>
          <label className="field">
            <span className="sr-only">Select course</span>
            <select className="input input--sm" value={selectedCourseId ?? ''}
              onChange={(e) => { setSelectedCourseId(e.target.value || null); setShowGraph(false) }}>
              <option value="">— Select a course —</option>
              {programCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
              ))}
            </select>
          </label>
          <button className="btn btn--sm subject-view__view-btn" disabled={!selectedCourse || loading}
            onClick={handleView}>
            View
          </button>
        </div>

        {/* ── Right panel: D3 hierarchy graph ───────────────────────────── */}
        <div className="panel subject-view__right" style={{ position: 'relative' }}>
          {!showGraph ? (
            <div className="subject-view__placeholder">
              <p>Select a subject on the left, then press View.</p>
            </div>
          ) : graphError ? (
            <p className="msg msg--error">{graphError}</p>
          ) : spinner || !datasets ? (
            <p className="subject-view__loading">Loading relationships...</p>
          ) : !selectedCourse ? (
            <div className="subject-view__placeholder">
              <p>Select a subject on the left, then press View.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <h3 className="subject-view__graph-title" style={{ margin: 0 }}>
                  {selectedCourse.code} — {selectedCourse.title}
                </h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setCollapsedIds(new Set())} title="Expand all branches">Expand all</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => {
                    // Collapse every expandable node except the center subject
                    const data = buildGraphModel(datasets!, selectedCourse!)
                    const ids = new Set<string>()
                    const collect = (n: GraphNodeData) => { if (n.children?.length) { ids.add(n.id); n.children.forEach(collect) } }
                    // collect from subject level (skip curriculum wrapper)
                    const subj = data.children[0]
                    if (subj) collect(subj)
                    // don't collapse the subject itself so the first ring stays visible
                    ids.delete(subj.id)
                    setCollapsedIds(ids)
                  }} title="Collapse to first ring">Collapse all</button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 8px' }}>Click a branch node to expand / collapse — like the branch-visualizer.</p>
              <div className="subject-view__legend">
                <span><span className="subject-view__dot subject-view__dot--curriculum" /> Curriculum</span>
                <span><span className="subject-view__dot subject-view__dot--subject" /> Subject</span>
                <span><span className="subject-view__dot subject-view__dot--prereq" /> Pre-req</span>
                <span><span className="subject-view__dot subject-view__dot--coreq" /> Co-req</span>
                <span><span className="subject-view__dot subject-view__dot--clo" /> CLO</span>
                <span><span className="subject-view__dot subject-view__dot--po" /> PO</span>
                <span><span className="subject-view__dot subject-view__dot--peo" /> PEO</span>
                <span><span className="subject-view__dot subject-view__dot--sg" /> SG</span>
                <span><span className="subject-view__dot subject-view__dot--cmo" /> CMO</span>
                <span><span className="subject-view__dot subject-view__dot--placeholder" /> Unresolved</span>
              </div>
              <div ref={tooltipRef} className="subject-view__tooltip" />
              <svg ref={svgRef} className="subject-view__svg" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
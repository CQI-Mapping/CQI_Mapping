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
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

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

  // ── D3 radial mind-map render ────────────────────────────────────────────
  // Center-out layout matching the reference sketch: the selected subject sits
  // in the middle, prerequisites / corequisites / curriculum / CLOs ring around
  // it, POs form the next ring, and PEO / SG / CMO leaves sit outermost.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !selectedCourse || !datasets) return () => {}

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    const width = containerSize.w || svgEl.clientWidth || 640
    const height = containerSize.h || svgEl.clientHeight || 460
    const cx = width / 2
    const cy = height / 2

    const data = buildGraphModel(datasets, selectedCourse)

    // Re-root at the subject so it renders in the center; the curriculum
    // becomes one branch of the first ring.
    const subjectData = data.children[0]
    const curriculumLeaf: GraphNodeData = { ...data, children: [] }
    const rootData: GraphNodeData = {
      ...subjectData,
      children: [curriculumLeaf, ...(subjectData.children ?? [])],
    }

    interface MindNode extends d3.SimulationNodeDatum {
      id: string
      code: string
      title: string
      kind: NodeKind
      placeholder: boolean
      courseId?: string
      depth: number
      ring: number
    }
    interface MindLink extends d3.SimulationLinkDatum<MindNode> {
      label: string | null
      dashed: boolean
      stroke: string
    }

    // Concentric rings sized to the viewport.
    const unit = Math.min(width, height)
    const RING_0 = Math.min(160, Math.max(110, unit * 0.22))
    const RING_GAP = Math.min(155, Math.max(110, unit * 0.2))
    const ringOf = (depth: number) => (depth === 0 ? 0 : RING_0 + (depth - 1) * RING_GAP)

    const nodes: MindNode[] = []
    const links: MindLink[] = []

    const walk = (d: GraphNodeData, depth: number, parent: MindNode | null, angle: number) => {
      const ring = ringOf(depth)
      const node: MindNode = {
        id: d.id,
        code: d.code,
        title: d.title,
        kind: d.kind,
        placeholder: d.placeholder,
        courseId: d.courseId,
        depth,
        ring,
        x: cx + Math.cos(angle) * ring,
        y: cy + Math.sin(angle) * ring,
        fx: depth === 0 ? cx : undefined,
        fy: depth === 0 ? cy : undefined,
      }
      nodes.push(node)
      if (parent) {
        let label: string | null = null
        if (depth === 1) {
          if (d.kind === 'prerequisite') label = 'pre-req'
          else if (d.kind === 'corequisite') label = 'co-req'
          else if (d.kind === 'curriculum') label = 'curriculum'
        }
        links.push({
          source: parent,
          target: node,
          label,
          dashed: d.kind === 'corequisite' || d.placeholder,
          stroke: d.placeholder ? '#94a3b8' : '#64748b',
        })
      }
      const kids = d.children ?? []
      kids.forEach((c, i) => {
        // First ring spreads evenly around the center; deeper levels fan out
        // around their parent for the organic sketch feel.
        const childAngle = depth === 0
          ? angle + (i * Math.PI * 2) / kids.length
          : angle + (i - (kids.length - 1) / 2) * 0.6
        walk(c, depth + 1, node, childAngle)
      })
    }
    walk(rootData, 0, null, -Math.PI / 2)

    const radiusOf = (d: MindNode) =>
      d.depth === 0 ? 30 : d.depth === 1 ? 24 : d.depth === 2 ? 20 : 16

    const sim = d3.forceSimulation<MindNode>(nodes)
      .force('link', d3.forceLink<MindNode, MindLink>(links).distance(130).strength(0.55))
      .force('charge', d3.forceManyBody().strength(-320))
      .force('collide', d3.forceCollide<MindNode>().radius((d) => radiusOf(d) + 16).strength(0.9))
      .force('ring', d3.forceRadial<MindNode>((d) => d.ring, cx, cy).strength((d) => (d.depth === 0 ? 0 : 0.9)))

    const zoomGroup = svg.append('g')

    // Gentle curve for each link, like the hand-drawn sketch.
    const curveOf = (s: MindNode, t: MindNode) => {
      const sx = s.x ?? cx
      const sy = s.y ?? cy
      const tx = t.x ?? cx
      const ty = t.y ?? cy
      const mx = (sx + tx) / 2
      const my = (sy + ty) / 2
      const dx = tx - sx
      const dy = ty - sy
      const len = Math.hypot(dx, dy) || 1
      const bow = Math.min(26, len * 0.12)
      const qx = mx - (dy / len) * bow
      const qy = my + (dx / len) * bow
      return {
        d: `M${sx},${sy} Q${qx},${qy} ${tx},${ty}`,
        mx: 0.25 * sx + 0.5 * qx + 0.25 * tx,
        my: 0.25 * sy + 0.5 * qy + 0.25 * ty,
      }
    }

    // ── Links ───────────────────────────────────────────────────────────
    const link = zoomGroup.append('g')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (l) => l.stroke)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (l) => (l.dashed ? '6 4' : 'none'))

    // Edge labels for the first ring.
    const linkLabel = zoomGroup.append('g')
      .selectAll('text')
      .data(links.filter((l) => l.label))
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text((l) => l.label ?? '')

    // ── Nodes ───────────────────────────────────────────────────────────
    const node = zoomGroup.append('g')
      .selectAll<SVGGElement, MindNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', (d) => (d.depth === 0 ? 'default' : 'grab'))

    const drag = d3.drag<SVGGElement, MindNode>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        if (d.depth === 0) return
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0)
        if (d.depth === 0) { d.fx = cx; d.fy = cy }
        else { d.fx = null; d.fy = null }
      })

    node.each(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(d3 as any).select(this).call(drag)
    })

    // Double ring for the selected subject (center).
    node.filter((d) => d.depth === 0).append('circle')
      .attr('r', 37)
      .attr('fill', 'rgba(37, 99, 235, 0.22)')
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 2)
    node.filter((d) => d.depth === 0).append('circle')
      .attr('r', 30)
      .attr('fill', colorMap.subject)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    node.filter((d) => d.depth !== 0).append('circle')
      .attr('r', (d) => radiusOf(d))
      .attr('fill', (d) => (d.placeholder ? '#f8fafc' : colorMap[d.kind]))
      .attr('stroke', (d) => (d.placeholder ? '#94a3b8' : colorMap[d.kind]))
      .attr('stroke-dasharray', (d) => (d.placeholder ? '5 3' : 'none'))
      .attr('stroke-width', 2)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('fill', (d) => (d.placeholder ? '#64748b' : '#fff'))
      .attr('font-size', (d) => (d.depth === 0 ? 13 : d.code.length > 10 ? 9 : 11))
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => (d.code.length > 14 ? d.code.slice(0, 12) + '…' : d.code) + (d.placeholder && d.kind !== 'curriculum' ? '?' : ''))

    // Hover: highlight connected nodes + links (from branch visualizer).
    const highlightConnections = (d: MindNode) => {
      const connectedIds = new Set<string>()
      const connectedLinks: MindLink[] = []
      links.forEach(l => {
        const srcId = (l.source as MindNode).id
        const tgtId = (l.target as MindNode).id
        if (srcId === d.id) { connectedIds.add(tgtId); connectedLinks.push(l) }
        else if (tgtId === d.id) { connectedIds.add(srcId); connectedLinks.push(l) }
      })
      node.classed('subject-view__node--highlight', (n: MindNode) => connectedIds.has(n.id))
      link.classed('subject-view__link--highlight', (l: MindLink) => connectedLinks.includes(l))
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

    // Click a resolved course node to select it in the left dropdown.
    node.on('click', (event, d) => {
      if (d.courseId) { setSelectedCourseId(d.courseId); setShowGraph(false) }
    })

    sim.on('tick', () => {
      link.attr('d', (l) => curveOf(l.source as MindNode, l.target as MindNode).d)
      linkLabel
        .attr('x', (l) => curveOf(l.source as MindNode, l.target as MindNode).mx)
        .attr('y', (l) => curveOf(l.source as MindNode, l.target as MindNode).my - 4)
      node.attr('transform', (d) => `translate(${d.x ?? cx},${d.y ?? cy})`)
    })

    // ── Zoom / pan ──────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => zoomGroup.attr('transform', event.transform))

    svg.call(zoom)

    return () => {
      sim.stop()
      svg.on('.zoom', null)
    }
  }, [selectedCourse, datasets, containerSize, buildGraphModel, setSelectedCourseId])

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
              <h3 className="subject-view__graph-title">
                {selectedCourse.code} — {selectedCourse.title}
              </h3>
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
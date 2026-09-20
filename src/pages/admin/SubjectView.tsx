// Admin Subject View — force-directed outcome hierarchy graph (Observable style).
// Left panel: program + subject selection; Right panel: D3 force simulation:
//
//   Subject (root) → Curriculum / Prerequisite / Corequisite / CLO → PO → PEO/SG/CMO
//
// Rewritten to match the Observable example you provided:
//   width 928, height 680, color = d3.scaleOrdinal(d3.schemeCategory10),
//   forceSimulation with link/charge/x/y, centered viewBox, line + circle,
//   title tooltip, drag (alphaTarget 0.3), tick updates.

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

const extractSgCodes = (text: string): string[] => {
  const re = /(?:SG|Goal)\s*-?\s*(\d+)/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(`Goal ${m[1]}`)
  return out
}

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

const legendDefs: Array<{ kind: NodeKind; label: string; tip: string }> = [
  { kind: 'curriculum', label: 'Curriculum', tip: 'Program curriculum the subject belongs to' },
  { kind: 'subject', label: 'Subject', tip: 'The selected subject' },
  { kind: 'prerequisite', label: 'Pre-req', tip: 'Prerequisite subject(s) for this subject' },
  { kind: 'corequisite', label: 'Co-req', tip: 'Corequisite subject(s) for this subject' },
  { kind: 'clo', label: 'CLO', tip: 'Course Learning Outcome(s) of this subject' },
  { kind: 'po', label: 'PO', tip: 'Program Outcome(s) the CLOs target' },
  { kind: 'peo', label: 'PEO', tip: 'Program Educational Objective(s)' },
  { kind: 'sg', label: 'SG', tip: 'Strategic Goal(s)' },
  { kind: 'cmo', label: 'CMO', tip: 'CHED Memorandum Order(s)' },
]

// group index for color scale (schemeCategory10)
const kindToGroup: Record<NodeKind, number> = {
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

  const leftCounts = useMemo(() => {
    if (!selectedCourse) return null
    const pre = (selectedCourse.prerequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    const core = (selectedCourse.corequisite || '').split(',').map((s) => s.trim()).filter(Boolean).length
    let clos = -1
    if (datasets) {
      const key = normalizeCode(selectedCourse.code)
      clos = datasets.clos.filter((clo) => cloMatchesSubject(clo.course || '', key)).length
    }
    return { pre, core, clos }
  }, [selectedCourse, datasets])

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

      const subjectClos = datasetsRef.clos.filter((clo) =>
        cloMatchesSubject(clo.course || '', subjectKey)
      )

      const poMap = new Map<string, GraphNodeData>()

      const addLeaves = (poNode: GraphNodeData, poRec: ProgramOutcomeStandalone) => {
        const pushChild = (child: GraphNodeData) => {
          if (!poNode.children.some((c) => c.id === child.id)) poNode.children.push(child)
        }

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
            pushChild({ id: `cmo-text-${normalizeCode(text).slice(0, 48) || 'x'}`, code: 'CMO', title: text, kind: 'cmo', placeholder: false, children: [] })
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

  const graphStats = useMemo(() => {
    if (!selectedCourse || !datasets) return null
    try {
      return countKinds(buildGraphModel(datasets, selectedCourse))
    } catch {
      return null
    }
  }, [selectedCourse, datasets, buildGraphModel])

  const collapseAll = useCallback(() => {
    if (!datasets || !selectedCourse) return
    const data = buildGraphModel(datasets, selectedCourse)
    const ids = new Set<string>()
    const collect = (n: GraphNodeData) => {
      if (n.children?.length) { ids.add(n.id); n.children.forEach(collect) }
    }
    collect(data)
    ids.delete(data.id)
    setCollapsedIds(ids)
  }, [datasets, selectedCourse, buildGraphModel])

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

  const handleCrumb = useCallback((i: number) => {
    if (!selectedCourseId || navStack.length === 0) return
    const trail = [...navStack, selectedCourseId]
    if (i >= trail.length - 1) return
    setSelectedCourseId(trail[i])
    setNavStack(navStack.slice(0, i))
    setShowGraph(true)
    setGraphError('')
  }, [selectedCourseId, navStack])

  // ── D3 force graph (Observable example) ─────────────────────────────────
  // width 928, height 680, color = scaleOrdinal(schemeCategory10), forceSimulation
  // with link/charge/x/y, centered viewBox, lines + circles, drag + tick.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !selectedCourse || !datasets) return () => {}

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    // Dimensions from example — keep responsive
    const width = 928
    const height = 680

    // Color scale exactly as in example
    const color = d3.scaleOrdinal(d3.schemeCategory10)

    // Build hierarchy respecting collapsedIds, then flatten to nodes/links with pathKey for uniqueness
    const pathKey = (d: d3.HierarchyNode<GraphNodeData>): string => {
      const parts: string[] = []
      let cur: d3.HierarchyNode<GraphNodeData> | null = d
      while (cur) { parts.unshift(cur.data.id); cur = cur.parent }
      return parts.join('>')
    }

    const data = buildGraphModel(datasets, selectedCourse)

    const root = d3.hierarchy<GraphNodeData>(data, (d) =>
      collapsedIds.has(d.id) ? undefined : d.children
    )

    // Flatten hierarchy to unique nodes via pathKey, and collect links
    type ForceNode = {
      id: string
      rId: string
      code: string
      title: string
      kind: NodeKind
      group: number
      placeholder: boolean
      courseId?: string
      expandable: boolean
      collapsed: boolean
      x?: number
      y?: number
      fx?: number | null
      fy?: number | null
    }
    type ForceLink = { source: string; target: string; value: number; dashed: boolean; placeholder: boolean }

    const forceNodes: ForceNode[] = []
    const forceLinks: ForceLink[] = []
    const seen = new Map<string, ForceNode>()

    root.each((d) => {
      const rId = pathKey(d)
      const n: ForceNode = {
        id: rId,
        rId,
        code: d.data.code,
        title: d.data.title,
        kind: d.data.kind,
        group: kindToGroup[d.data.kind],
        placeholder: d.data.placeholder,
        courseId: d.data.courseId,
        expandable: !!(d.data.children && d.data.children.length > 0),
        collapsed: collapsedIds.has(d.data.id),
      }
      seen.set(rId, n)
      forceNodes.push(n)
    })
    root.links().forEach((l) => {
      const s = pathKey(l.source)
      const t = pathKey(l.target)
      forceLinks.push({
        source: s,
        target: t,
        value: 1,
        dashed: l.target.data.kind === 'corequisite' || l.target.data.placeholder,
        placeholder: l.target.data.placeholder,
      })
    })

    // Copy for simulation (as in example)
    const links = forceLinks.map(d => ({ ...d })) as unknown as d3.SimulationLinkDatum<ForceNode> & { dashed: boolean; placeholder: boolean }[]
    const nodes = forceNodes.map(d => ({ ...d })) as ForceNode[]

    // Radius helper — subject larger
    const radiusOf = (d: ForceNode) => {
      if (d.kind === 'subject') return 12
      if (d.kind === 'curriculum') return 10
      if (d.kind === 'clo' || d.kind === 'po') return 7
      return 5
    }

    // Simulation exactly as in example, with named forces
    const simulation = d3.forceSimulation<ForceNode>(nodes)
      .force("link", d3.forceLink<ForceNode, typeof links[0]>(links).id((d: any) => d.id).distance(90).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("x", d3.forceX().strength(0.05))
      .force("y", d3.forceY().strength(0.05))

    // SVG container — viewBox centered, responsive
    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [-width / 2, -height / 2, width, height] as any)
      .attr("style", "max-width: 100%; height: auto; display: block; background: transparent;")

    // Defs: subtle shadow
    const defs = svg.append('defs')
    defs.append('filter')
      .attr('id', 'subject-view-shadow')
      .attr('x', '-60%').attr('y', '-60%')
      .attr('width', '220%').attr('height', '220%')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 2.5)
      .attr('flood-color', 'rgba(15, 23, 42, 0.18)')

    const zoomGroup = svg.append('g')

    // Links
    const link = zoomGroup.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt((d as any).value || 1) * 1.5)
      .attr("stroke", d => (d as any).placeholder ? '#a5b4c8' : '#999')
      .attr("stroke-dasharray", d => (d as any).dashed ? '6 4' : 'none')

    // Nodes
    const node = zoomGroup.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => radiusOf(d as ForceNode))
      .attr("fill", d => d.placeholder ? '#f8fafc' : color(String((d as ForceNode).group)) as string)
      .attr("stroke", d => d.placeholder ? '#94a3b8' : '#fff')
      .attr("stroke-dasharray", d => d.placeholder ? '4 2' : 'none')
      .style('filter', 'url(#subject-view-shadow)')
      .attr('cursor', d => (d.expandable || d.courseId ? 'pointer' : 'default'))

    // Subject double-ring extra
    const subjectExtra = zoomGroup.append('g')
      .selectAll('circle')
      .data(nodes.filter(n => n.kind === 'subject'))
      .join('circle')
      .attr('r', 18)
      .attr('fill', 'none')
      .attr('stroke', d => color(String(d.group)) as string)
      .attr('stroke-width', 1.2)
      .attr('stroke-opacity', 0.5)
      .attr('pointer-events', 'none')

    // Labels — code inside or next to node
    const label = zoomGroup.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.32em')
      .attr('font-size', d => d.kind === 'subject' ? '8px' : d.kind === 'curriculum' ? '7px' : '6.5px')
      .attr('font-weight', '700')
      .attr('fill', d => d.placeholder ? '#64748b' : d.kind === 'subject' ? '#fff' : '#fff')
      .attr('pointer-events', 'none')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'rgba(0,0,0,0.18)')
      .attr('stroke-width', 2)
      .text(d => {
        const max = d.kind === 'subject' ? 10 : d.kind === 'curriculum' ? 12 : 8
        const c = d.code.length > max ? d.code.slice(0, max - 1) + '…' : d.code
        return c
      })

    // Expand/collapse badge
    const badge = zoomGroup.append('g')
      .selectAll('g')
      .data(nodes.filter(n => n.expandable && n.kind !== 'subject'))
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
      .text(d => d.collapsed ? '+' : '−')

    node.append("title")
      .text(d => `${d.code} — ${d.title}${d.placeholder ? ' (unresolved)' : ''}`)

    // Drag as in example
    const dragstarted = (event: any) => {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }
    const dragged = (event: any) => {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }
    const dragended = (event: any) => {
      if (!event.active) simulation.alphaTarget(0)
      event.subject.fx = null
      event.subject.fy = null
    }

    node.call(d3.drag<SVGCircleElement, ForceNode>()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended) as any)

    // Also drag subject extra in sync
    subjectExtra.call(d3.drag<SVGCircleElement, ForceNode>()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended) as any)

    // Tick — update positions
    simulation.on("tick", () => {
      link
        .attr("x1", d => (d as any).source.x)
        .attr("y1", d => (d as any).source.y)
        .attr("x2", d => (d as any).target.x)
        .attr("y2", d => (d as any).target.y)

      node
        .attr("cx", d => (d as any).x)
        .attr("cy", d => (d as any).y)

      subjectExtra
        .attr("cx", d => (d as any).x)
        .attr("cy", d => (d as any).y)

      label
        .attr("x", d => (d as any).x)
        .attr("y", d => (d as any).y)

      badge
        .attr("transform", d => {
          const r = radiusOf(d as ForceNode)
          return `translate(${(d as any).x + r},${(d as any).y - r})`
        })
    })

    // Hover — tooltip and highlight
    const highlightConnections = (d: ForceNode) => {
      const connected = new Set<string>()
      links.forEach((l: any) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source
        const tId = typeof l.target === 'object' ? l.target.id : l.target
        if (sId === d.id) connected.add(tId)
        if (tId === d.id) connected.add(sId)
      })
      node.classed('subject-view__node--highlight', n => connected.has((n as any).id))
      link.classed('subject-view__link--highlight', l => {
        const sId = typeof (l as any).source === 'object' ? (l as any).source.id : (l as any).source
        const tId = typeof (l as any).target === 'object' ? (l as any).target.id : (l as any).target
        return sId === d.id || tId === d.id
      })
    }

    node
      .on('mouseenter', (event, d) => {
        highlightConnections(d as ForceNode)
        tip.style.opacity = '1'
        const rect = svgEl.getBoundingClientRect()
        tip.style.left = `${event.clientX - rect.left + 12}px`
        tip.style.top = `${event.clientY - rect.top - 28}px`
        tip.innerHTML = `<strong>${(d as ForceNode).code}</strong><br/>${(d as ForceNode).title}`
      })
      .on('mousemove', (event) => {
        const rect = svgEl.getBoundingClientRect()
        tip.style.left = `${event.clientX - rect.left + 12}px`
        tip.style.top = `${event.clientY - rect.top - 28}px`
      })
      .on('mouseleave', () => {
        node.classed('subject-view__node--highlight', false)
        link.classed('subject-view__link--highlight', false)
        tip.style.opacity = '0'
      })

    node.on('click', (event, d) => {
      event.stopPropagation()
      const n = d as ForceNode
      if (n.courseId && !n.expandable) {
        const target = programCourses.find((c) => c.id === n.courseId)
        if (target && selectedCourseId && target.id !== selectedCourseId) {
          setNavStack((prev) => [...prev, selectedCourseId])
          setSelectedCourseId(target.id)
          setShowGraph(true)
        }
        return
      }
      if (n.expandable) {
        const baseId = n.id.split('>').pop()!
        setCollapsedIds((prev) => {
          const next = new Set(prev)
          if (next.has(baseId)) next.delete(baseId)
          else next.add(baseId)
          return next
        })
      }
    })

    // Zoom / pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => zoomGroup.attr('transform', event.transform))
    svg.call(zoom as any)
    zoomRef.current = zoom as any

    // Cleanup simulation on re-render / unmount (as in example invalidation)
    return () => {
      simulation.stop()
      svg.on('.zoom', null)
      zoomRef.current = null
    }
  }, [selectedCourse, datasets, collapsedIds, buildGraphModel, programCourses, selectedCourseId])

  // Keep containerSize in sync for toolbar responsiveness (not strictly needed for fixed viewBox, but kept)
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

  useEffect(() => {
    if (!showGraph || !selectedCourse || !datasets) return
    try {
      return renderGraph()
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : 'Failed to render graph.')
      return undefined
    }
  }, [showGraph, selectedCourse, datasets, containerSize, renderGraph])

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
              <p className="subject-view__graph-hint">Force layout — drag nodes, scroll to zoom. Click a branch to collapse/expand; click a pre-req/co-req to jump.</p>
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

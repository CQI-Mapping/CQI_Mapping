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

  // ── D3 vertical tree render (matches e9b5b3f5 sketch) ──────────────────
  // Top-down: curriculum → IT10 (subject) → CLO1/CLO2 → PO1/PO2 → CMO/PEO/SG
  // Straight <line> like branch-visualizer, expandable branches.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current
    const tip = tooltipRef.current
    if (!svgEl || !tip || !selectedCourse || !datasets) return () => {}

    const svg = d3.select(svgEl)
    svg.on('.zoom', null)
    svg.selectAll('*').remove()

    const width = containerSize.w || svgEl.clientWidth || 700
    const height = containerSize.h || svgEl.clientHeight || 560

    const rawData = buildGraphModel(datasets, selectedCourse)

    // Hide collapsed subtrees (branch-visualizer expandable)
    const prune = (n: GraphNodeData): GraphNodeData => {
      if (collapsedIds.has(n.id)) return { ...n, children: [] }
      return { ...n, children: (n.children ?? []).map(prune) }
    }
    const data = prune(rawData)

    const root = d3.hierarchy<GraphNodeData>(data)
    const treeLayout = d3.tree<GraphNodeData>().nodeSize([150, 110]).separation((a,b)=> a.parent===b.parent?1:1.3)
    treeLayout(root)

    let minX = Infinity, maxX = -Infinity
    root.each((d: any) => { if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x })
    const treeWidth = maxX - minX
    const offsetX = width/2 - (minX + treeWidth/2)
    const offsetY = 60
    root.each((d: any) => { d.x += offsetX; d.y += offsetY })

    type TreeNode = d3.HierarchyPointNode<GraphNodeData> & { expandable: boolean; collapsed: boolean }
    type TreeLink = d3.HierarchyPointLink<GraphNodeData>

    const nodes: TreeNode[] = root.descendants().map((d: any) => Object.assign(d, {
      expandable: !!(d.data.children && d.data.children.length>0) || collapsedIds.has(d.data.id),
      collapsed: collapsedIds.has(d.data.id),
    }))
    const links: TreeLink[] = root.links() as TreeLink[]

    const radiusOf = (d: TreeNode) => {
      const k = d.data.kind
      if (k==='curriculum') return 28
      if (k==='subject') return 30
      if (k==='clo') return 22
      if (k==='po') return 18
      return 16
    }

    const zoomGroup = svg.append('g')

    // Links — straight <line> like branch-visualizer
    const link = zoomGroup.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class','link')
      .attr('stroke', (l: any) => {
        const kind = (l.target as any).data.kind
        const ph = (l.target as any).data.placeholder
        if (ph) return '#94a3b8'
        if (kind==='curriculum') return '#9333ea'
        if (kind==='clo') return '#06b6d4'
        if (kind==='po') return '#7c3aed'
        return '#64748b'
      })
      .attr('stroke-width',2)
      .attr('stroke-dasharray', (l: any) => (l.target as any).data.placeholder ? '6 4' : 'none')
      .attr('x1', (d: any)=> d.source.x)
      .attr('y1', (d: any)=> d.source.y)
      .attr('x2', (d: any)=> d.target.x)
      .attr('y2', (d: any)=> d.target.y)

    // Nodes
    const node = zoomGroup.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('transform', (d: any)=> `translate(${d.x},${d.y})`)
      .attr('cursor', (d: any)=> d.data.kind==='curriculum'?'default':'pointer')

    // Double ring for subject (IT10)
    node.filter((d: any)=> d.data.kind==='subject').append('circle').attr('r',37).attr('fill','rgba(37,99,235,0.22)').attr('stroke','#2563eb').attr('stroke-width',2)
    node.filter((d: any)=> d.data.kind==='subject').append('circle').attr('r',30).attr('fill', colorMap.subject).attr('stroke','#fff').attr('stroke-width',2)

    node.filter((d: any)=> d.data.kind!=='subject').append('circle')
      .attr('r', (d: any)=> radiusOf(d))
      .attr('fill', (d: any)=> d.data.placeholder ? '#f8fafc' : colorMap[d.data.kind as NodeKind])
      .attr('stroke', (d: any)=> d.data.placeholder ? '#94a3b8' : colorMap[d.data.kind as NodeKind])
      .attr('stroke-dasharray', (d: any)=> d.data.placeholder ? '5 3' : 'none')
      .attr('stroke-width', (d: any)=> d.collapsed?3:2)

    node.append('text')
      .attr('text-anchor','middle').attr('dy',4)
      .attr('fill', (d: any)=> d.data.placeholder ? '#64748b':'#fff')
      .attr('font-size', (d: any)=> d.data.code.length>10?9:11)
      .attr('font-weight','bold').attr('pointer-events','none')
      .text((d: any)=> (d.data.code.length>14? d.data.code.slice(0,12)+'…': d.data.code) + (d.data.placeholder && d.data.kind!=='curriculum'?'?':''))

    const badge = node.filter((d: any)=> d.expandable && d.data.kind!=='curriculum')
    badge.append('circle').attr('r',7).attr('cx', (d: any)=> radiusOf(d)-2).attr('cy', (d: any)=> -radiusOf(d)+2).attr('fill','#fff').attr('stroke', (d: any)=> colorMap[d.data.kind as NodeKind]).attr('stroke-width',1.5).attr('pointer-events','none')
    badge.append('text').attr('x', (d: any)=> radiusOf(d)-2).attr('y', (d: any)=> -radiusOf(d)+6.5).attr('text-anchor','middle').attr('font-size','10px').attr('font-weight','700').attr('fill',(d: any)=> colorMap[d.data.kind as NodeKind]).attr('pointer-events','none').text((d: any)=> d.collapsed?'+':'−')

    const highlightConnections = (d: TreeNode) => {
      const connectedIds = new Set<string>()
      const connectedLinks: TreeLink[] = []
      links.forEach(l=>{
        const s = (l.source as any).data.id, t=(l.target as any).data.id
        if (s===d.data.id){ connectedIds.add(t); connectedLinks.push(l) }
        else if (t===d.data.id){ connectedIds.add(s); connectedLinks.push(l) }
      })
      node.classed('subject-view__node--highlight', (n: any)=> connectedIds.has(n.data.id))
      link.classed('subject-view__link--highlight', (l: any)=> connectedLinks.includes(l))
    }

    node.on('mouseenter', (event: any, d: any)=>{
      highlightConnections(d)
      tip.style.opacity='1'
      tip.style.left=`${event.offsetX+12}px`
      tip.style.top=`${event.offsetY-28}px`
      tip.innerHTML=`<strong>${d.data.code}</strong><br/>${d.data.title}`
    }).on('mousemove', (event: any)=>{
      tip.style.left=`${event.offsetX+12}px`
      tip.style.top=`${event.offsetY-28}px`
    }).on('mouseleave', ()=>{
      node.classed('subject-view__node--highlight', false)
      link.classed('subject-view__link--highlight', false)
      tip.style.opacity='0'
    }).on('click', (event: any, d: any)=>{
      event.stopPropagation()
      if (d.data.courseId && !d.expandable){ setSelectedCourseId(d.data.courseId); setShowGraph(false); return }
      if (d.expandable){
        setCollapsedIds(prev=>{
          const next=new Set(prev)
          if (next.has(d.data.id)) next.delete(d.data.id); else next.add(d.data.id)
          return next
        })
      } else if (d.data.courseId){ setSelectedCourseId(d.data.courseId); setShowGraph(false) }
    })

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2,3]).on('zoom', (event)=> zoomGroup.attr('transform', event.transform))
    svg.call(zoom)

    return ()=> { svg.on('.zoom', null) }
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

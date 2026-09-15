// Admin Subject View: two-panel layout — left panel has program dropdown +
// course buttons; right panel renders a D3.js prerequisite/corequisite graph
// for the selected course.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import { fetchPrograms, fetchCourses } from '../../services/database'
import type { Program, Course } from '../../services/database'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  code: string
  title: string
  kind: 'selected' | 'prerequisite' | 'corequisite' | 'missing'
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
  label: string
  directed: boolean
}

export default function SubjectView() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, c] = await Promise.all([fetchPrograms(), fetchCourses()])
        if (!cancelled) {
          setPrograms(p)
          setCourses(c.filter((co) => !co.status || co.status === 'active'))
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

  const findCourseByCode = useCallback(
    (code: string) => programCourses.find((c) => c.code.toUpperCase() === code.toUpperCase()),
    [programCourses],
  )

  // ── D3 graph ──────────────────────────────────────────────────────────────
  const renderGraph = useCallback(() => {
    if (!selectedCourse || !svgRef.current) return

    // Stop any previous simulation
    if (simRef.current) { simRef.current.stop(); simRef.current = null }

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 600
    const height = svgRef.current.clientHeight || 400

    // ── Build nodes + links ─────────────────────────────────────────────
    const nodes: GraphNode[] = []
    const links: GraphLink[] = []

    nodes.push({
      id: selectedCourse.id,
      code: selectedCourse.code,
      title: selectedCourse.title,
      kind: 'selected',
    })

    const addRelated = (raw: string, kind: GraphNode['kind'], label: string, directed: boolean) => {
      if (!raw) return
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
      for (const code of parts) {
        const target = findCourseByCode(code)
        const node: GraphNode = {
          id: target ? target.id : `missing-${code}`,
          code,
          title: target ? target.title : 'Not found',
          kind,
        }
        if (!nodes.some((n) => n.id === node.id)) nodes.push(node)
        links.push({ source: selectedCourse.id, target: node.id, label, directed })
      }
    }

    addRelated(selectedCourse.prerequisite, 'prerequisite', 'pre-req', true)
    addRelated(selectedCourse.corequisite, 'corequisite', 'co-req', false)

    if (nodes.length <= 1) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '14px')
        .text('No prerequisite or corequisite relationships')
      return
    }

    const colorMap: Record<GraphNode['kind'], string> = {
      selected: '#2563eb',
      prerequisite: '#f97316',
      corequisite: '#22c55e',
      missing: '#ef4444',
    }

    // ── Simulation ──────────────────────────────────────────────────────
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(180))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(60))
    simRef.current = simulation

    // ── Arrow marker (for directed links only) ──────────────────────────
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 30)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#64748b')

    // ── Links ───────────────────────────────────────────────────────────
    const linkGroup = svg.append('g')
    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d) => d.directed ? '0' : '6 4')
      .attr('marker-end', (d) => d.directed ? 'url(#arrow)' : 'none')

    const linkLabel = linkGroup.selectAll('text')
      .data(links)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .attr('dy', -6)
      .text((d) => d.label)

    // ── Nodes ───────────────────────────────────────────────────────────
    const nodeGroup = svg.append('g')
    const node = nodeGroup.selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'grab')

    // Drag
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(drag as unknown as (selection: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>) => void)

    // Hover tooltip
    node
      .on('mouseenter', (event, d) => {
        if (!tooltipRef.current) return
        tooltipRef.current.style.opacity = '1'
        tooltipRef.current.style.left = `${event.offsetX + 12}px`
        tooltipRef.current.style.top = `${event.offsetY - 28}px`
        tooltipRef.current.innerHTML = `<strong>${d.code}</strong><br/>${d.title}`
      })
      .on('mousemove', (event) => {
        if (!tooltipRef.current) return
        tooltipRef.current.style.left = `${event.offsetX + 12}px`
        tooltipRef.current.style.top = `${event.offsetY - 28}px`
      })
      .on('mouseleave', () => {
        if (tooltipRef.current) tooltipRef.current.style.opacity = '0'
      })

    // Click on a node to select that course in the left list
    node.on('click', (event, d) => {
      if (d.kind === 'selected') return
      if (d.kind === 'missing') return
      const match = programCourses.find((c) => c.id === d.id)
      if (match) setSelectedCourseId(match.id)
    })

    // Circle
    node.append('circle')
      .attr('r', (d) => d.kind === 'selected' ? 28 : 22)
      .attr('fill', (d) => colorMap[d.kind])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Code label
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -8)
      .attr('fill', '#fff')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => d.code)

    // Title label
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 8)
      .attr('fill', '#fff')
      .attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text((d) => d.title.length > 18 ? d.title.slice(0, 16) + '…' : d.title)

    // ── Tick ────────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!)

      linkLabel
        .attr('x', (d) => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr('y', (d) => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })
  }, [selectedCourse, findCourseByCode, programCourses, setSelectedCourseId])

  // Render graph when selectedCourse changes (not on every React render)
  useEffect(() => { renderGraph() }, [renderGraph])

  if (loading) return <p>Loading subjects...</p>

  return (
    <div className="subject-view">
      {error && <p className="msg msg--error">{error}</p>}

      <div className="subject-view__panels">
        {/* ── Left panel: program + course list ─────────────────────────── */}
        <div className="panel subject-view__left">
          <h3>Programs</h3>
          <label className="field">
            <span className="sr-only">Select program</span>
            <select className="input input--sm" value={selectedProgramId}
              onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedCourseId(null) }}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.code}</option>
              ))}
            </select>
          </label>

          <h3 className="subject-view__course-heading">Courses</h3>
          <label className="field">
            <span className="sr-only">Select course</span>
            <select className="input input--sm" value={selectedCourseId ?? ''}
              onChange={(e) => setSelectedCourseId(e.target.value || null)}>
              <option value="">— Select a course —</option>
              {programCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
              ))}
            </select>
          </label>
          <button className="btn btn--sm subject-view__view-btn" disabled={!selectedCourse || loading}
            onClick={renderGraph}>
            View
          </button>
        </div>

        {/* ── Right panel: D3 graph ─────────────────────────────────────── */}
        <div className="panel subject-view__right" style={{ position: 'relative' }}>
          {selectedCourse ? (
            <>
              <h3 className="subject-view__graph-title">
                {selectedCourse.code} — {selectedCourse.title}
              </h3>
              <div className="subject-view__legend">
                <span><span className="subject-view__dot subject-view__dot--selected" /> Selected</span>
                <span><span className="subject-view__dot subject-view__dot--prereq" /> Prerequisite</span>
                <span><span className="subject-view__dot subject-view__dot--coreq" /> Corequisite</span>
                <span><span className="subject-view__dot subject-view__dot--missing" /> Missing</span>
              </div>
              <div ref={tooltipRef} className="subject-view__tooltip" />
              <svg ref={svgRef} className="subject-view__svg" />
            </>
          ) : (
            <div className="subject-view__placeholder">
              <p>Select a course on the left to view its relationships.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

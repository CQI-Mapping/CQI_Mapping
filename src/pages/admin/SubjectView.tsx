// Admin Subject View: two-panel layout — left panel has program dropdown +
// course buttons; right panel renders a D3.js prerequisite/corequisite graph
// for the selected course.

import { useState, useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { fetchPrograms, fetchResources, fetchCourses } from '../../services/database'
import type { Program, Resource, Course } from '../../services/database'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  code: string
  title: string
  kind: 'selected' | 'prerequisite' | 'corequisite' | 'missing'
  x?: number
  y?: number
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
  label: string
}

export default function SubjectView({ preselectCourseId }: { preselectCourseId?: string | null }) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, , c] = await Promise.all([fetchPrograms(), fetchResources(), fetchCourses()])
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

  // When preselectCourseId arrives (or changes), select the course and its program
  useEffect(() => {
    if (!preselectCourseId || loading) return
    const course = courses.find((c) => c.id === preselectCourseId)
    if (!course) return
    const pid = typeof course.program_id === 'object' ? course.program_id.id : course.program_id
    setSelectedProgramId(pid)
    setSelectedCourseId(preselectCourseId)
  }, [preselectCourseId, loading, courses])

  const programCourses = courses.filter((c) => {
    const pid = typeof c.program_id === 'object' ? c.program_id.id : c.program_id
    return pid === selectedProgramId
  })

  const selectedCourse = programCourses.find((c) => c.id === selectedCourseId) ?? null

  const findCourseByCode = useCallback(
    (code: string) => programCourses.find((c) => c.code.toUpperCase() === code.toUpperCase()),
    [programCourses],
  )

  // ── D3 graph ──────────────────────────────────────────────────────────────
  const renderGraph = useCallback(() => {
    if (!selectedCourse || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 600
    const height = svgRef.current.clientHeight || 400

    // Build nodes + links
    const nodes: GraphNode[] = []
    const links: GraphLink[] = []

    nodes.push({
      id: selectedCourse.id,
      code: selectedCourse.code,
      title: selectedCourse.title,
      kind: 'selected',
    })

    const addRelated = (code: string, kind: GraphNode['kind'], label: string) => {
      if (!code) return
      const target = findCourseByCode(code)
      const node: GraphNode = {
        id: target ? target.id : `missing-${code}`,
        code,
        title: target ? target.title : 'Not found',
        kind,
      }
      if (!nodes.some((n) => n.id === node.id)) nodes.push(node)
      links.push({ source: selectedCourse.id, target: node.id, label })
    }

    addRelated(selectedCourse.prerequisite, 'prerequisite', 'pre-req')
    addRelated(selectedCourse.corequisite, 'corequisite', 'co-req')

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

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(160))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(60))

    // Links
    const linkGroup = svg.append('g')
    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrow)')

    // Link labels
    const linkLabel = linkGroup.selectAll('text')
      .data(links)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .attr('dy', -6)
      .text((d) => d.label)

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#64748b')

    // Nodes
    const nodeGroup = svg.append('g')
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'grab')

    const dragBehavior = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.each(function (d) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(d3 as any).select(this).call(dragBehavior)
    })

    node.append('circle')
      .attr('r', (d) => d.kind === 'selected' ? 28 : 22)
      .attr('fill', (d) => colorMap[d.kind])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('cursor', 'grab')

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -8)
      .attr('fill', '#fff')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => d.code)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 8)
      .attr('fill', '#fff')
      .attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text((d) => d.title.length > 18 ? d.title.slice(0, 16) + '…' : d.title)

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
  }, [selectedCourse, findCourseByCode])

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
          <ul className="subject-view__course-list">
            {programCourses.length === 0 && <li className="subject-view__empty">No courses in this program</li>}
            {programCourses.map((c) => (
              <li key={c.id}>
                <button
                  className={`btn btn--sm subject-view__course-btn ${selectedCourseId === c.id ? 'subject-view__course-btn--active' : ''}`}
                  onClick={() => setSelectedCourseId(c.id)}
                >
                  {c.code} — {c.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Right panel: D3 graph ─────────────────────────────────────── */}
        <div className="panel subject-view__right">
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

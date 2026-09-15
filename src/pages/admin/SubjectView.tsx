// Admin Subject View — interactive course graph builder modeled on
// cliffamadeus/branch-visualizer. Left panel has inputs to add nodes and
// links; right panel is a D3 force-directed graph with hover highlights.

import { useState, useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { fetchPrograms, fetchCourses } from '../../services/database'
import type { Program, Course } from '../../services/database'

interface GraphNodeDatum extends d3.SimulationNodeDatum {
  id: string
  code: string
  title: string
}

interface GraphLinkDatum extends d3.SimulationLinkDatum<GraphNodeDatum> {
  source: GraphNodeDatum | string
  target: GraphNodeDatum | string
}

const nodeId = (d: GraphNodeDatum | string): string => (typeof d === 'string' ? d : d.id)

export default function SubjectView() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [linkToId, setLinkToId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState<GraphNodeDatum[]>([])
  const [links, setLinks] = useState<GraphLinkDatum[]>([])
  const svgRef = useRef<SVGSVGElement>(null)

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

  const selectedCourse = programCourses.find((c) => c.id === selectedCourseId) ?? null
  const graphCourses = programCourses.filter((c) => nodes.some((n) => n.id === c.id))
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])

  // ── Actions ────────────────────────────────────────────────────────────────
  const startGraph = () => {
    if (!selectedCourse) return
    setNodes([{ id: selectedCourse.id, code: selectedCourse.code, title: selectedCourse.title }])
    setLinks([])
    setLinkToId('')
  }

  const addNode = () => {
    if (!selectedCourse || nodeIds.has(selectedCourse.id)) return
    const newNode: GraphNodeDatum = {
      id: selectedCourse.id,
      code: selectedCourse.code,
      title: selectedCourse.title,
    }
    const newLink: GraphLinkDatum | null =
      linkToId && nodeIds.has(linkToId) ? { source: linkToId, target: selectedCourse.id } : null
    setNodes((prev) => [...prev, newNode])
    if (newLink) setLinks((prev) => [...prev, newLink])
  }

  const undoLast = () => {
    const lastNode = nodes[nodes.length - 1]
    if (!lastNode) return
    setNodes((prev) => prev.filter((n) => n.id !== lastNode.id))
    setLinks((prev) => prev.filter((l) => nodeId(l.source) !== lastNode.id && nodeId(l.target) !== lastNode.id))
    setLinkToId('')
  }

  const deleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setLinks((prev) => prev.filter((l) => nodeId(l.source) !== id && nodeId(l.target) !== id))
    setLinkToId('')
  }

  const handleProgramChange = (pid: string) => {
    setSelectedProgramId(pid)
    setSelectedCourseId('')
    setLinkToId('')
    setNodes([])
    setLinks([])
  }

  // ── D3 rendering ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (nodes.length === 0) return

    const width = svgRef.current.clientWidth || 600
    const height = svgRef.current.clientHeight || 400

    const simulation = d3.forceSimulation<GraphNodeDatum>(nodes)
      .force('link', d3.forceLink<GraphNodeDatum, GraphLinkDatum>(links).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(40))

    const link = svg.append('g').selectAll<SVGLineElement, GraphLinkDatum>('line')
      .data(links)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', '#999')

    const dragBehavior = d3.drag<SVGGElement, GraphNodeDatum>()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })

    const node = svg.append('g').selectAll<SVGGElement, GraphNodeDatum>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .attr('cursor', 'grab')
      .on('mouseover', (_, d) => highlightConnected(d))
      .on('mouseout', resetHighlight)
      .call(dragBehavior as unknown as (selection: d3.Selection<SVGGElement, GraphNodeDatum, SVGGElement, unknown>) => void)

    node.append('circle').attr('r', 14).attr('fill', '#007bff')

    node.append('text')
      .attr('dx', 18).attr('dy', 4)
      .attr('fill', '#0f172a')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text((d) => d.code)

    link
      .on('mouseover', function (event, d) {
        d3.select(this).classed('highlight', true)
        const ids = new Set<string>([nodeId(d.source), nodeId(d.target)])
        d3.selectAll<SVGCircleElement, GraphNodeDatum>('.node').classed('highlight-node', (n) => ids.has(n.id))
      })
      .on('mouseout', resetHighlight)

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNodeDatum).x!)
        .attr('y1', (d) => (d.source as GraphNodeDatum).y!)
        .attr('x2', (d) => (d.target as GraphNodeDatum).x!)
        .attr('y2', (d) => (d.target as GraphNodeDatum).y!)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => { simulation.stop() }
  }, [nodes, links])

  const highlightConnected = (d: GraphNodeDatum) => {
    const ids = new Set<string>([d.id])
    links.forEach((l) => {
      if (nodeId(l.source) === d.id) ids.add(nodeId(l.target))
      if (nodeId(l.target) === d.id) ids.add(nodeId(l.source))
    })
    d3.selectAll<SVGCircleElement, GraphNodeDatum>('.node').classed('highlight-node', (n) => ids.has(n.id))
    d3.selectAll<SVGLineElement, GraphLinkDatum>('.link').classed('highlight', (l) =>
      nodeId(l.source) === d.id || nodeId(l.target) === d.id)
  }

  const resetHighlight = () => {
    d3.selectAll('.node').classed('highlight-node', false)
    d3.selectAll('.link').classed('highlight', false)
  }

  if (loading) return <p>Loading subjects...</p>

  return (
    <div className="subject-view">
      {error && <p className="msg msg--error">{error}</p>}

      <div className="subject-view__panels">
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="panel subject-view__left">
          <label className="field">
            <span className="field__label">Program</span>
            <select className="input input--sm" value={selectedProgramId}
              onChange={(e) => handleProgramChange(e.target.value)}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.code}</option>
              ))}
            </select>
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            <span className="field__label">Subject Code</span>
            <select className="input input--sm" value={selectedCourseId}
              onChange={(e) => { setSelectedCourseId(e.target.value); setLinkToId('') }}>
              <option value="">— Select —</option>
              {programCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
              ))}
            </select>
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            <span className="field__label">Link to (optional)</span>
            <select className="input input--sm" value={linkToId}
              onChange={(e) => setLinkToId(e.target.value)}>
              <option value="">— None —</option>
              {graphCourses
                .filter((c) => c.id !== selectedCourseId)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                ))}
            </select>
          </label>

          <div className="subject-view__actions">
            <button className="btn btn--sm subject-view__btn--start" onClick={startGraph}
              disabled={!selectedCourse || loading}>
              Start
            </button>
            <button className="btn btn--sm subject-view__btn--add" onClick={addNode}
              disabled={!selectedCourse || loading || nodeIds.has(selectedCourse.id)}>
              Add Node
            </button>
            <button className="btn btn--sm btn--danger" onClick={undoLast} disabled={nodes.length === 0}>
              Undo
            </button>
          </div>

          <h4 className="subject-view__list-heading">Active Nodes ({nodes.length})</h4>
          <ul className="subject-view__node-list">
            {nodes.length === 0 && (
              <li className="subject-view__empty">Select a course and press Start</li>
            )}
            {graphCourses.map((c) => (
              <li key={c.id} className="subject-view__node-item">
                <span className="subject-view__node-item__code">{c.code}</span>
                <span className="subject-view__node-item__title">{c.title}</span>
                <button className="btn btn--sm btn--danger" onClick={() => deleteNode(c.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Right panel ────────────────────────────────────────────────── */}
        <div className="panel subject-view__right">
          <svg ref={svgRef} className="subject-view__svg" />
        </div>
      </div>
    </div>
  )
}
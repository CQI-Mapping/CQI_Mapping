// User dashboard: Curriculum Map page.
// Lets any signed-in role (admin, manager, user/faculty — per team decision)
// add courses with zero or more prerequisites, and visualizes the prerequisite
// graph as a D3.js force-directed network diagram.
//
// Requires: npm install d3 @types/d3
// Requires schema_update.sql to have been run (adds course_prerequisites
// and widens the `courses` INSERT/UPDATE policies to include role 'user').

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import { supabase } from '../../utils/supabaseClient'
import './Curriculum.css'

interface Program {
  id: string
  code: string
  name: string
}

interface Course {
  id: string
  program_id: string
  code: string
  title: string
  units: number
  created_at?: string
}

interface PrereqLink {
  course_id: string
  prerequisite_id: string
}

// D3 mutates simulation nodes in place, adding x/y/fx/fy — extend for that.
interface CourseNode extends Course, d3.SimulationNodeDatum {}

interface GraphLink {
  source: string | CourseNode
  target: string | CourseNode
}

export default function Curriculum() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState<string>('')

  const [courses, setCourses] = useState<Course[]>([])
  const [prereqLinks, setPrereqLinks] = useState<PrereqLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Add Course form state
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [units, setUnits] = useState(3)
  const [selectedPrereqs, setSelectedPrereqs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // ---- Load programs once, default to the first one ----
  useEffect(() => {
    supabase
      .from('programs')
      .select('id, code, name')
      .order('code', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
          return
        }
        setPrograms(data ?? [])
        if (data && data.length > 0) setProgramId((prev) => prev || data[0].id)
      })
  }, [])

  // ---- Load courses + prerequisite links for the selected program ----
  const fetchCourses = useCallback(async () => {
    if (!programId) return
    setLoading(true)

    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .select('id, program_id, code, title, units, created_at')
      .eq('program_id', programId)
      .order('code', { ascending: true })

    if (courseError) {
      setError(courseError.message)
      setLoading(false)
      return
    }

    const ids = (courseData ?? []).map((c) => c.id)
    let links: PrereqLink[] = []
    if (ids.length > 0) {
      const { data: linkData, error: linkError } = await supabase
        .from('course_prerequisites')
        .select('course_id, prerequisite_id')
        .in('course_id', ids)

      if (linkError) {
        setError(linkError.message)
      } else {
        links = linkData ?? []
      }
    }

    setCourses(courseData ?? [])
    setPrereqLinks(links)
    setError(null)
    setLoading(false)
  }, [programId])

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  function togglePrereq(id: string) {
    setSelectedPrereqs((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  async function handleAddCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !title.trim() || !programId) return

    setSaving(true)

    const { data: inserted, error: insertError } = await supabase
      .from('courses')
      .insert({
        program_id: programId,
        code: code.trim().toUpperCase(),
        title: title.trim(),
        units,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      setError(insertError?.message ?? 'Failed to add course.')
      setSaving(false)
      return
    }

    if (selectedPrereqs.length > 0) {
      const rows = selectedPrereqs.map((prereqId) => ({
        course_id: inserted.id,
        prerequisite_id: prereqId,
      }))
      const { error: linkError } = await supabase.from('course_prerequisites').insert(rows)
      if (linkError) setError(linkError.message)
    }

    setSaving(false)
    setCode('')
    setTitle('')
    setUnits(3)
    setSelectedPrereqs([])
    fetchCourses()
  }

  // Build / rebuild the D3 force graph whenever courses or links change
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const width = svgEl.clientWidth || 600
    const height = 360

    const courseIds = new Set(courses.map((c) => c.id))
    const nodes: CourseNode[] = courses.map((c) => ({ ...c }))
    const links: GraphLink[] = prereqLinks
      .filter((l) => courseIds.has(l.course_id) && courseIds.has(l.prerequisite_id))
      .map((l) => ({ source: l.prerequisite_id, target: l.course_id }))

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    // Everything lives inside this group so zoom/pan can transform it as one unit
    const zoomLayer = svg.append('g').attr('class', 'zoom-layer')

    const simulation = d3
      .forceSimulation<CourseNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<CourseNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(90)
          .strength(0.9)
      )
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(34))

    const link = zoomLayer
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'cq-link')

    const node = zoomLayer
      .append('g')
      .selectAll<SVGGElement, CourseNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', 'cq-node')
      .call(
        d3
          .drag<SVGGElement, CourseNode>()
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
            // Keep the node pinned exactly where it was dropped
            if (!event.active) simulation.alphaTarget(0)
            d.fx = event.x
            d.fy = event.y
            d3.select<SVGGElement, CourseNode>(
              (event.sourceEvent.target as Element).closest('.cq-node') as SVGGElement
            )
              .select('circle')
              .classed('pinned', true)
          })
      )

    node
      .append('circle')
      .attr('r', 20)
      .attr('class', 'cq-circle')
      .on('click', (_event, d) => setSelectedId(d.id))

    node
      .append('text')
      .text((d) => d.code)
      .attr('text-anchor', 'middle')
      .attr('dy', 4)

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as CourseNode).x ?? 0)
        .attr('y1', (d) => (d.source as CourseNode).y ?? 0)
        .attr('x2', (d) => (d.target as CourseNode).x ?? 0)
        .attr('y2', (d) => (d.target as CourseNode).y ?? 0)
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .filter((event) => !(event.target as Element).closest('.cq-node'))
      .on('zoom', (event) => zoomLayer.attr('transform', event.transform.toString()))
    svg.call(zoom)
    zoomBehaviorRef.current = zoom

    return () => {
      simulation.stop()
    }
  }, [courses, prereqLinks])

  // Keep the selected node's highlight in sync without rebuilding the whole graph
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current)
      .selectAll<SVGGElement, CourseNode>('.cq-node')
      .select('circle')
      .classed('selected', (d) => d.id === selectedId)
  }, [selectedId, courses])

  function handleZoomBy(factor: number) {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    d3.select(svgRef.current).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor)
  }

  function handleZoomReset() {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity)
  }

  const selectedCourse = courses.find((c) => c.id === selectedId) ?? null
  const selectedPrereqCourses = useMemo(() => {
    if (!selectedCourse) return []
    const prereqIds = prereqLinks
      .filter((l) => l.course_id === selectedCourse.id)
      .map((l) => l.prerequisite_id)
    return courses.filter((c) => prereqIds.includes(c.id))
  }, [selectedCourse, prereqLinks, courses])

  return (
    <div className="cq-page">
      <div className="cq-header">
        <h2>Curriculum Map</h2>
        <p>Add courses and visualize prerequisite chains as a network</p>
      </div>

      {error && <div className="cq-error">{error}</div>}

      <div className="cq-grid">
        <form className="cq-card" onSubmit={handleAddCourse}>
          <h3>Add Course</h3>

          {programs.length > 1 && (
            <>
              <label>Program</label>
              <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <label>Course Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. IT07" required />

          <label>Course Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Systems Integration"
            required
          />

          <label>Units</label>
          <input
            type="number"
            min={1}
            value={units}
            onChange={(e) => setUnits(Number(e.target.value) || 1)}
          />

          <label>Prerequisites (select any that apply)</label>
          <div className="cq-checklist">
            {courses.length === 0 && <p className="cq-sub">No other courses yet.</p>}
            {courses.map((c) => (
              <label key={c.id} className="cq-check-row">
                <input
                  type="checkbox"
                  checked={selectedPrereqs.includes(c.id)}
                  onChange={() => togglePrereq(c.id)}
                />
                <span>
                  {c.code} — {c.title}
                </span>
              </label>
            ))}
          </div>

          <button className="cq-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add Course to Map'}
          </button>
        </form>

        <div className="cq-card">
          <div className="cq-card-head">
            <div>
              <h3>Course Network Diagram</h3>
              <p className="cq-sub">Click a node for details · drag to reposition · scroll to zoom</p>
            </div>
            <div className="cq-zoom-controls">
              <button type="button" onClick={() => handleZoomBy(1 / 1.3)}>
                −
              </button>
              <button type="button" onClick={handleZoomReset}>
                RESET
              </button>
              <button type="button" onClick={() => handleZoomBy(1.3)}>
                +
              </button>
            </div>
          </div>
          <svg ref={svgRef} className="cq-svg" />
          {loading && <p className="cq-sub">Loading courses…</p>}
        </div>
      </div>

      <div className="cq-card">
        <h3>Course Details</h3>
        {selectedCourse ? (
          <div>
            <p className="cq-kv">Course Code</p>
            <p className="cq-code">{selectedCourse.code}</p>
            <p className="cq-title">
              {selectedCourse.title} · {selectedCourse.units} unit{selectedCourse.units !== 1 ? 's' : ''}
            </p>
            <p className="cq-kv">Prerequisites</p>
            {selectedPrereqCourses.length > 0 ? (
              <div className="cq-chip-row">
                {selectedPrereqCourses.map((c) => (
                  <span key={c.id} className="cq-chip">
                    {c.code}
                  </span>
                ))}
              </div>
            ) : (
              <p>None</p>
            )}
          </div>
        ) : (
          <p className="cq-sub">Select a node on the diagram to inspect it.</p>
        )}
      </div>
    </div>
  )
}
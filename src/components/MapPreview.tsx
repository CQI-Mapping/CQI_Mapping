// MapPreview: the OBE Curriculum Map as a dashboard block — the Year·Semester
// grid, the year-colored subject dots and the amber prerequisite wires from
// the Generate Map page, embedded under the brief (MapBrief) on all three role
// dashboards. Self-contained the way MapBrief is: it fetches its own data and
// picks a curriculum the same first-pick the map's landing boot takes — the
// viewer's program when it carries one, else BSIT, else the first that does,
// then the first anchored course's curriculum.
//
// Forked from Map.tsx's renderCurriculumMap on purpose rather than shared:
// the page's renderer is fused to its inspection card, zoom machinery and
// PO/PI filter state. The block reproduces the drawing (geometry, palette,
// connectors) and the press-to-reveal spotlight — dots keep their click —
// while everything page-specific stays behind. When the geometry moves, both
// copies read from the same data the same way, so the two views agree.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  fetchPrograms,
  fetchCourses,
  fetchResources,
} from '../services/database'
import type { Program, Course, Resource, UserRole } from '../services/database'
import { normalizeCode } from '../utils/courseCodes'

/** Stands in for program assignments the account may not carry yet — the same
 *  rule MapBrief applies: until every account is bound to its program, BSIT
 *  is the program the system currently serves. */
const FALLBACK_PROGRAM_CODE = 'BSIT'

interface MapPreviewProps {
  /** Only the program assignment is read here; the role names where
   *  "Open Generate Map" is offered (every role routes to 'subject-view'). */
  profile: { role?: UserRole; program_id?: string | null } | null
  onNavigate?: (page: string) => void
}

/** One placed subject of the chosen curriculum — the slice of the Courses
 *  record the map actually draws (the model's PO/CLO bookkeeping stays on
 *  the page: this block has no filters). */
type PreviewSubject = {
  courseId: string
  code: string
  title: string
  year: number | null
  sem: number | null
  prereqCodes: string[]
}

/** A drawn dot — position, color and the normalized prerequisite hooks the
 *  connectors read. Same shape as Map.tsx's MapNode minus the filter fields. */
interface PreviewDot {
  id: string
  code: string
  title: string
  courseId: string
  color: string
  x: number
  y: number
  r: number
  prereqCodes: string[]
}

/** A panel's title line and footer line, worded like the other dashboard
 *  blocks (MapBrief carries its own copies — a small fork each, by design). */
function PanelHead({ title }: { title: string }) {
  return (
    <div className="reports-panel__head">
      <h3>{title}</h3>
    </div>
  )
}

function PanelFoot({
  left,
  action,
  onAction,
}: {
  left: string
  action: string
  onAction?: () => void
}) {
  return (
    <div className="reports-panel__foot">
      <span>{left}</span>
      {onAction ? (
        <button type="button" className="reports-panel__more" onClick={onAction}>
          {action} →
        </button>
      ) : (
        <span className="reports-panel__more">{action} →</span>
      )}
    </div>
  )
}

function MapPreview({ profile, onNavigate }: MapPreviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [curricula, setCurricula] = useState<Resource[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)

  const headRef = useRef<SVGSVGElement>(null)
  const bodyRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchPrograms(), fetchCourses(), fetchResources()])
      .then(([p, c, r]) => {
        setPrograms(p)
        setCourses(c)
        setCurricula(r)
        setFocusId(null)
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load the curriculum map.'),
      )
      .finally(() => setLoading(false))
  }, [])

  // ── Which curriculum to draw ── the map's landing boot, shortened: a
  // program qualifies when at least one of its courses carries a curriculum
  // that exists in Resources. The viewer's program wins when it qualifies,
  // then BSIT, then the first that does; the first anchored course picks
  // which curriculum of the winner to show.
  const curriculum = useMemo(() => {
    const cidOf = (c: Course): string | null => {
      const opt = c.curriculum_id
      return opt && typeof opt === 'object' ? opt.id : opt
    }
    const pidOf = (c: Course): string | null => {
      const opt = c.program_id
      return opt && typeof opt === 'object' ? opt.id : opt
    }
    const qualified = programs.filter((p) =>
      courses.some((c) => {
        const cid = cidOf(c)
        return pidOf(c) === p.id && cid != null && curricula.some((r) => r.id === cid)
      }),
    )
    const viewerProgram = qualified.find((p) => p.id === profile?.program_id)
    const servedProgram = qualified.find(
      (p) => (p.code ?? '').toUpperCase() === FALLBACK_PROGRAM_CODE,
    )
    const program = viewerProgram ?? servedProgram ?? qualified[0] ?? null
    if (!program) return null
    const anchor = courses.find((c) => {
      const cid = cidOf(c)
      return pidOf(c) === program.id && cid != null && curricula.some((r) => r.id === cid)
    })
    const cid = anchor ? cidOf(anchor) : null
    return cid ? curricula.find((r) => r.id === cid) ?? null : null
  }, [programs, courses, curricula, profile?.program_id])

  // ── Its subjects ── matched through curriculum_id exactly like the page's
  // model builder, with the Course page's year rule: levels 1–4 only, and a
  // semester outside 1–3 leaves the subject unplaced (no catch-all column).
  const subjects = useMemo<PreviewSubject[]>(() => {
    if (!curriculum) return []
    const cidOf = (c: Course): string | null => {
      const opt = c.curriculum_id
      return opt && typeof opt === 'object' ? opt.id : opt
    }
    return courses
      .filter((c) => cidOf(c) != null && cidOf(c) === curriculum.id)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((c) => ({
        courseId: c.id,
        code: c.code,
        title: c.title,
        year: c.year_level != null && c.year_level >= 1 && c.year_level <= 4 ? c.year_level : null,
        sem: c.semester ?? null,
        // Prerequisites store as one comma-separated string; each token is
        // normalized so "it 10" meets the dot drawn for "IT10".
        prereqCodes: String(c.prerequisite || '')
          .split(',')
          .map((tok) => normalizeCode(tok))
          .filter(Boolean),
      }))
  }, [courses, curriculum])

  // ── The drawing ── forks renderCurriculumMap's geometry verbatim: column
  // rhythm, dot stack centering, pinned header band, dividers, connectors,
  // spotlight. Only the page machinery (zoom, PO dimming, inspection card,
  // floating tooltip) stays behind; the dashboard needs none of it.
  useEffect(() => {
    const headEl = headRef.current
    const bodyEl = bodyRef.current
    if (!headEl || !bodyEl) return
    const head = d3.select(headEl)
    const body = d3.select(bodyEl)
    head.selectAll('*').remove()
    body.selectAll('*').remove()
    const teardown = () => {
      head.selectAll('*').remove()
      body.selectAll('*').remove()
    }
    if (subjects.length === 0) return teardown

    const COL_W = 200
    const ROW_H = 46
    const MARGIN_X = 70
    const RULE_Y = 30
    const FIRST_ROW_Y = 58
    const HEAD_H = 44
    const ordinals = ['1st', '2nd', '3rd', '4th']
    const ordOf = (n: number) => ordinals[n - 1] ?? `${n}th`
    const semLabel = (s: number) => (s === 1 ? '1st Sem' : s === 2 ? '2nd Sem' : 'Summer')

    const maxYear = Math.max(4, ...subjects.map((s) => s.year ?? 1))
    // Sequential year palette, purple → yellow like the OBE maps faculty are
    // used to reading.
    const yearColor = (year: number | null): string => {
      if (!year) return '#94a3b8'
      const t = maxYear <= 1 ? 0.5 : (year - 1) / (maxYear - 1)
      return d3.interpolateViridis(t)
    }

    // Summer exists as a term only for 3rd year — the other years list just
    // 1st and 2nd Sem, matching the Course page's year/semester rule.
    const columns: Array<{ key: string; label: string }> = []
    for (let y = 1; y <= maxYear; y += 1) {
      for (const s of (y === 3 ? [1, 2, 3] : [1, 2])) {
        columns.push({ key: `y${y}s${s}`, label: `${ordOf(y)} Year · ${semLabel(s)}` })
      }
    }
    const placedOf = (s: PreviewSubject): string | null => {
      if (!s.year) return null
      const sem = s.sem && s.sem >= 1 && s.sem <= 3 ? s.sem : null
      return sem ? `y${s.year}s${sem}` : null
    }

    const colIndexOf = (key: string) => columns.findIndex((c) => c.key === key)
    const colX = (key: string) => MARGIN_X + colIndexOf(key) * COL_W

    // Within a column subjects stack in code order, so the timetable reads
    // predictably instead of following the records' insert order.
    const buckets = new Map<string, PreviewSubject[]>()
    for (const col of columns) {
      buckets.set(
        col.key,
        subjects.filter((s) => placedOf(s) === col.key),
      )
    }
    const rows = Math.max(1, ...Array.from(buckets.values()).map((list) => list.length))
    // The canvas ends with the last column plus breathing room — subjects
    // only, nothing sits beside the grid.
    const contentH = FIRST_ROW_Y + rows * ROW_H + 24
    const vbH = contentH - 28
    const totalW = colX(columns[columns.length - 1].key) + COL_W / 2 + 28


    // The Year · Semester header band: label above each column plus a thin
    // rule, and vertical separators joining flush with the grid's dividers.
    // Same drawing origin (-24) and same viewBox width as the body keep the
    // two halves aligned column-for-column.
    head
      .attr('viewBox', [-24, 0, totalW, HEAD_H] as unknown as string)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('style', 'display: block; width: 100%; height: auto;')
    for (const col of columns) {
      const x = colX(col.key)
      head.append('text')
        .attr('x', x).attr('y', RULE_Y - 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11.5px')
        .attr('font-weight', '600')
        .attr('fill', '#94a3b8')
        .text(col.label)
      head.append('line')
        .attr('x1', x - COL_W / 2 + 14).attr('x2', x + COL_W / 2 - 14)
        .attr('y1', RULE_Y).attr('y2', RULE_Y)
        .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke')
    }
    for (let i = 0; i < columns.length - 1; i += 1) {
      const bx = colX(columns[i].key) + COL_W / 2
      head.append('line')
        .attr('x1', bx).attr('x2', bx)
        .attr('y1', 0).attr('y2', HEAD_H)
        .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke')
    }

    body
      .attr('viewBox', [-24, 28, totalW, vbH] as unknown as string)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('style', 'display: block; width: 100%; height: auto;')

    const defs = body.append('defs')
    defs.append('filter')
      .attr('id', 'map-preview-shadow')
      .attr('x', '-60%').attr('y', '-60%')
      .attr('width', '220%').attr('height', '220%')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 2.5)
      .attr('flood-color', 'rgba(15, 23, 42, 0.28)')

    // Column dividers run top to bottom so each Year · Semester column stays
    // separated from its neighbors — dark enough to read on white.
    for (let i = 0; i < columns.length - 1; i += 1) {
      const bx = colX(columns[i].key) + COL_W / 2
      body.append('line')
        .attr('x1', bx).attr('x2', bx)
        .attr('y1', 28).attr('y2', 28 + vbH)
        .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke')
    }

    // Dots: each column centers its own stack in the drawing's usable band,
    // the −18 compensating for the label riding above every dot.
    const dots: PreviewDot[] = []
    for (const [key, list] of buckets) {
      const x0 = colX(key)
      const stackH = (list.length - 1) * ROW_H
      const y0 =
        FIRST_ROW_Y + Math.max(0, (28 + vbH - FIRST_ROW_Y - stackH) / 2 - 18) + ROW_H / 2
      list.forEach((s, i) => {
        dots.push({
          id: `course-${s.courseId}`,
          code: s.code,
          title: s.title,
          courseId: s.courseId,
          color: yearColor(s.year),
          x: x0,
          y: y0 + i * ROW_H,
          r: 7,
          prereqCodes: s.prereqCodes,
        })
      })
    }

    // Connectors: a solid amber line runs from every subject dot to the dot
    // that unlocks it. Only prerequisites that exist as dots on this map
    // connect — a code from another curriculum (or a typo) stays silent.
    const dotByCode = new Map<string, PreviewDot>()
    for (const d of dots) dotByCode.set(normalizeCode(d.code), d)
    const prereqLinks: Array<{ from: PreviewDot; to: PreviewDot }> = []
    for (const d of dots) {
      for (const key of d.prereqCodes) {
        const target = dotByCode.get(key)
        if (!target || target.id === d.id) continue
        prereqLinks.push({ from: target, to: d })
      }
    }

    // Press-to-reveal: the pressed subject plus its FORWARD prerequisite
    // chain — what it unlocks, and everything those unlock onward, through
    // the semesters to the chain's end. The backward walk (the prereqs that
    // unlock the pressed subject) stays out, matching Generate Map.
    const focusDot = focusId ? dots.find((d) => d.courseId === focusId) ?? null : null
    const chainIds = new Set<string>()
    if (focusDot) {
      chainIds.add(focusDot.id)
      const unlocks = new Map<string, string[]>()
      for (const { from, to } of prereqLinks) {
        unlocks.set(from.id, [...(unlocks.get(from.id) ?? []), to.id])
      }
      const queue = [focusDot.id]
      while (queue.length > 0) {
        const current = queue.pop()!
        for (const next of unlocks.get(current) ?? []) {
          if (!chainIds.has(next)) {
            chainIds.add(next)
            queue.push(next)
          }
        }
      }
    }
    const inChainIds = (id: string) => chainIds.has(id)

    for (const { from, to } of prereqLinks) {
      const inChain = focusDot !== null && inChainIds(from.id) && inChainIds(to.id)
      body.append('line')
        .attr('x1', from.x).attr('y1', from.y)
        .attr('x2', to.x).attr('y2', to.y)
        .attr('stroke', '#b45309')
        .attr('stroke-width', inChain ? 2 : 1.25)
        .attr('stroke-opacity', focusDot ? (inChain ? 0.95 : 0.05) : 0.75)
        .attr('vector-effect', 'non-scaling-stroke')
    }

    const nodeGroup = body.append('g').attr('stroke', '#fff').attr('stroke-width', 1.5)
    // The pressed dot wears a teal ring so "which one did I press" survives
    // the spotlight dimming.
    const ring = nodeGroup
      .selectAll<SVGCircleElement, PreviewDot>('circle.map-preview__ring')
      .data(dots, (d) => d.id)
      .join((enter) => enter.append('circle').attr('class', 'map-preview__ring'))
      .attr('stroke', (d) => (d === focusDot ? '#0d9488' : null))
      .attr('fill', 'none')
      .attr('stroke-width', 2.5)
      .attr('r', (d) => d.r + 6)
      .attr('pointer-events', 'none')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)

    const node = nodeGroup
      .selectAll<SVGCircleElement, PreviewDot>('circle:not(.map-preview__ring)')
      .data(dots, (d) => d.id)
      .join((enter) => enter.append('circle').attr('class', 'map-preview__node'))
      .attr('r', (d) => d.r)
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('fill', (d) => d.color)
      .attr('opacity', (d) => (focusDot && !inChainIds(d.id) ? 0.12 : 1))
      .attr('cursor', 'pointer')
      .attr('filter', 'url(#map-preview-shadow)')

    node.append('title').text((d) => `${d.code} — ${d.title}`)

    // Press a dot: spotlight its forward chain. Press it again — or anywhere
    // on the empty canvas — to clear. The block reveals connections only;
    // nothing navigates away.
    node.on('click', (event, d) => {
      event.stopPropagation()
      setFocusId((cur) => (cur === d.courseId ? null : d.courseId))
    })
    body.on('click.mapfocus', () => setFocusId(null))

    const label = body.append('g')
      .selectAll<SVGTextElement, PreviewDot>('text')
      .data(dots, (d) => d.id)
      .join('text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y - 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('fill', '#0f172a')
      .attr('opacity', (d) => (focusDot && !inChainIds(d.id) ? 0.12 : 1))
      .attr('pointer-events', 'none')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .text((d) => d.code)

    return teardown
  }, [subjects, focusId])

  const placedCount = useMemo(
    () =>
      subjects.filter((s) => s.year != null && s.sem != null && s.sem >= 1 && s.sem <= 3).length,
    [subjects],
  )
  const programLabel = curriculum?.code || curriculum?.title || ''

  return (
    <section className="panel reports-panel map-preview">
      <PanelHead title="OBE Curriculum Map" />
      <p className="reports-panel__sub">
        Subject dots in their Year · Semester columns. Press a dot: its prerequisite
        chain lights onward to the end while the rest fades — press again to clear.
      </p>
      {error && <p className="msg msg--error" role="alert">{error}</p>}
      {loading ? (
        <p className="msg">Loading the curriculum map…</p>
      ) : !curriculum ? (
        <p className="reports-empty">
          No curriculum to map yet — a map appears here as soon as a course carries one.
        </p>
      ) : subjects.length === 0 ? (
        <p className="reports-empty">No subjects carry this curriculum yet.</p>
      ) : (
        <div className="map-preview__scroll">
          <div className="map-preview__inner">
            <svg ref={headRef} role="img" aria-label="Year and semester columns" />
            <svg ref={bodyRef} role="img" aria-label="Curriculum map dots and prerequisite wires" />
          </div>
        </div>
      )}
      <PanelFoot
        left={
          programLabel
            ? `${placedCount} of ${subjects.length} subjects placed · ${programLabel}`
            : `${placedCount} of ${subjects.length} subjects placed`
        }
        action="Open Generate Map"
        onAction={onNavigate ? () => onNavigate('subject-view') : undefined}
      />
    </section>
  )
}

export default MapPreview

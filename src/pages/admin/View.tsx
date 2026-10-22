// Admin Curriculum Map: printable report that mirrors the VCQI course
// syllabus document (IT21 - Object Oriented Programming) page by page:
// letterhead, title block, Vision/Mission/Goals/PEO table, Program Outcomes
// list, Curriculum Mapping matrix (PO x PEO x Strategic Goal per section),
// CLO-to-PO table, then course details.
//
// All report data is loaded from the database: strategic goals, PEOs and
// program outcomes (standalone tables), course learning outcomes, and the
// courses list. Institutional letterhead and vision/mission text are static
// (they are school branding, not input data). The report reads read-only:
// editing and archiving happen on the pages that own each record.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchStrategicGoals,
  fetchProgramEducationalObjectives,
  fetchProgramOutcomesStandalone,
  fetchCourseLearningOutcomesStandalone,
  fetchCourses,
  fetchChedMemoOrders,
} from '../../services/database'
import type {
  StrategicGoal,
  ProgramEducationalObjective,
  ProgramOutcomeStandalone,
  CourseLearningOutcomeStandalone,
  Course,
  ChedMemoOrder,
} from '../../services/database'
import { normalizeCode, cloMatchesSubject } from '../../utils/courseCodes'
import { isActive, buildGroups, splitReportPos, poNumber } from '../../utils/report'
import SyllabusReport from '../../components/SyllabusReport'
import Icon from '../../components/icons'
import { downloadSyllabusPdf } from '../../utils/syllabusPdf'
import { reportFileName } from '../../utils/download'
import PageBanner from '../../components/PageBanner'

interface ViewProps {
  userEmail: string
}

function View({ userEmail }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [goals, setGoals] = useState<StrategicGoal[]>([])
  const [peos, setPeos] = useState<ProgramEducationalObjective[]>([])
  const [pos, setPos] = useState<ProgramOutcomeStandalone[]>([])
  const [clos, setClos] = useState<CourseLearningOutcomeStandalone[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [cmos, setCmos] = useState<ChedMemoOrder[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')

  const [downloading, setDownloading] = useState(false)

  // Download options. PDF rasterises the live DOM; Word rebuilds the document
  // from the same data so the file stays editable. Orientation is fixed
  // landscape: the report's tables need the width, and the chooser is gone.
  const [dlOpen, setDlOpen] = useState(false)
  const [dlFormat, setDlFormat] = useState<'pdf' | 'docx'>('pdf')
  const dlMenuRef = useRef<HTMLDivElement>(null)

  // Close the options popover on outside click or Escape.
  useEffect(() => {
    if (!dlOpen) return
    const onPointer = (e: MouseEvent) => {
      if (dlMenuRef.current && !dlMenuRef.current.contains(e.target as Node)) setDlOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDlOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [dlOpen])

  // Snapshot target for the PDF export: the document root, not the outer
  // wrapper (which holds the toolbar html2canvas would otherwise capture).
  const reportRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, p, po, clo, c, cmo] = await Promise.all([
        fetchStrategicGoals(),
        fetchProgramEducationalObjectives(),
        fetchProgramOutcomesStandalone(),
        fetchCourseLearningOutcomesStandalone(),
        fetchCourses(),
        fetchChedMemoOrders(),
      ])
      setGoals(g)
      setPeos(p)
      setPos(po.sort((a, b) => poNumber(a.code) - poNumber(b.code) || a.code.localeCompare(b.code)))
      setClos(clo)
      setCourses(c)
      setCmos(cmo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load curriculum map data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Save the report in the chosen format. Snapshotting a PDF takes a moment
  // (the whole document is rasterised), so the button shows a working state.
  const downloadPdf = async () => {
    setDlOpen(false)
    setDownloading(true)
    setError(null)
    setNotice(null)
    try {
      if (dlFormat === 'pdf') {
        if (!reportRef.current) throw new Error('The report is not ready yet.')
        await downloadSyllabusPdf(
          reportRef.current,
          reportFileName(selectedCourse?.code ?? 'report', 'pdf'),
          'landscape',
        )
      } else {
        // Lazy: docx is ~450kB and only needed on the Word path. Importing it
        // statically put it in the main chunk for every visitor.
        const { downloadSyllabusDocx } = await import('../../utils/syllabusDocx')
        await downloadSyllabusDocx(
          {
            course: selectedCourse,
            courses,
            goals: visibleGoals,
            peos: visiblePeos,
            adminGroups,
            managerGroups,
            subjectClos,
          },
          'landscape',
        )
      }
      setNotice(dlFormat === 'pdf' ? 'PDF downloaded.' : 'Word document downloaded.')
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not create the ${dlFormat === 'pdf' ? 'PDF' : 'Word document'}: ${e.message}`
          : `Could not create the file.`,
      )
    } finally {
      setDownloading(false)
    }
  }

  // Row visibility: the report always shows active records only.
  const shown = <T extends { status?: string }>(list: T[]) =>
    list.filter((i) => isActive(i))

  const visibleGoals = shown(goals)
  const visiblePeos = shown(peos)
  const visiblePos = shown(pos)

  // Subject scope: the report renders one subject's syllabus at a time.
  // CLOs link to a subject through their free-text `course` field, so matching
  // is lenient (see courseCodes.ts). Defaults to the first active subject.
  const activeCourses = courses.filter(isActive)
  const selectedCourse =
    activeCourses.find((c) => c.id === selectedCourseId) ?? activeCourses[0] ?? null
  const subjectClos = selectedCourse
    ? clos.filter((c) => isActive(c) && cloMatchesSubject(c.course || '', normalizeCode(selectedCourse.code)))
    : []

  // Pre-req / co-req resolution ("IT13" → "IT13 - Fundamentals of Programming
  // 2", one line per course), PO grouping and the Course Details markup are
  // shared with the Subject Graph's About card via utils/courseCodes,
  // utils/report and components/SyllabusReport.
  const { adminPos, managerPos } = splitReportPos(visiblePos)
  const adminGroups = buildGroups(adminPos, cmos)
  const managerGroups = buildGroups(managerPos, cmos)

  return (
    <div className="syllabus-doc">
      {/* Screen-only page banner; the document's own letterhead follows. */}
      <PageBanner title="Curriculum Report" sub="The official course syllabus for one subject, ready to print." />
      <div className="syllabus-doc__toolbar no-print">
        <span className="syllabus-doc__meta">
          Generated: {new Date().toLocaleDateString()} &middot; {userEmail}
        </span>
        <div className="sd-toolbar-controls">
          {activeCourses.length > 0 && (
            <label className="sd-toolbar__subject">
              <span>Subject</span>
              <select
                className="input input--sm"
                value={selectedCourse?.id ?? ''}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                aria-label="Select subject for this syllabus"
              >
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}{c.title ? ` — ${c.title}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sd-download" ref={dlMenuRef}>
            <button
              className="btn btn--primary btn--sm sd-download__main"
              onClick={downloadPdf}
              disabled={downloading || loading}
              title="Save the report to a file"
            >
              <Icon name="download" />
              {downloading ? 'Preparing...' : `Download ${dlFormat === 'pdf' ? 'PDF' : 'Word'}`}
            </button>
            <button
              className="btn btn--primary btn--sm sd-download__toggle"
              onClick={() => setDlOpen((o) => !o)}
              disabled={downloading || loading}
              aria-expanded={dlOpen}
              aria-haspopup="true"
              aria-label="Download options"
              title="Choose the format"
            >
              <Icon name="chevron" />
            </button>
            {dlOpen && (
              <div className="sd-download__menu no-print" role="menu">
                <div className="sd-download__group">
                  <span className="sd-download__label">Format</span>
                  <div className="sd-download__opts">
                    <button
                      className={`sd-download__opt${dlFormat === 'pdf' ? ' is-active' : ''}`}
                      onClick={() => setDlFormat('pdf')}
                      role="menuitemradio"
                      aria-checked={dlFormat === 'pdf'}
                    >
                      PDF
                    </button>
                    <button
                      className={`sd-download__opt${dlFormat === 'docx' ? ' is-active' : ''}`}
                      onClick={() => setDlFormat('docx')}
                      role="menuitemradio"
                      aria-checked={dlFormat === 'docx'}
                    >
                      Word
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="msg msg--error">{error}</p>}
      {notice && <p className="msg msg--success">{notice}</p>}
      {loading ? (
        <p>Loading curriculum map...</p>
      ) : (
        <SyllabusReport
          rootRef={reportRef}
          course={selectedCourse}
          courses={courses}
          goals={visibleGoals}
          peos={visiblePeos}
          adminGroups={adminGroups}
          managerGroups={managerGroups}
          subjectClos={subjectClos}
        />
      )}
    </div>
  )
}

export default View
// CourseDetails: the "COURSE DETAILS" block (I. Course Code … VIII. NUMBER OF
// HOURS) exactly as it appears in the Curriculum Report. Extracted so the
// Subject Graph's About card renders the identical markup/format instead of a
// look-alike that could drift. Styling lives in the .sd-* rules in index.css.
import type { ReactNode } from 'react'
import type { Course } from '../services/database'
import { courseCreditLabel, courseHoursSentence } from '../utils/courseCodes'

export interface CourseDetailClo {
  id: string
  code: string
  /** The outcome text shown after the code. */
  text: string
}

interface CourseDetailsProps {
  course: Course | null
  /** Resolved pre-requisites, one entry per line. */
  prereqItems: string[]
  /** Resolved co-requisites, one entry per line. */
  coreqItems: string[]
  clos: CourseDetailClo[]
  /** Shown in place of the CLO list when `clos` is empty. */
  closEmpty?: ReactNode
}

export default function CourseDetails({
  course,
  prereqItems,
  coreqItems,
  clos,
  closEmpty = 'No course learning outcomes for this subject.',
}: CourseDetailsProps) {
  return (
    <div className="sd-details">
      <div className="sd-band">COURSE DETAILS</div>
      {!course ? (
        <p>No courses yet — add one on the Course page.</p>
      ) : (
        <ol className="sd-details__list">
          <li><strong>I. Course Code:</strong> {course.code}</li>
          <li><strong>II. Course Title:</strong> {course.title}</li>
          <li>
            <strong>III. Pre-requisite:</strong>
            {prereqItems.length > 0 && (
              <ul className="sd-details__items">
                {prereqItems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </li>
          <li>
            <strong>IV. Co-requisite:</strong>
            {coreqItems.length > 0 && (
              <ul className="sd-details__items">
                {coreqItems.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </li>
          <li><strong>V. Credit:</strong> {courseCreditLabel(course)}</li>
          {/* VI and VII put their content on the lines below the label;
              VIII keeps its value on the label's own line. */}
          <li className="sd-details__block">
            <strong>VI. COURSE DESCRIPTION</strong>
            {course.description ? (
              <p>{course.description}</p>
            ) : (
              <p>No description provided for this subject.</p>
            )}
          </li>
          <li className="sd-details__block">
            <strong>VII. COURSE LEARNING OUTCOMES</strong>
            {clos.length === 0 ? (
              <p>{closEmpty}</p>
            ) : (
              <ol className="sd-details__items">
                {clos.map((c) => (
                  <li key={c.id}>{c.code}: {c.text}</li>
                ))}
              </ol>
            )}
          </li>
          <li><strong>VIII. NUMBER OF HOURS:</strong> {courseHoursSentence(course)}</li>
        </ol>
      )}
    </div>
  )
}

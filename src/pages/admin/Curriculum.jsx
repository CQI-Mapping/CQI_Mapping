// Admin Curriculum page: full management of the curriculum domain.
// Sub-tabs: Programs, Courses, Program Outcomes, Course Learning Outcomes.
// Every mutation writes an audit entry.

import { useState } from 'react'
import ProgramsView from './curriculum/ProgramsView'
import CoursesView from './curriculum/CoursesView'
import PoView from './curriculum/PoView'
import CloView from './curriculum/CloView'

const SUB_TABS = [
  { id: 'programs', label: 'Programs' },
  { id: 'courses', label: 'Courses' },
  { id: 'pos', label: 'Program Outcomes' },
  { id: 'clos', label: 'Course Learning Outcomes' },
]

function Curriculum({ userEmail }) {
  const [tab, setTab] = useState('programs')

  return (
    <div className="curriculum">
      <div className="page-heading">
        <h2>Curriculum</h2>
        <p>Manage programs, courses, and their program / course learning outcomes.</p>
      </div>

      <div className="sub-tabs" role="tablist" aria-label="Curriculum sections">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`sub-tab ${tab === t.id ? 'sub-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'programs' && <ProgramsView userEmail={userEmail} />}
      {tab === 'courses' && <CoursesView userEmail={userEmail} />}
      {tab === 'pos' && <PoView userEmail={userEmail} />}
      {tab === 'clos' && <CloView userEmail={userEmail} />}
    </div>
  )
}

export default Curriculum

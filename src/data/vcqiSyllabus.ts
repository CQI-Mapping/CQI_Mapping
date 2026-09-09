// ---------------------------------------------------------------------------
// Static document content transcribed verbatim from the VCQI syllabus PDF.
// Used by the Curriculum Map report to mirror the source document's layout.
// ---------------------------------------------------------------------------

export const DOC_HEADER = {
  republic: 'Republic of the Philippines',
  school: 'NORTHERN BUKIDNON STATE COLLEGE',
  address: 'Manolo Fortich, 8703 Bukidnon',
  motto: 'Creando futura, Transformationis vitae, Ductae a Deo',
  title: 'COURSE SYLLABUS',
  institute: 'INSTITUTE FOR COMPUTER STUDIES',
  program: 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY',
  term: 'Summer, SY: 2024 - 2025',
}

export const DOC_VISION =
  'Northern Bukidnon State College will be a college of choice, nationally recognized for having innovative and sustainable academic programs, research, extensions and services that cultivate educational, personal, and professional growth to meet the needs of our students, our society, and the global community.'

export const DOC_MISSION =
  'Northern Bukidnon State College is an accessible community-based institution that provides educational opportunities to develop students into socially responsible, competent, and productive professionals.'

export const PO_SECTION_HEADINGS: { from: number; to: number; heading: string; note?: string; sub?: string }[] = [
  {
    from: 1,
    to: 5,
    heading: 'COMMON TO ALL PROGRAMS IN ALL TYPES OF SCHOOLS',
    sub: 'the NBSC graduates have the ability to:',
  },
  // Verbatim from the source PDF, which reads "COMPUTER SCIENCE" here.
  { from: 6, to: 9, heading: 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE PROGRAM OUTCOMES' },
  { from: 10, to: 22, heading: 'SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR', note: '(CMO 25 s. 2015)' },
  { from: 23, to: 25, heading: 'COMMON TO HORIZONTAL TYPES', note: '(CMO 46 s. 2012)' },
  { from: 26, to: 27, heading: 'COLLEGE DEFINED PROGRAM OUTCOME' },
]

// Curriculum mapping (syllabus page 4): each BSIT program outcome's
// contribution to the PEOs and Strategic Goals.
export interface MappingRow {
  item: number
  text: string
  peos: string
  goals: string
}

export const MAPPING_COMMON_DISCIPLINE: MappingRow[] = [
  {
    item: 1,
    text: 'Analyze complex problems, and identify and define the computing requirements needed to design an appropriate solution;',
    peos: 'PEO 1, PEO 2',
    goals: 'Goal 1, Goal 3',
  },
  {
    item: 2,
    text: 'Apply computing and other knowledge domains to address real-world problems;',
    peos: 'PEO 1, PEO 2',
    goals: 'Goal 1, Goal 4',
  },
  {
    item: 3,
    text: 'Design and develop computing solutions using a system-level perspective;',
    peos: 'PEO 2',
    goals: 'Goal 1, Goal 3, Goal 5',
  },
  {
    item: 4,
    text: 'Utilize modern computing tools.',
    peos: 'PEO 2, PEO 3',
    goals: 'Goal 1, Goal 5',
  },
]

export const MAPPING_SUB_DISCIPLINE: MappingRow[] = [
  { item: 1, text: 'Apply knowledge of computing, science, and mathematics appropriate to the discipline;', peos: 'PEO 2', goals: 'Goal 1' },
  { item: 2, text: 'Demonstrate best practices and standards and their applications;', peos: 'PEO 1', goals: 'Goal 1, Goal 5' },
  { item: 3, text: 'Analyze complex problems, and identify and define the computing requirements appropriate to its solution;', peos: 'PEO 1, PEO 2', goals: 'Goal 1, Goal 3' },
  { item: 4, text: 'Identify and analyze user needs and take them into account in the selection, creation, evaluation and administration of computer-based systems;', peos: 'PEO 2, PEO 3', goals: 'Goal 1, Goal 4' },
  { item: 5, text: 'Design, implement, and evaluate computer-based systems, processes, components, or programs to meet desired needs and requirements under various constraints;', peos: 'PEO 2', goals: 'Goal 1, Goal 3' },
  { item: 6, text: 'Integrate IT-based solutions into the user environment effectively;', peos: 'PEO 2, PEO 3', goals: 'Goal 3, Goal 5' },
  { item: 7, text: 'Apply knowledge through the use of current techniques, skills, tools and practices necessary for the IT profession;', peos: 'PEO 2', goals: 'Goal 1, Goal 5' },
  { item: 8, text: 'Demonstrate functions effectively as a member or leader of a development team recognizing the different roles within a team to accomplish a common goal;', peos: 'PEO 1, PEO 2', goals: 'Goal 2, Goal 5' },
  { item: 9, text: 'Assist in the creation of an effective IT project plan;', peos: 'PEO 1, PEO 3', goals: 'Goal 2, Goal 4' },
]

// CLO → PLO mapping (syllabus page 5, Course Learning Outcomes table).
export const CLO_PLO_MAPPING: { code: string; text: string; plos: string }[] = [
  {
    code: 'CLO1',
    text: 'Compare and contrast procedural/functional approach to object-oriented programming approach',
    plos: 'PLO 1, PLO 3, & PLO 10',
  },
  {
    code: 'CLO2',
    text: 'Design, implement, test and debug programs using OOP concepts like abstraction, encapsulation, inheritance and polymorphism',
    plos: 'PLO 1, PLO 5, PLO 6, PLO 7, PLO 8, & PLO 12',
  },
]

// Course details block (syllabus page 5, sections I-VIII).
export const COURSE_DETAILS = {
  code: 'IT21',
  title: 'Object Oriented Programming',
  prerequisite: 'IT13 - Fundamentals of Programming 2',
  corequisite: 'None',
  credit: '3 units (2 units Lecture and 1 laboratory)',
  description:
    'This course introduces Object-Oriented Programming (OOP) with JavaScript and the use of Chart.js for dashboard creation. Students will design and develop modular, reusable code by applying OOP principles such as encapsulation, inheritance, and polymorphism. They will learn to fetch, process, and visualize data, integrate APIs for dynamic content, and customize Chart.js for clear, effective visualizations. Through hands-on projects, students will build responsive, user-friendly dashboards for modern web applications.',
  hours: '5 hours in every week for 18 weeks, or 90 hours in a semester',
}

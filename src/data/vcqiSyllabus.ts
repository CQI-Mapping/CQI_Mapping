// Seed data transcribed from the VCQI course syllabus document
// (IT21 - Object Oriented Programming, Northern Bukidnon State College,
// College of Computer Studies). Single source of truth for the default
// records auto-seeded into the admin modules on first load.

export interface SeedPeo {
  code: string
  title: string
  description: string
}

export interface SeedCmo {
  code: string
  title: string
  description: string
}

export interface SeedPo {
  code: string
  title: string
  description: string
}

export interface SeedClo {
  code: string
  title: string
  description: string
}

export const SEED_STRATEGIC_GOALS: SeedCmo[] = [
  { code: 'SG-1', title: 'Excellence in Teaching and Learning', description: null },
  { code: 'SG-2', title: 'Outstanding Human Resource Development', description: null },
  { code: 'SG-3', title: 'High Impact Research', description: null },
  { code: 'SG-4', title: 'Exemplary Service to the Profession and Community Engagement', description: null },
  { code: 'SG-5', title: '21st Century Infrastructure and Operational Sustainability', description: null },
]

export const SEED_PEOS: SeedPeo[] = [
  {
    code: 'PEO-1',
    title: 'The Nation-Builder',
    description:
      'An IT professional who applies expertise in technology, demonstrates leadership, upholds ethical standards, and fosters emotional intelligence for economic and national development.',
  },
  {
    code: 'PEO-2',
    title: 'The Innovator',
    description:
      'An IT professional who utilizes AI-driven research, capstone projects, and innovation to develop sustainable solutions, drive digital transformation, and advance productivity and commercialization in the field.',
  },
  {
    code: 'PEO-3',
    title: 'The Digital Humanitarian',
    description:
      'An IT professional who promotes digital inclusivity, respects diversity, engages in community service, and upholds GCED principles to empower marginalized groups, including Indigenous Peoples.',
  },
]

export const SEED_CMOS: SeedCmo[] = [
  {
    code: 'CMO 25 s. 2015',
    title: 'Policies, Standards and Guidelines for the BS Information Technology Program',
    description:
      'Defines the specific-to-a-sub-discipline program outcomes for BSIT courses, including the course learning outcomes mapped in this syllabus.',
  },
  {
    code: 'CMO 46 s. 2012',
    title: 'Program Outcomes Common to Horizontal Types',
    description:
      'Graduates of professional institutions demonstrate service orientation; graduates of colleges participate in development activities and public discourses; graduates of universities contribute to research and development.',
  },
]

// Program outcomes from the syllabus: common to all programs (CMO 20 s. 2021
// numbering as printed in the syllabus), sub-discipline (CMO 25 s. 2015), and
// college-defined outcomes.
export const SEED_PROGRAM_OUTCOMES: SeedPo[] = [
  { code: 'PO-1', title: 'Articulate and discuss the latest developments in the specific field of practice.', description: 'Common to all programs in all types of schools' },
  { code: 'PO-2', title: 'Effectively communicate in English and Filipino, both orally and in writing.', description: 'Common to all programs in all types of schools' },
  { code: 'PO-3', title: 'Work effectively and collaboratively with a substantial degree of independence in multi-disciplinary and multi-cultural teams.', description: 'Common to all programs in all types of schools' },
  { code: 'PO-4', title: "Act in recognition of professional, social, and ethical responsibility.", description: 'Common to all programs in all types of schools' },
  { code: 'PO-5', title: 'Preserve and promote "Filipino historical and cultural heritage".', description: 'Common to all programs in all types of schools' },
  { code: 'PO-6', title: 'Analyze complex problems, and identify and define the computing requirements needed to design an appropriate solution.', description: 'Common to the discipline' },
  { code: 'PO-7', title: 'Apply computing and other knowledge domains to address real-world problems.', description: 'Common to the discipline' },
  { code: 'PO-8', title: 'Design and develop computing solutions using a system-level perspective.', description: 'Common to the discipline' },
  { code: 'PO-9', title: 'Utilize modern computing tools.', description: 'Common to the discipline' },
  { code: 'PO-10', title: 'Apply knowledge of computing, science, and mathematics appropriate to the discipline.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-11', title: 'Demonstrate best practices and standards and their applications.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-12', title: 'Analyze complex problems, and identify and define the computing requirements appropriate to its solution.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-13', title: 'Identify and analyze user needs and take them into account in the selection, creation, evaluation and administration of computer-based systems.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-14', title: 'Design, implement, and evaluate computer-based systems, processes, components, or programs to meet desired needs and requirements under various constraints.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-15', title: 'Integrate IT-based solutions into the user environment effectively.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-16', title: 'Apply knowledge through the use of current techniques, skills, tools and practices necessary for the IT profession.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-17', title: 'Demonstrate functions effectively as a member or leader of a development team recognizing the different roles within a team to accomplish a common goal.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-18', title: 'Assist in the creation of an effective IT project plan.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-19', title: 'Communicate effectively with the computing community and with society at large about complex computing activities through logical writing, presentations, and clear instructions.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-20', title: 'Analyze the local and global impact of computing information technology on individuals, organizations, and society.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-21', title: 'Uphold professional, ethical, legal, security and social issues and responsibilities in the utilization of information technology.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-22', title: 'Recognize the need and engage in planning self-learning and improving performance as a foundation for continuing professional development.', description: 'Specific to a sub-discipline and a major (CMO 25 s. 2015)' },
  { code: 'PO-23', title: 'Graduates of professional institutions demonstrate service orientation in their respective professions.', description: 'Common to horizontal types (CMO 46 s. 2012)' },
  { code: 'PO-24', title: 'Graduates of colleges are qualified for various types of employment and participate in development activities and public discourses, particularly in response to the needs of the communities they serve.', description: 'Common to horizontal types (CMO 46 s. 2012)' },
  { code: 'PO-25', title: 'Graduates of universities contribute to the generation of new knowledge by participating in various research and development projects.', description: 'Common to horizontal types (CMO 46 s. 2012)' },
  { code: 'PO-26', title: "Promote cultural appreciation of Mindanao's heritage giving focus to Bukidnon's identity.", description: 'College-defined program outcome' },
  { code: 'PO-27', title: 'Enhance competence using the Design Thinking Framework.', description: 'College-defined program outcome' },
]

export const SEED_CLOS: SeedClo[] = [
  {
    code: 'CLO-1',
    title: 'PO1, PO3, & PO10',
    description:
      'Compare and contrast procedural/functional approach to object-oriented programming approach.',
  },
  {
    code: 'CLO-2',
    title: 'PO1, PO5, PO6, PO7, PO8, & PO12',
    description:
      'Design, implement, test and debug programs using OOP concepts like abstraction, encapsulation, inheritance and polymorphism.',
  },
]

// IT21 course record seeded under the BSIT program, linked to the CLOs above.
export const IT21_COURSE = {
  code: 'IT21',
  title: 'Object Oriented Programming',
  units: 3,
}

export const IT21_PROGRAM_CODE = 'BSIT'

// Parent program for IT21, created on demand if missing.
export const BSIT_PROGRAM = {
  code: 'BSIT',
  name: 'Bachelor of Science in Information Technology',
  description: 'BSIT program — Northern Bukidnon State College, College of Computer Studies.',
}

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

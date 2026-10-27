// poOfficial: accuracy fixture on the OFFICIAL CMO 25 s. 2015 corpus —
// the exact rows migration 010 seeds into admin_program_outcomes. The toy
// fixtures in poMatch.test / poRank.test pin contract shape; THIS fixture
// measures real closest-PO accuracy against the real list faculty pick
// from, including the document's own near-duplicate pairs (PO-1 vs SD-3
// differ by a handful of words) where the expected sets list both because
// either is a defensible mapping.
//
// Used by poOfficial.test.ts (pinned accuracy bars) and by the offline
// calibration probe (tsx script) when tuning gates.

import type { PoText } from './poMatch'

const G1 = 'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)'
const G2 = 'Specific to a sub-discipline and a major (CMO 25 S. 2015)'

export const OFFICIAL_POS: PoText[] = [
  { code: 'PO-1', title: 'Analyze complex problems, and identify and define the computing requirements needed to design an appropriate solution;', description: G1, extra: null },
  { code: 'PO-2', title: 'Apply computing and other knowledge domains to address real-world problems;', description: G1, extra: null },
  { code: 'PO-3', title: 'Design and develop computing solutions using a system-level perspective, and;', description: G1, extra: null },
  { code: 'PO-4', title: 'Utilize modern computing tools', description: G1, extra: null },
  { code: 'SD-1', title: 'Apply knowledge of computing, science, and mathematics appropriate to the discipline;', description: G2, extra: null },
  { code: 'SD-2', title: 'Demonstrate best practices and standards and their applications;', description: G2, extra: null },
  { code: 'SD-3', title: 'Analyze complex problems, and identify and define the computing requirements appropriate to its solution;', description: G2, extra: null },
  { code: 'SD-4', title: 'Design, implement, and evaluate computer-based systems, processes, components, or programs to meet desired needs and requirements under various constraints;', description: G2, extra: null },
  { code: 'SD-5', title: 'Identify and analyze user needs and take them into account in the selection, creation, evaluation and administration of computer-based systems;', description: G2, extra: null },
  { code: 'SD-6', title: 'Integrate IT-based solutions into the user environment effectively;', description: G2, extra: null },
  { code: 'SD-7', title: 'Apply knowledge through the use of current techniques, skills, tools and practices necessary for the IT profession;', description: G2, extra: null },
  { code: 'SD-8', title: 'Demonstrate functions effectively as a member or leader of a development team recognizing the different roles within a team to accomplish a common goal;', description: G2, extra: null },
  { code: 'SD-9', title: 'Assist in the creation of an effective IT project plan;', description: G2, extra: null },
  { code: 'SD-10', title: 'Communicate effectively with the computing community and with society at large about complex computing activities through logical writing, presentations, and clear instructions;', description: G2, extra: null },
  { code: 'SD-11', title: 'Analyze the local and global impact of computing information technology on individuals, organizations, and society;', description: G2, extra: null },
  { code: 'SD-12', title: 'Uphold professional, ethical, legal, security and social issues and responsibilities in the utilization of information technology; and', description: G2, extra: null },
  { code: 'SD-13', title: 'Recognize the need and engage in planning self-learning and improving performance as a foundation for continuing professional development', description: G2, extra: null },
]

export interface OfficialCase {
  draft: string
  expected: string[]
  kind: 'exact' | 'paraphrase' | 'faculty' | 'gibberish'
}

// PO-1 and SD-3 are the CMO document's near-duplicates: SD-3 lacks only
// "needed to design" — an exact SD-3 draft scores PO-1 equally. Alternates
// in the expected sets keep the fixture honest instead of demanding magic.
const EXACT_OVERRIDES: Record<string, string[]> = {
  'SD-3': ['SD-3', 'PO-1'],
}

// Draft-side word swaps whose canonical form lands back on the same synonym
// group as the title word they replace (see SYN_GROUPS in poMatch).
const SWAP: Record<string, string> = {
  apply: 'use',
  analyze: 'examine',
  communicate: 'present',
  demonstrate: 'learn',
  design: 'plan',
  develop: 'build',
  evaluate: 'assess',
  identify: 'determine',
  impact: 'influence',
  integrate: 'incorporate',
  knowledge: 'expertise',
  recognize: 'determine',
  uphold: 'observe',
  use: 'utilize',
  user: 'stakeholder',
}

export function paraphraseOf(title: string): string {
  return title
    .split(/\s+/)
    .map((w) => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '')
      const swap = SWAP[clean]
      if (!swap) return w
      const cap = /^[A-Z]/.test(w) ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap
      return w.replace(/[A-Za-z]+/, cap)
    })
    .join(' ')
}

// Faculty-style CLO drafts (the way instructors actually write descriptions)
// with the outcome(s) a curriculum expert would map them to.
const FACULTY_CASES: OfficialCase[] = [
  { draft: 'Design and develop a computer-based inventory system for a small business', expected: ['PO-3', 'SD-4'], kind: 'faculty' },
  { draft: 'Apply knowledge of computing, science, and mathematics to solve discipline problems', expected: ['SD-1', 'PO-2'], kind: 'faculty' },
  { draft: 'Communicate effectively with the computing community about complex computing activities', expected: ['SD-10'], kind: 'faculty' },
  { draft: 'Uphold professional ethics and social responsibilities in the use of information technology', expected: ['SD-12'], kind: 'faculty' },
  { draft: 'Work effectively as a member or leader of a development team to accomplish a common goal', expected: ['SD-8'], kind: 'faculty' },
  { draft: 'Identify user needs and take them into account when selecting computer-based systems', expected: ['SD-5'], kind: 'faculty' },
  { draft: 'Analyze the local and global impact of information technology on organizations and society', expected: ['SD-11'], kind: 'faculty' },
  { draft: 'Utilize modern computing tools in building project outputs', expected: ['PO-4', 'SD-7'], kind: 'faculty' },
  { draft: 'Create an effective IT project plan with clear milestones', expected: ['SD-9'], kind: 'faculty' },
  { draft: 'Integrate the finished system into the client office workflow', expected: ['SD-6'], kind: 'faculty' },
  { draft: 'Demonstrate best practices and industry standards while coding', expected: ['SD-2'], kind: 'faculty' },
  { draft: 'Recognize the need for continuing self-learning and improve performance as a professional', expected: ['SD-13'], kind: 'faculty' },
  { draft: 'Build a responsive registrar website as a computer-based system for enrollment records', expected: ['PO-3', 'SD-4'], kind: 'faculty' },
  { draft: 'Assist the team in preparing the capstone project timeline and deliverables', expected: ['SD-9', 'SD-8'], kind: 'faculty' },
  { draft: 'Present and defend the capstone output before the panel', expected: ['SD-10'], kind: 'faculty' },
  { draft: 'Evaluate the usability of the prototype against user requirements', expected: ['SD-5', 'SD-4'], kind: 'faculty' },
  { draft: 'Design a database schema for the enrollment records', expected: ['PO-3', 'SD-4'], kind: 'faculty' },
  { draft: 'Observe professional conduct and ethical responsibility when handling user data', expected: ['SD-12'], kind: 'faculty' },
  { draft: 'Collaborate with classmates to accomplish the group programming assignment', expected: ['SD-8'], kind: 'faculty' },
  { draft: 'Use current techniques, skills, and tools necessary for the IT profession', expected: ['SD-7', 'PO-4'], kind: 'faculty' },
  { draft: 'Determine the computing requirements of the client before proposing a solution', expected: ['PO-1', 'SD-3', 'SD-5'], kind: 'faculty' },
  { draft: 'Secure the login module of the computer-based system against common web attacks', expected: ['SD-4', 'SD-12'], kind: 'faculty' },
  { draft: 'Test the module against the agreed requirements before delivery', expected: ['SD-4'], kind: 'faculty' },
  { draft: 'Develop a mobile attendance app with QR scanning', expected: ['PO-3', 'SD-4'], kind: 'faculty' },
  { draft: 'Prepare user manuals and clear instructions for the deployed system', expected: ['SD-10', 'SD-6'], kind: 'faculty' },
  { draft: 'Study emerging trends in artificial intelligence and keep my skills current for the capstone', expected: ['SD-13', 'SD-7'], kind: 'faculty' },
  { draft: 'Lead the five-member development team and assign the roles', expected: ['SD-8'], kind: 'faculty' },
  { draft: 'Document the system using standard conventions', expected: ['SD-10', 'SD-2'], kind: 'faculty' },
  { draft: 'Analyze the requirements gathered from the client interview', expected: ['PO-1', 'SD-3', 'SD-5'], kind: 'faculty' },
]

export function officialCases(): OfficialCase[] {
  const cases: OfficialCase[] = []
  for (const po of OFFICIAL_POS) {
    const expected = EXACT_OVERRIDES[po.code] ?? [po.code]
    cases.push({ draft: po.title!, expected, kind: 'exact' })
    const para = paraphraseOf(po.title!)
    if (para !== po.title) {
      cases.push({ draft: para, expected: EXACT_OVERRIDES[po.code] ?? [po.code], kind: 'paraphrase' })
    }
  }
  cases.push(...FACULTY_CASES)
  cases.push({ draft: 'asdf qwer zxcv gibberish', expected: [], kind: 'gibberish' })
  cases.push({ draft: 'lorem ipsum dolor sit amet consectetur', expected: [], kind: 'gibberish' })
  return cases
}

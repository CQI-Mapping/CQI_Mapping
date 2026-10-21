// Report data shaping shared by the Curriculum Report (View.tsx) and the
// Subject Graph's About card, which renders the same document. Keeping the
// grouping/label rules here means the report reads identically wherever it
// appears.

import type {
  ChedMemoOrder,
  ProgramOutcomeStandalone,
  StrategicGoal,
  ProgramEducationalObjective,
} from '../services/database'

// Institutional letterhead / branding (not input data).
export const SCHOOL = {
  republic: 'Republic of the Philippines',
  school: 'NORTHERN BUKIDNON STATE COLLEGE',
  address: 'Manolo Fortich, 8703 Bukidnon',
  // Matches the letterhead artwork: "Creandi", not "Creando".
  motto: 'Creandi futura, Transformationis vitae, Ductae a Deo',
  title: 'COURSE SYLLABUS',
  institute: 'INSTITUTE FOR COMPUTER STUDIES',
  program: 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY',
  term: 'Summer, SY: 2024 - 2025',
}

export const DOC_VISION =
  'A recognized institution, culturally responsive, and sustainable higher education.'

export const DOC_MISSION =
  'Northern Bukidnon State College advances excellence in teaching, innovative research, and impactful community service through strategic partnerships, and inclusive and equitable education, empowering transformative development in Bukidnon and Region X.'

// Fixed CMO categories (stored as cmo_text when cmo_id is null).
export const FIXED_CMO_CATEGORIES = [
  { id: 'fixed-common', title: 'Common to All Programs in All Types of Schools' },
  { id: 'fixed-bscs', title: 'Bachelor of Science in Computer Science Program Outcomes' },
  { id: 'fixed-college', title: 'College Defined Program Outcome' },
]

// Numbering helpers: digits parsed from the PO code (PO-1 -> 1).
// Codes without digits (or blank codes) have no number — they sort last
// and display the raw code instead of "NaN".
export const poDigits = (code: string) => {
  const m = (code || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}
export const poNumber = (code: string) => poDigits(code) ?? 9999
export const poLabel = (code: string) => {
  const d = poDigits(code)
  return d === null ? (code || '—') : String(d)
}

// Stored program-outcome text already carries its own trailing punctuation
// ("...specific field of practice;"). Appending ours unconditionally rendered
// "practice;;". Only add a separator when the stored value does not already
// end with one.
export const poListItem = (code: string, title: string, isLast: boolean) => {
  const text = (title || '').trim()
  const punct = /[.;,:]$/.test(text) ? '' : isLast ? '.' : ';'
  return `${poLabel(code)}. ${text}${punct}`
}

// Some strategic goal codes are stored as "SG-2:" with the colon already
// attached, which rendered as "Goal 2:: Outstanding ...".
export const goalLine = (code: string, description: string | null) =>
  `${(code || '').trim().replace(/^SG-/i, 'Goal ').replace(/\s*:+\s*$/, '')}: ${(description || '').trim()}`

export const isActive = <T extends { status?: string }>(x: T) =>
  !x.status || x.status === 'active'

export type PoGroup = {
  heading: string
  items: ProgramOutcomeStandalone[]
}

// Group active program outcomes by CMO category.
// Admin outcomes store CMO in cmo_id (UUID) / cmo_text (fixed id).
// Manager outcomes store CMO display text in the description column (via
// EntityCrudPage's textField mapping), so we read that for manager rows.
export const cmoLabel = (po: ProgramOutcomeStandalone, cmos: ChedMemoOrder[]) => {
  if ((po as { source?: string }).source === 'manager') {
    const desc = (po.description || '').trim().toUpperCase()
    return desc || 'UNCATEGORIZED'
  }
  const key = po.cmo_id || (po as { cmo_text?: string }).cmo_text
  if (!key) return 'UNCATEGORIZED'
  const fixed = FIXED_CMO_CATEGORIES.find((c) => c.id === key)
  if (fixed) return fixed.title.toUpperCase()
  const cmo = cmos.find((c) => c.id === key)
  return cmo ? `${cmo.title} (${cmo.code})`.toUpperCase() : 'UNCATEGORIZED'
}

export const buildGroups = (
  list: ProgramOutcomeStandalone[],
  cmos: ChedMemoOrder[],
): PoGroup[] => {
  const groups: PoGroup[] = []
  for (const po of list) {
    const heading = cmoLabel(po, cmos)
    const last = groups[groups.length - 1]
    if (last && last.heading === heading) last.items.push(po)
    else groups.push({ heading, items: [po] })
  }
  return groups
}

// The Curriculum Mapping matrix is based only on the manager-inputted CMO
// categories for the BSIT program. Manager rows store the category in the
// `description` column (see cmoLabel), so we match on that text.
export const MANAGER_CM_CATEGORIES = [
  'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY PROGRAM OUTCOMES (CMO 25 S. 2015)',
  'SPECIFIC TO A SUB-DISCIPLINE AND A MAJOR (CMO 25 S. 2015)',
]

export const isManagerCmCategory = (p: ProgramOutcomeStandalone) => {
  if ((p as { source?: string }).source !== 'manager') return false
  return MANAGER_CM_CATEGORIES.includes((p.description || '').trim().toUpperCase())
}

// The report splits active outcomes into the admin list (Program Outcomes
// table) and the manager list (Curriculum Mapping matrix). Manager outcomes
// are arranged by CMO Alignment group first (matching the manager's Program
// Outcomes page), then by PO number within each group, and are restricted to
// the manager-inputted BSIT categories above.
export const splitReportPos = (visiblePos: ProgramOutcomeStandalone[]) => {
  const adminPos = visiblePos.filter((p) => (p as { source?: string }).source !== 'manager')

  const cmoGroupKey = (p: ProgramOutcomeStandalone) =>
    (p.description || '').trim().toUpperCase() || '\uffff'
  const managerPos = visiblePos
    .filter((p) => isManagerCmCategory(p))
    .sort((a, b) => {
      const ka = cmoGroupKey(a)
      const kb = cmoGroupKey(b)
      if (ka !== kb) return ka < kb ? -1 : 1
      return poNumber(a.code) - poNumber(b.code) || a.code.localeCompare(b.code)
    })

  return { adminPos, managerPos }
}

export type EditableKind = 'goal' | 'peo' | 'po'

export interface EditState {
  kind: EditableKind
  id: string
  code: string
  title: string
  description: string
}

export type EditableItem = StrategicGoal | ProgramEducationalObjective

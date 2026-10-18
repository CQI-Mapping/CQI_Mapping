// Human-readable labels for the action strings written to `activity_logs`.
//
// This map is deliberately derived from the actions the app actually emits,
// not from what would be nice to have — anything missing here renders as a
// raw snake_case string in the UI. Keep the two in sync when adding a new
// audit action.
//
// Two families of key exist per entity: `<entity>.<verb>` for the verb that
// was performed, and nothing else. Archive/restore are separate actions from
// updates precisely so the log can tell a rename apart from a removal.

export const ACTION_LABELS: Record<string, string> = {
  // Authentication
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',

  // Generic resources (manager Curriculum page)
  'resource.created': 'Created curriculum record',
  'resource.updated': 'Updated curriculum record',
  'resource.archived': 'Archived curriculum record',
  'resource.restored': 'Restored curriculum record',
  'resource.deleted': 'Deleted curriculum record',

  // Academic programs
  'program.created': 'Created program',
  'program.updated': 'Updated program',
  'program.archived': 'Archived program',
  'program.restored': 'Restored program',
  'program.deleted': 'Deleted program',

  // Courses
  'course.created': 'Created course',
  'course.updated': 'Updated course',
  'course.archived': 'Archived course',
  'course.restored': 'Restored course',
  'course.deleted': 'Deleted course',
  'course.viewed': 'Viewed subject graph for course',

  // Program outcomes
  'program_outcome.created': 'Created program outcome',
  'program_outcome.updated': 'Updated program outcome',
  'program_outcome.archived': 'Archived program outcome',
  'program_outcome.restored': 'Restored program outcome',
  'program_outcome.deleted': 'Deleted program outcome',
  'program_outcome.viewed': 'Viewed subject graph for program outcome',

  // Course learning outcomes
  'clo.created': 'Created course learning outcome',
  'clo.updated': 'Updated course learning outcome',
  'clo.archived': 'Archived course learning outcome',
  'clo.restored': 'Restored course learning outcome',
  'clo.deleted': 'Deleted course learning outcome',

  // CLO/PO mapping
  'clo_po_mapping.set': 'Set CLO/PO mapping',
  'clo_po_mapping.cleared': 'Cleared CLO/PO mapping',

  // Program educational objectives
  'peo.created': 'Created program educational objective',
  'peo.updated': 'Updated program educational objective',
  'peo.archived': 'Archived program educational objective',
  'peo.restored': 'Restored program educational objective',
  'peo.deleted': 'Deleted program educational objective',
  'peo.viewed': 'Viewed subject graph for objective',

  // Strategic goals
  'strategic_goal.created': 'Created strategic goal',
  'strategic_goal.updated': 'Updated strategic goal',
  'strategic_goal.archived': 'Archived strategic goal',
  'strategic_goal.restored': 'Restored strategic goal',
  'strategic_goal.deleted': 'Deleted strategic goal',

  // CHED memorandum orders
  'ched_memo_order.created': 'Created CHED memorandum order',
  'ched_memo_order.updated': 'Updated CHED memorandum order',
  'ched_memo_order.archived': 'Archived CHED memorandum order',
  'ched_memo_order.restored': 'Restored CHED memorandum order',
  'ched_memo_order.deleted': 'Deleted CHED memorandum order',

  // Table of Specification blueprints (faculty "Generate TOS" page)
  'tos_exam.created': 'Created exam blueprint',
  'tos_exam.updated': 'Updated exam blueprint',
  'tos_exam.archived': 'Archived exam blueprint',
  'tos_exam.restored': 'Restored exam blueprint',
  'tos_exam.exported': 'Exported exam blueprint to Excel',

  // Pages that only read
  'report.viewed': 'Viewed the name inventory',
  'page.viewed': 'Viewed a page',

  // User administration
  'user.created': 'Created user account',
  'user.deleted': 'Deleted user account',
  'role.updated': 'Changed user role',
  'profile.updated': 'Updated profile',
}

/**
 * Readable names for an action's prefix — the entity family.
 *
 * The per-user summary needs to say "3 courses, 2 sign-ins" rather than
 * "course 3, auth 2". Keys must match the prefixes ACTION_LABELS uses.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  auth: 'Sign-ins',
  resource: 'Curriculum',
  program: 'Programs',
  course: 'Courses',
  program_outcome: 'Outcomes',
  clo: 'Learning outcomes',
  clo_po_mapping: 'Mapping',
  peo: 'Objectives',
  strategic_goal: 'Strategic goals',
  ched_memo_order: 'Memo orders',
  user: 'User accounts',
  role: 'Roles',
  profile: 'Profiles',
  tos_exam: 'Blueprints',
  report: 'Reports',
  page: 'Page views',
}

/** Turn a raw action into something a person can read. */
export function labelAction(raw: string): string {
  return ACTION_LABELS[raw] ?? raw.replace(/[._]/g, ' ')
}

/** The entity family an action belongs to, e.g. 'course.viewed' -> 'course'. */
export function labelCategory(action: string): string {
  const prefix = action.split('.')[0]
  return CATEGORY_LABELS[prefix] ?? prefix.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  user: 'Faculty',
}

/**
 * Roles in the order a viewer cares about: oversight first, then the people
 * being supervised. Used to order the per-actor summary, so an admin scanning
 * it reads their own line, then the managers, then the faculty.
 */
export const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  manager: 1,
  user: 2,
}

/** A role for display. An unknown value passes through rather than going blank. */
export function labelRole(role: string | null | undefined): string {
  if (!role) return 'Unknown'
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1)
}

/** Human-readable text for a failure reason recorded on `auth.login_failed`. */
export const FAILURE_REASON_LABELS: Record<string, string> = {
  invalid_credentials: 'invalid credentials',
  service_unreachable: 'sign-in service unreachable',
}

export function labelReason(raw: string): string {
  return FAILURE_REASON_LABELS[raw] ?? raw.replace(/[._]/g, ' ')
}
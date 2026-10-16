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

  // User administration
  'user.created': 'Created user account',
  'user.deleted': 'Deleted user account',
  'role.updated': 'Changed user role',
  'profile.updated': 'Updated profile',
}

/** Turn a raw action into something a person can read. */
export function labelAction(raw: string): string {
  return ACTION_LABELS[raw] ?? raw.replace(/[._]/g, ' ')
}

/** Human-readable text for a failure reason recorded on `auth.login_failed`. */
export const FAILURE_REASON_LABELS: Record<string, string> = {
  invalid_credentials: 'invalid credentials',
  service_unreachable: 'sign-in service unreachable',
}

export function labelReason(raw: string): string {
  return FAILURE_REASON_LABELS[raw] ?? raw.replace(/[._]/g, ' ')
}
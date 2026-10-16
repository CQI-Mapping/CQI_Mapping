// Service layer: ALL Supabase queries live here so pages never talk to the DB directly.
// Every function returns data or throws an error the page can display.
// Row Level Security (RLS) on the DB is the real gate — these calls just go through it.
//
// Section guide:
//   Types          — UserRole, Profile, ActivityLogEntry, Resource, NavItem, etc.
//   Profiles       — ensureProfile, updateProfile, syncDemoRole, fetchAllProfiles
//   Resources      — legacy curriculum records (used by manager role)
//   Strategic Goals — CRUD for admin-managed strategic goals
//   PEOs           — CRUD for admin-managed Program Educational Objectives
//   POs (standalone) — CRUD for admin-managed Program Outcomes list
//   CLOs (standalone) — CRUD for admin-managed Course Learning Outcomes list
//   CMOs           — CRUD for admin-managed CHED Memorandum Orders
//   TOS            — Table of Specification exam blueprints (private per user)
//   Activity Logs  — fetchActivityLogs, addActivityLog (server-stamped via RPC)

import { supabase as _supabase } from '../utils/supabaseClient'
import type { User } from '@supabase/supabase-js'
// The Bloom level union lives with the TOS maths; only the type is needed
// here, and re-declaring it would let the two drift apart.
import type { BloomLevel } from '../utils/tosMath'

// Assert supabase client is configured (throws at runtime if not).
const supabase = _supabase!

// ---------- Types ----------

export type UserRole = 'admin' | 'manager' | 'user'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

// Extra context recorded alongside an audit entry. Everything here is
// optional because not every action has anything meaningful to add —
// `auth.login` only ever carries a `reason` on failure. The actor is
// deliberately absent: it is stamped server-side from the caller's JWT,
// so a client can never attribute an action to someone else.
export interface ActivityDetails {
  // Which record was touched, in the app's vocabulary ('program', 'course',
  // 'clo', ...). Matches the prefix of the `action` string.
  entity?: string
  // Primary key of the row that changed, so an entry can be traced back to
  // the exact record even after the record is later edited or deleted.
  entity_id?: string
  // Human-readable identity for the record at the time of the action
  // (e.g. "BSCS - Intro to Computing"). Snapshotted rather than looked up
  // on read, so renaming a record does not rewrite history.
  label?: string
  // Why an action failed — only used by `auth.login_failed`.
  reason?: string
}

export interface ActivityLogEntry {
  id: string
  user_email: string | null
  action: string
  details: ActivityDetails | null
  created_at: string
}

export interface Program {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  created_at: string
}

export interface Course {
    id: string
    code: string
    title: string
    units: number
    credit_lecture: number
    credit_laboratory: number
    description: string | null
    program_id: string | { id: string; code: string; name: string }
    curriculum_id: string | { id: string; code: string } | null
    instructor_id: string | { id: string; full_name: string | null; email: string } | null
    prerequisite: string
    corequisite: string
    status: string
    created_at: string
    updated_at: string
  }

export interface ProgramOutcome {
  id: string
  code: string
  description: string | null
  program_id: string
  created_at: string
}

export interface CourseLearningOutcome {
  id: string
  code: string
  description: string | null
  course_id: string
  created_at: string
}

export interface CloPoMappingEntry {
  id: string
  level: number
  clo_id: { id: string; code: string; course_id: string }
  po_id: { id: string; code: string; program_id: string }
}

export interface Resource {
    id: string
    title: string
    code: string | null
    description: string | null
    units: number | null
    status: string
    created_by: string | { full_name: string | null }
    created_at: string
  }

export interface NavItem {
  id: string
  label: string
}

export interface ChedMemoOrder {
  id: string
  code: string
  title: string
  description: string | null
  status?: string
  created_at: string
  updated_at: string
}

// ---------- Profiles ----------

export async function ensureProfile(user: User): Promise<Profile> {
  const { data: existing, error: getError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (getError) throw getError
  if (existing) return existing

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email,
      full_name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProfile(profileId: string, updates: Partial<Pick<Profile, 'full_name'>>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', profileId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function syncDemoRole(): Promise<UserRole | null> {
  const { data, error } = await supabase.rpc('sync_demo_role')
  if (error) throw error
  return data
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })
  if (error) throw error
  return data
}

export async function updateUserRole(profileId: string, role: UserRole): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', profileId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Privileged account operations run through the admin-users Edge Function.
// The service-role key stays on the server; the function verifies the
// caller's role from their JWT (admins manage all accounts, managers may
// only create faculty accounts) before acting.

export interface AdminCreateUserResult {
  id: string
  email: string
  welcomeEmailSent?: boolean
}

interface AdminUsersFunctionError {
  error?: string
}

async function invokeAdminUsers(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // FunctionsHttpError: the function responded with a non-2xx status and a
    // JSON body like { error: "message" } — surface its message when possible.
    let message = error.message
    try {
      const payload = (await (error as { context?: Response }).context?.json()) as
        | AdminUsersFunctionError
        | undefined
      if (payload?.error) message = payload.error
    } catch {
      /* keep the generic message */
    }
    throw new Error(message)
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as AdminUsersFunctionError).error))
  }
  return data
}

export async function adminCreateUser(
  email: string,
  password: string,
  fullName: string,
  role: UserRole
): Promise<AdminCreateUserResult> {
  const data = (await invokeAdminUsers({
    action: 'create',
    email,
    password,
    fullName,
    role,
  })) as AdminCreateUserResult
  return data
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await invokeAdminUsers({ action: 'delete', userId })
}

// ---------- Resources (curriculum records) ----------

export async function fetchResources(): Promise<Resource[]> {
  const { data, error } = await supabase
    .from('resources')
    .select('*, created_by ( full_name )')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createResource(
    code: string,
    description: string | null,
    units: number | null,
    userId: string
  ): Promise<Resource> {
    const { data, error } = await supabase
    .from('resources')
      .insert({ title: code, code, description, units, created_by: userId })
      .select()
      .single()
    if (error) throw error
    return data
  }

export async function updateResource(
  id: string,
  updates: Partial<Pick<Resource, 'title' | 'code' | 'description' | 'units' | 'status'>>
): Promise<Resource> {
  const { data, error } = await supabase
    .from('resources')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await supabase.from('resources').delete().eq('id', id)
  if (error) throw error
}

// ---------- CQI curriculum domain ----------

// PROGRAMS

export async function fetchPrograms(): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

export async function createProgram(payload: Partial<Program>): Promise<Program> {
  const { data, error } = await supabase
    .from('programs')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProgram(id: string, updates: Partial<Program>): Promise<Program> {
  const { data, error } = await supabase
    .from('programs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProgram(id: string): Promise<void> {
  const { error } = await supabase.from('programs').delete().eq('id', id)
  if (error) throw error
}

// COURSES

export async function fetchCourses(): Promise<Course[]> {
  const { data, error } = await supabase
.from('courses')
      .select('*, program_id ( id, code, name ), curriculum_id ( id, code ), instructor_id ( id, full_name, email )')
      .order('code', { ascending: true })
  if (error) throw error
  return data
}

export async function assignCourseInstructor(courseId: string, instructorId: string | null): Promise<Course> {
  // Assign (or unassign with null) the faculty user teaching a course.
  // RLS: managers and admins can update courses; the instructor profile
  // join resolves only where profiles RLS allows (own row, or all rows
  // for manager/admin).
  return updateCourse(courseId, { instructor_id: instructorId })
}

export async function createCourse(payload: Partial<Course>): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', id)
  if (error) throw error
}

// PROGRAM OUTCOMES (PO)

export async function fetchProgramOutcomes(programId: string | null = null): Promise<ProgramOutcome[]> {
  let query = supabase.from('program_outcomes').select('*')
  if (programId) query = query.eq('program_id', programId)
  query = query.order('code', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createProgramOutcome(payload: Partial<ProgramOutcome>): Promise<ProgramOutcome> {
  const { data, error } = await supabase
    .from('program_outcomes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProgramOutcome(id: string, updates: Partial<ProgramOutcome>): Promise<ProgramOutcome> {
  const { data, error } = await supabase
    .from('program_outcomes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProgramOutcome(id: string): Promise<void> {
  const { error } = await supabase.from('program_outcomes').delete().eq('id', id)
  if (error) throw error
}

// COURSE LEARNING OUTCOMES (CLO)

export async function fetchCourseLearningOutcomes(courseId: string | null = null): Promise<CourseLearningOutcome[]> {
  let query = supabase.from('course_learning_outcomes').select('*')
  if (courseId) query = query.eq('course_id', courseId)
  query = query.order('code', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createCourseLearningOutcome(payload: Partial<CourseLearningOutcome>): Promise<CourseLearningOutcome> {
  const { data, error } = await supabase
    .from('course_learning_outcomes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCourseLearningOutcome(id: string, updates: Partial<CourseLearningOutcome>): Promise<CourseLearningOutcome> {
  const { data, error } = await supabase
    .from('course_learning_outcomes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCourseLearningOutcome(id: string): Promise<void> {
  const { error } = await supabase.from('course_learning_outcomes').delete().eq('id', id)
  if (error) throw error
}

// CLO/PO MATRIX

export async function fetchCloPoMatrix(courseId: string | null = null): Promise<CloPoMappingEntry[]> {
  let query = supabase
    .from('clo_po_matrix')
    .select('id, level, clo_id ( id, code, course_id ), po_id ( id, code, program_id )')
  if (courseId) query = query.eq('clo_id.course_id', courseId)
  const { data, error } = await query
  if (error) throw error
  return data as unknown as CloPoMappingEntry[]
}

export async function upsertCloPoMapping(cloId: string, poId: string, level: number): Promise<CloPoMappingEntry> {
  const { data, error } = await supabase
    .from('clo_po_matrix')
    .upsert({ clo_id: cloId, po_id: poId, level }, { onConflict: 'clo_id,po_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCloPoMapping(cloId: string, poId: string): Promise<void> {
  const { error } = await supabase
    .from('clo_po_matrix')
    .delete()
    .eq('clo_id', cloId)
    .eq('po_id', poId)
  if (error) throw error
}

export interface StrategicGoal {
  id: string
  code: string
  title: string | null
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function fetchStrategicGoals(): Promise<StrategicGoal[]> {
  const { data, error } = await supabase
    .from('strategic_goals')
    .select('*')
    .order('code', { ascending: true })
  if (error) throw error
  return data
}

export async function createStrategicGoal(payload: Partial<StrategicGoal>): Promise<StrategicGoal> {
  const { data, error } = await supabase
    .from('strategic_goals')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStrategicGoal(id: string, updates: Partial<StrategicGoal>): Promise<StrategicGoal> {
  const { data, error } = await supabase
    .from('strategic_goals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStrategicGoal(id: string): Promise<void> {
  const { error } = await supabase.from('strategic_goals').delete().eq('id', id)
  if (error) throw error
}

// ---------- Program Educational Objectives ----------

export interface ProgramEducationalObjective {
  id: string
  code: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function fetchProgramEducationalObjectives(): Promise<ProgramEducationalObjective[]> {
  const { data, error } = await supabase
    .from('program_educational_objectives')
    .select('*')
    .order('code', { ascending: true })
  if (error) throw error
  return data
}

export async function createProgramEducationalObjective(payload: Partial<ProgramEducationalObjective>): Promise<ProgramEducationalObjective> {
  const { data, error } = await supabase
    .from('program_educational_objectives')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProgramEducationalObjective(id: string, updates: Partial<ProgramEducationalObjective>): Promise<ProgramEducationalObjective> {
  const { data, error } = await supabase
    .from('program_educational_objectives')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProgramEducationalObjective(id: string): Promise<void> {
  const { error } = await supabase.from('program_educational_objectives').delete().eq('id', id)
  if (error) throw error
}

export interface ProgramOutcomeStandalone {
  id: string
  code: string
  title: string
  description: string | null
  cmo_id: string | null
  cmo_text: string | null
  peo_id: string | null
  peo_text: string | null
  sg_id: string | null
  sg_text: string | null
  source: string
  status: string
  created_at: string
  updated_at: string
}

export async function fetchProgramOutcomesStandalone(source?: 'admin' | 'manager'): Promise<ProgramOutcomeStandalone[]> {
  let query = supabase
    .from('admin_program_outcomes')
    .select('*')
  if (source) query = query.eq('source', source)
  query = query.order('code', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createProgramOutcomeStandalone(payload: Partial<ProgramOutcomeStandalone>): Promise<ProgramOutcomeStandalone> {
  const { data, error } = await supabase
    .from('admin_program_outcomes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProgramOutcomeStandalone(id: string, updates: Partial<ProgramOutcomeStandalone>): Promise<ProgramOutcomeStandalone> {
  const { data, error } = await supabase
    .from('admin_program_outcomes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProgramOutcomeStandalone(id: string): Promise<void> {
  const { error } = await supabase.from('admin_program_outcomes').delete().eq('id', id)
  if (error) throw error
}

// ---------- Course Learning Outcomes (standalone) ----------

export interface CourseLearningOutcomeStandalone {
  id: string
  code: string
  course: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function fetchCourseLearningOutcomesStandalone(): Promise<CourseLearningOutcomeStandalone[]> {
  const { data, error } = await supabase
    .from('admin_course_learning_outcomes')
    .select('*')
    .order('code', { ascending: true })
  if (error) throw error
  return data
}

export async function createCourseLearningOutcomeStandalone(payload: Partial<CourseLearningOutcomeStandalone>): Promise<CourseLearningOutcomeStandalone> {
  const { data, error } = await supabase
    .from('admin_course_learning_outcomes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCourseLearningOutcomeStandalone(id: string, updates: Partial<CourseLearningOutcomeStandalone>): Promise<CourseLearningOutcomeStandalone> {
  const { data, error } = await supabase
    .from('admin_course_learning_outcomes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCourseLearningOutcomeStandalone(id: string): Promise<void> {
  const { error } = await supabase.from('admin_course_learning_outcomes').delete().eq('id', id)
  if (error) throw error
}

// ---------- CHED Memorandum Orders ----------

export interface ChedMemoOrder {
  id: string
  code: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function fetchChedMemoOrders(): Promise<ChedMemoOrder[]> {
  const { data, error } = await supabase
    .from('ched_memorandum_orders')
    .select('*')
    .order('code', { ascending: true })
  if (error) throw error
  return data
}

export async function createChedMemoOrder(payload: Partial<ChedMemoOrder>): Promise<ChedMemoOrder> {
  const { data, error } = await supabase
    .from('ched_memorandum_orders')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateChedMemoOrder(id: string, updates: Partial<ChedMemoOrder>): Promise<ChedMemoOrder> {
  const { data, error } = await supabase
    .from('ched_memorandum_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteChedMemoOrder(id: string): Promise<void> {
  const { error } = await supabase.from('ched_memorandum_orders').delete().eq('id', id)
  if (error) throw error
}

// ---------- PO feedback (shared pick/reject log for suggestion curation) ----------

export type PoVerdict = 'picked' | 'rejected'

export interface PoFeedback {
  id: string
  draft_sig: string
  po_code: string
  verdict: PoVerdict
  created_at: string
}

export async function recordPoFeedback(
  draftSig: string,
  poCode: string,
  verdict: PoVerdict
): Promise<void> {
  const { error } = await supabase
    .from('po_feedback')
    .insert({ draft_sig: draftSig, po_code: poCode, verdict })
  if (error) console.warn('PO feedback not recorded:', error.message)
}

export async function fetchPoFeedback(): Promise<PoFeedback[]> {
  const { data, error } = await supabase
    .from('po_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}

// ---------- Activity logs (server-stamped via log_activity RPC) ----------

export interface ActivityLogQuery {
  /**
   * Restrict to one record family ('program', 'course', ...). Applied
   * server-side so a per-record view is not squeezed out by unrelated rows.
   */
  entity?: string
  /** Row cap. Defaults to 100 — the "latest activity" reading. */
  limit?: number
}

export async function fetchActivityLogs(q: ActivityLogQuery = {}): Promise<ActivityLogEntry[]> {
  const limit = q.limit ?? 100

  if (q.entity) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('details->>entity', q.entity)
      .order('created_at', { ascending: false })
      .limit(limit)
    // The jsonb filter narrows what the server sends; the caller still narrows
    // it further to one row. If a deployment rejects the filter, fall back to
    // the unfiltered page rather than showing an empty log.
    if (!error) return data
    console.warn('Activity log entity filter unavailable, falling back:', error.message)
  }

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function recordLoginEvent(
  email: string,
  success: boolean,
  reason: string | null = null
): Promise<void> {
  const { error } = await supabase.rpc('record_login_event', {
    p_email: email,
    p_success: success,
    p_reason: reason,
  })
  if (error) console.warn('Login event not recorded:', error.message)
}

// Audit entries are written by the SECURITY DEFINER log_activity() function,
// which stamps the caller's real email from their JWT. The client supplies
// only the action and a details blob — never the actor — so entries can't be
// forged. `details` is optional; the RPC's second parameter defaults to NULL,
// so older single-argument calls keep working.
export async function addActivityLog(action: string, details?: ActivityDetails): Promise<void> {
  const { error } = await supabase.rpc('log_activity', {
    p_action: action,
    p_details: details ?? null,
  })
  if (error) console.warn('Audit log insert failed:', error.message)
}

// ---------- Table of Specification ----------
//
// The hour weighting is deliberately absent from these tables. It is
// derived on read from topic hours and the sheet total (tosMath), so
// editing either input moves every weight for free and nothing can go
// stale in storage.

export interface TosExamRow {
  id: string
  user_id: string
  code: string
  title: string
  exam_type: string
  term: string
  coverage: string | null
  prepared_by: string | null
  total_hours: number
  status: string
  created_at: string
  updated_at: string
}

export interface TosSheetRow {
  id: string
  exam_id: string
  kind: 'items' | 'points'
  label: string
  total: number
  note: string | null
  position: number
}

export interface TosTopicRow {
  id: string
  sheet_id: string
  position: number
  title: string
  slo: string | null
  hours: number
  bloom: Partial<Record<BloomLevel, number>>
  created_at: string
  updated_at: string
}

/**
 * The signed-in user's blueprints, newest activity first. RLS already
 * restricts this to rows the caller owns, so no user filter is needed
 * here and adding one would only risk disagreeing with the policy.
 */
export async function fetchTosExams(): Promise<TosExamRow[]> {
  const { data, error } = await supabase
    .from('tos_exams')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data as TosExamRow[]
}

/**
 * The owner is taken from the caller rather than trusted from the payload:
 * user_id is the value the RLS policy checks, so a caller that guessed or
 * omitted it would either be denied (a NULL policy result reads as a
 * violation) or claim someone else's row. Taking it as a separate argument
 * keeps it out of the object the caller spreads.
 */
export async function createTosExam(
  payload: Partial<TosExamRow>,
  userId: string,
): Promise<TosExamRow> {
  const { data, error } = await supabase
    .from('tos_exams')
    .insert({ ...payload, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data as TosExamRow
}

export async function updateTosExam(
  id: string,
  updates: Partial<TosExamRow>,
): Promise<TosExamRow> {
  const { data, error } = await supabase
    .from('tos_exams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TosExamRow
}

export async function deleteTosExam(id: string): Promise<void> {
  const { error } = await supabase.from('tos_exams').delete().eq('id', id)
  if (error) throw error
}

export async function fetchTosSheets(examId: string): Promise<TosSheetRow[]> {
  const { data, error } = await supabase
    .from('tos_sheets')
    .select('*')
    .eq('exam_id', examId)
    .order('position', { ascending: true })
  if (error) throw error
  return data as TosSheetRow[]
}

export async function createTosSheet(
  payload: Partial<TosSheetRow>,
): Promise<TosSheetRow> {
  const { data, error } = await supabase
    .from('tos_sheets')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as TosSheetRow
}

export async function updateTosSheet(
  id: string,
  updates: Partial<TosSheetRow>,
): Promise<TosSheetRow> {
  const { data, error } = await supabase
    .from('tos_sheets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TosSheetRow
}

export async function fetchTosTopics(sheetId: string): Promise<TosTopicRow[]> {
  const { data, error } = await supabase
    .from('tos_topics')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('position', { ascending: true })
  if (error) throw error
  return data as TosTopicRow[]
}

/**
 * Replace a sheet's topics wholesale, in one round trip.
 *
 * Position is part of the unique key, so reordering in place would
 * collide on intermediate states. Deleting the missing ids and
 * upserting the survivors sidesteps that: the set is replaced rather
 * than transformed.
 *
 * This is the only topic writer the page needs -- a per-row upsert and
 * delete were written first and then superseded once it became clear that
 * the grid always has the whole set in hand.
 */
export async function replaceTosTopics(
  sheetId: string,
  topics: { id?: string; title: string; slo: string; hours: number; bloom: Partial<Record<BloomLevel, number>> }[],
): Promise<void> {
  const keep = topics.filter((t) => t.id).map((t) => t.id as string)
  const { data: existing } = await supabase
    .from('tos_topics')
    .select('id')
    .eq('sheet_id', sheetId)
  const stale = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !keep.includes(id))

  if (stale.length > 0) {
    const { error } = await supabase.from('tos_topics').delete().in('id', stale)
    if (error) throw error
  }

  if (topics.length > 0) {
    const { error } = await supabase.from('tos_topics').upsert(
      topics.map((t, i) => ({
        ...(t.id ? { id: t.id } : {}),
        sheet_id: sheetId,
        position: i + 1,
        title: t.title,
        slo: t.slo,
        hours: t.hours,
        bloom: t.bloom,
      })),
    )
    if (error) throw error
  }
}

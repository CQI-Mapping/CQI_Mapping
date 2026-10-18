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
    /**
     * Year level and semester, for the Curriculum Mapping Summary. Optional
     * because the columns are a migration that may not have been applied to the
     * database yet: absent columns come back undefined and the report renders a
     * dash. Nothing writes them yet, so a database without the migration behaves
     * exactly as before.
     */
    year_level?: number | null
    semester?: number | null
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
  // No explicit column list on purpose: the select is '*' plus relation joins,
  // so an optional column a database predates simply comes back absent rather
  // than making the whole query fail.
  const { data, error } = await supabase
.from('courses')
      .select('*, program_id ( id, code, name ), curriculum_id ( id, code ), instructor_id ( id, full_name, email )')
      .order('code', { ascending: true })
  if (error) throw error
  return data
}

/** A CQI recommendation, for the Overall Report's monitoring panel. */
export interface CqiAction {
  id: string
  code: string
  recommendation: string
  responsible: string
  status: 'pending' | 'in_progress' | 'completed'
  target_date: string | null
  program_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Latest CQI actions.
 *
 * Fails SOFT, deliberately. cqi_actions is a migration that may not have been
 * applied to the database yet, and a report whose last panel throws over a
 * missing table is worse than one that shows no recommendations. A rejected
 * query and a table with no rows both come back as an empty list, so the panel
 * renders the same empty state either way.
 */
export async function fetchCqiActions(limit = 5): Promise<CqiAction[]> {
  try {
    const { data, error } = await supabase
      .from('cqi_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data ?? []) as CqiAction[]
  } catch {
    return []
  }
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

/**
 * Whether the courses table already carries the term columns. The statements
 * ship in supabase-schema.sql, but a live database older than them lacks the
 * columns, and the summary should show a setup note rather than controls
 * that can only fail on save.
 *
 * A missing column is exactly what this probes for; any other error --
 * network, auth -- is not a schema question, so it answers true and lets a
 * real save surface the real problem.
 */
export async function courseTermColumnsExist(): Promise<boolean> {
  const { error } = await supabase.from('courses').select('year_level').limit(1)
  if (!error) return true
  const code = (error as { code?: string }).code
  if (code === '42703' || /does not exist/i.test(error.message)) return false
  return true
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

/**
 * Server-side filters for the activity log.
 *
 * These used to be applied in the browser over a fixed 100-row page, which
 * meant the filters could only ever narrow what was already in memory — a
 * record whose entry sat at position 101 was invisible no matter what you typed.
 * Pushing them into the query is what makes the log usable for oversight.
 */
export interface ActivityLogFilters {
  /** Exact actor. The log is global, so this is how you isolate one person. */
  userEmail?: string
  /** Exact action string, e.g. 'course.viewed'. */
  action?: string
  /**
   * Free text, matched server-side against the actor and the action only.
   *
   * PostgREST's `or()` takes a comma-separated grammar, so the term has to be
   * stripped of the characters that would end the condition early — an
   * unescaped comma in the box would otherwise turn one search into two
   * unrelated ones. The record's `details.label` is NOT searched here: it is
   * jsonb, and reaching into it costs a cast that fails loudly rather than
   * quietly. The page still matches labels over the rows it fetched.
   */
  search?: string
  /** Inclusive start, 'YYYY-MM-DD'. Interpreted in the browser's timezone. */
  from?: string
  /** Inclusive end, 'YYYY-MM-DD'. Covers the whole day, not just midnight. */
  to?: string
  limit?: number
}

/** Default page size once filtering is server-side. */
export const ACTIVITY_LOG_LIMIT = 500

/**
 * 'YYYY-MM-DD' to an ISO instant, in local time.
 *
 * `new Date('2026-10-14')` alone parses as UTC midnight, which in a timezone
 * behind UTC lands the "From" boundary on the following day and silently drops
 * that day's entries. Pinning the time component makes the boundary local,
 * matching what the date input shows the user.
 */
function localDayBoundary(date: string, endOfDay: boolean): string {
  const d = new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

/**
 * Applies the filter set to a query. Shared so the log and the rollup cannot
 * drift on what "filtered by these dates" means.
 */
interface ActivityQuery {
  eq(column: string, value: string): ActivityQuery
  or(condition: string): ActivityQuery
  gte(column: string, value: string): ActivityQuery
  lte(column: string, value: string): ActivityQuery
}

interface ActivityQueryResult {
  data: ActivityLogEntry[] | null
  error: { message: string } | null
}

function applyActivityFilters(
  query: ActivityQuery,
  filters: ActivityLogFilters,
): ActivityQuery {
  let q = query
  if (filters.userEmail) q = q.eq('user_email', filters.userEmail)
  if (filters.action) q = q.eq('action', filters.action)
  if (filters.search) {
    // Strip the characters PostgREST's or() grammar treats as structure, so a
    // pasted email or a label with a comma cannot rewrite the query.
    const term = filters.search.replace(/[,()%*'"\s]+/g, ' ').trim()
    if (term) {
      q = q.or(`user_email.ilike.%${term}%,action.ilike.%${term}%`)
    }
  }
  if (filters.from) {
    const iso = localDayBoundary(filters.from, false)
    if (iso) q = q.gte('created_at', iso)
  }
  if (filters.to) {
    const iso = localDayBoundary(filters.to, true)
    if (iso) q = q.lte('created_at', iso)
  }
  return q
}

/**
 * Audit entries, newest first.
 *
 * With no filters this returns the latest page for the dashboards. Callers that
 * pass filters get a query narrowed by the database, so a search for one user
 * or one week reaches entries the old fixed 100-row page could not.
 */
export async function fetchActivityLogs(
  filters: ActivityLogFilters = {},
): Promise<ActivityLogEntry[]> {
  const composed = applyActivityFilters(
    // The Postgrest builder's inferred type is enormous and is re-evaluated on
    // every chain step, which TypeScript gives up on (TS2589). Going through
    // `unknown` short-circuits that inference entirely: the filter helpers only
    // ever need eq/or/gte/lte, and awaiting only needs the result shape.
    supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filters.limit ?? ACTIVITY_LOG_LIMIT) as unknown as ActivityQuery,
    filters,
  )
  const { data, error } = await (composed as unknown as Promise<ActivityQueryResult>)
  if (error) throw error
  return data ?? []
}

/** One actor's activity, summarised. */
export interface ActivityRollupRow {
  user_email: string
  total: number
  /** Failed sign-in attempts by this actor — the number worth flagging. */
  failedLogins: number
  successfulLogins: number
  /** Most recent entry's timestamp, ISO. */
  lastSeen: string
  /** Entry counts keyed by the action prefix: 'course', 'auth', 'peo', … */
  byCategory: Record<string, number>
}

/**
 * Per-actor totals over the filtered window.
 *
 * Aggregated in the browser rather than in SQL: PostgREST cannot GROUP BY, so
 * this would need either a database view or a round trip per row. Fetching the
 * window once and folding it here is one query and is well within budget at
 * this table's size.
 *
 * `user_email` can be null for a row whose writer could not resolve a profile,
 * which would otherwise collapse into one nameless bucket.
 */
export async function fetchActivityRollup(
  filters: ActivityLogFilters = {},
): Promise<ActivityRollupRow[]> {
  const entries = await fetchActivityLogs({ ...filters, limit: ACTIVITY_LOG_LIMIT })
  const byUser = new Map<string, ActivityRollupRow>()

  for (const entry of entries) {
    const key = entry.user_email || '(unknown actor)'
    let row = byUser.get(key)
    if (!row) {
      row = {
        user_email: key,
        total: 0,
        failedLogins: 0,
        successfulLogins: 0,
        lastSeen: entry.created_at,
        byCategory: {},
      }
      byUser.set(key, row)
    }
    row.total += 1
    if (entry.action === 'auth.login_failed') row.failedLogins += 1
    if (entry.action === 'auth.login') row.successfulLogins += 1
    // Entries arrive newest-first, so the first one seen is the latest.
    if (entry.created_at > row.lastSeen) row.lastSeen = entry.created_at
    const category = entry.action.split('.')[0]
    row.byCategory[category] = (row.byCategory[category] ?? 0) + 1
  }

  return [...byUser.values()].sort((a, b) => b.total - a.total || a.user_email.localeCompare(b.user_email))
}

/**
 * The distinct actors present in the log, for the user filter's dropdown.
 *
 * Read separately from the table so the options do not shrink as the other
 * filters narrow the rows on screen — a filter that can only ever offer the
 * values currently visible cannot be widened.
 */
export async function fetchActivityActors(): Promise<string[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('user_email')
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LOG_LIMIT)
  if (error) throw error
  const set = new Set<string>()
  for (const row of data ?? []) if (row.user_email) set.add(row.user_email)
  return [...set].sort((a, b) => a.localeCompare(b))
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

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
//   Activity Logs  — fetchActivityLogs, addActivityLog (server-stamped via RPC)

import { supabase as _supabase } from '../utils/supabaseClient'
import { SEED_CLOS, IT21_COURSE, IT21_PROGRAM_CODE, BSIT_PROGRAM } from '../data/vcqiSyllabus.js'
import type { User } from '@supabase/supabase-js'

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

export interface ActivityLogEntry {
  id: string
  user_email: string | null
  action: string
  created_at: string
}

export interface Resource {
  id: string
  title: string
  description: string | null
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
// The service-role key stays on the server; the function verifies the caller
// is an admin from their JWT before acting.

export interface AdminCreateUserResult {
  id: string
  email: string
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
  title: string,
  description: string | null,
  userId: string
): Promise<Resource> {
  const { data, error } = await supabase
    .from('resources')
    .insert({ title, description, created_by: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateResource(
  id: string,
  updates: Partial<Pick<Resource, 'title' | 'description' | 'status'>>
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
    .select('*, program_id ( id, code, name )')
    .order('code', { ascending: true })
  if (error) throw error
  return data
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

// VCQI syllabus seeding: ensure the BSIT program, the IT21 - Object Oriented
// Programming course, and its course learning outcomes all exist. Idempotent —
// existing rows are looked up by unique code before inserting, so repeated
// calls never create duplicates.
export async function seedIt21Course(): Promise<void> {
  let { data: program, error: programError } = await supabase
    .from('programs')
    .select('id')
    .eq('code', IT21_PROGRAM_CODE)
    .maybeSingle()
  if (programError) throw programError

  if (!program) {
    const { data: insertedProgram, error: insertProgramError } = await supabase
      .from('programs')
      .insert({ code: BSIT_PROGRAM.code, name: BSIT_PROGRAM.name, description: BSIT_PROGRAM.description })
      .select('id')
      .single()
    if (insertProgramError) throw insertProgramError
    program = insertedProgram
  }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('program_id', program.id)
    .eq('code', IT21_COURSE.code)
    .maybeSingle()
  if (courseError) throw courseError

  let courseId: string | undefined = course?.id
  if (!courseId) {
    const { data: inserted, error: insertError } = await supabase
      .from('courses')
      .insert({
        program_id: program.id,
        code: IT21_COURSE.code,
        title: IT21_COURSE.title,
        units: IT21_COURSE.units,
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    courseId = inserted.id
  }

  const { data: clos, error: closError } = await supabase
    .from('course_learning_outcomes')
    .select('code')
    .eq('course_id', courseId)
  if (closError) throw closError
  const existingCodes = new Set((clos ?? []).map((c) => c.code))
  const missing = SEED_CLOS.filter((c) => !existingCodes.has(c.code))
  if (missing.length === 0) return
  const { error: insertCloError } = await supabase
    .from('course_learning_outcomes')
    .insert(missing.map((c) => ({ course_id: courseId!, code: c.code, description: c.title })))
  if (insertCloError) throw insertCloError
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
  status: string
  created_at: string
  updated_at: string
}

export interface ProgramOutcomeStandalone {
  id: string
  code: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function fetchProgramOutcomesStandalone(): Promise<ProgramOutcomeStandalone[]> {
  const { data, error } = await supabase
    .from('admin_program_outcomes')
    .select('*')
    .order('code', { ascending: true })
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

// ---------- Activity logs (server-stamped via log_activity RPC) ----------

export async function fetchActivityLogs(): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
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
// only the action — never the actor — so entries can't be forged.
export async function addActivityLog(action: string): Promise<void> {
  const { error } = await supabase.rpc('log_activity', { p_action: action })
  if (error) console.warn('Audit log insert failed:', error.message)
}

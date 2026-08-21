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
//   Activity Logs  — fetchActivityLogs, addActivityLog (details column removed)

import { supabase as _supabase } from '../utils/supabaseClient'
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

// ---------- Strategic Goals ----------

export interface StrategicGoal {
  id: string
  code: string
  title: string
  description: string | null
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

// ---------- Program Outcomes (standalone) ----------

export interface ProgramOutcomeStandalone {
  id: string
  code: string
  title: string
  description: string | null
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

// ---------- Activity logs (details column removed) ----------

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

export async function addActivityLog(
  userEmail: string,
  action: string
): Promise<void> {
  const { error } = await supabase
    .from('activity_logs')
    .insert({ user_email: userEmail, action })
  if (error) console.warn('Audit log insert failed:', error.message)
}

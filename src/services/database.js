// Service layer: ALL Supabase queries live here so pages never talk to the DB directly.
// Every function returns data or throws an error the page can display.
// Row Level Security (RLS) on the DB is the real gate — these calls just go through it.

import { supabase } from '../utils/supabaseClient'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// ---------- Profiles ----------

// Fetch one profile by auth user id (used after sign-in).
// RLS: the owner can read their own row; admins/managers can read any.
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Fetch a user's profile, creating it if missing (self-heal).
// If the row is gone (e.g. after a schema re-run), the new row starts with role 'user'.
// The INSERT policy only allows a user to create their OWN row, so this can't self-promote.
export async function ensureProfile(user) {
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

// Update a user's own profile (e.g. full_name).
// RLS: the owner (or an admin) may update a row.
export async function updateProfile(profileId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', profileId)
    .select()
    .single()
  if (error) throw error
  return data
}

// List all profiles (admin: Users page, manager: Faculty directory).
// RLS: managers and admins can read all profiles; a plain user cannot.
export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })
  if (error) throw error
  return data
}

// Change a user's role (admin only).
// RLS: the "Admins can update any profile" policy blocks everyone else.
export async function updateUserRole(profileId, role) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', profileId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Create an auth user via the Supabase Admin API (admin "Create user" feature).
// Requires VITE_SUPABASE_SERVICE_ROLE_KEY — the service key bypasses RLS, so it must
// stay in .env and never be sent to the browser in production.
export async function adminCreateUser(email, password, fullName, role) {
  const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env to create users.')
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true, // dev convenience: new users can sign in immediately
      user_metadata: { full_name: fullName },
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.msg || 'Failed to create user.')
  }

  const created = await res.json()

  // The signup trigger creates the profile with role 'user' — bump it if a higher role was chosen.
  if (role && role !== 'user') {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', created.id)
    if (error) throw error
  }

  return created
}

// ---------- Resources (curriculum records) ----------

// List curriculum records, newest first, with the creator's name embedded via a join.
// RLS: any signed-in user can read.
export async function fetchResources() {
  const { data, error } = await supabase
    .from('resources')
    .select('*, created_by ( full_name )')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Insert a curriculum record.
// RLS: only admins/managers can insert, and only with created_by = the caller's id.
export async function createResource(title, description, userId) {
  const { data, error } = await supabase
    .from('resources')
    .insert({ title, description, created_by: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

// Edit a curriculum record (title/description/status).
// RLS: admins/managers can update; a user cannot.
export async function updateResource(id, updates) {
  const { data, error } = await supabase
    .from('resources')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Permanently delete a curriculum record.
// RLS: admins only.
export async function deleteResource(id) {
  const { error } = await supabase.from('resources').delete().eq('id', id)
  if (error) throw error
}

// ---------- CQI curriculum domain (programs, courses, POs, CLOs) ----------

// PROGRAMS

// List all programs, alphabetically by name.
// RLS: any signed-in user can read.
export async function fetchPrograms() {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

// Insert a program. RLS: admins/managers can insert.
export async function createProgram(payload) {
  const { data, error } = await supabase
    .from('programs')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Edit a program (code/name/description/status). RLS: admins/managers can update.
export async function updateProgram(id, updates) {
  const { data, error } = await supabase
    .from('programs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Permanently delete a program (cascades to courses/POs). RLS: admins only.
export async function deleteProgram(id) {
  const { error } = await supabase.from('programs').delete().eq('id', id)
  if (error) throw error
}

// COURSES

// List all courses with their program embedded, by course code.
// RLS: any signed-in user can read.
export async function fetchCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*, program_id ( id, code, name )')
    .order('code', { ascending: true })
  if (error) throw error
  return data
}

// Insert a course. RLS: admins/managers can insert.
export async function createCourse(payload) {
  const { data, error } = await supabase
    .from('courses')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Edit a course. RLS: admins/managers can update.
export async function updateCourse(id, updates) {
  const { data, error } = await supabase
    .from('courses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Permanently delete a course (cascades to its CLOs). RLS: admins only.
export async function deleteCourse(id) {
  const { error } = await supabase.from('courses').delete().eq('id', id)
  if (error) throw error
}

// PROGRAM OUTCOMES (PO)

// List program outcomes, optionally filtered by program, by outcome code.
// RLS: any signed-in user can read.
export async function fetchProgramOutcomes(programId = null) {
  let query = supabase.from('program_outcomes').select('*')
  if (programId) query = query.eq('program_id', programId)
  query = query.order('code', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return data
}

// Insert a program outcome. RLS: admins/managers can insert.
export async function createProgramOutcome(payload) {
  const { data, error } = await supabase
    .from('program_outcomes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Edit a program outcome. RLS: admins/managers can update.
export async function updateProgramOutcome(id, updates) {
  const { data, error } = await supabase
    .from('program_outcomes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Permanently delete a program outcome. RLS: admins only.
export async function deleteProgramOutcome(id) {
  const { error } = await supabase.from('program_outcomes').delete().eq('id', id)
  if (error) throw error
}

// COURSE LEARNING OUTCOMES (CLO)

// List course learning outcomes, optionally filtered by course, by outcome code.
// RLS: any signed-in user can read.
export async function fetchCourseLearningOutcomes(courseId = null) {
  let query = supabase.from('course_learning_outcomes').select('*')
  if (courseId) query = query.eq('course_id', courseId)
  query = query.order('code', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return data
}

// Insert a course learning outcome. RLS: admins/managers can insert.
export async function createCourseLearningOutcome(payload) {
  const { data, error } = await supabase
    .from('course_learning_outcomes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Edit a course learning outcome. RLS: admins/managers can update.
export async function updateCourseLearningOutcome(id, updates) {
  const { data, error } = await supabase
    .from('course_learning_outcomes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Permanently delete a course learning outcome. RLS: admins only.
export async function deleteCourseLearningOutcome(id) {
  const { error } = await supabase.from('course_learning_outcomes').delete().eq('id', id)
  if (error) throw error
}

// CLO/PO MATRIX

// List CLO/PO mappings with CLO and PO embedded. When a course is given,
// only rows whose CLO belongs to that course are returned (nested filter).
// RLS: any signed-in user can read.
export async function fetchCloPoMatrix(courseId = null) {
  let query = supabase
    .from('clo_po_matrix')
    .select('id, level, clo_id ( id, code, course_id ), po_id ( id, code, program_id )')
  if (courseId) query = query.eq('clo_id.course_id', courseId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// Insert or update a single CLO/PO strength cell. RLS: admins/managers.
// The validate_clo_po_program trigger rejects pairs from different programs.
export async function upsertCloPoMapping(cloId, poId, level) {
  const { data, error } = await supabase
    .from('clo_po_matrix')
    .upsert({ clo_id: cloId, po_id: poId, level }, { onConflict: 'clo_id,po_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// Remove a CLO/PO mapping (blank the cell). RLS: admins only.
export async function deleteCloPoMapping(cloId, poId) {
  const { error } = await supabase
    .from('clo_po_matrix')
    .delete()
    .eq('clo_id', cloId)
    .eq('po_id', poId)
  if (error) throw error
}

// ---------- Audit log ----------

// Latest 100 audit entries, newest first.
// RLS: admins/managers can read; a user cannot (the query returns empty for them).
export async function fetchAuditLog() {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

// Record a sign-in attempt (success or failure) via the record_login_event RPC.
// The function is SECURITY DEFINER so it can insert even when there is no session
// (a failed login has no signed-in user, so RLS would otherwise block the insert).
// Failures are only logged, never thrown — a broken log must not block login.
export async function recordLoginEvent(email, success, reason = null) {
  const { error } = await supabase.rpc('record_login_event', {
    p_email: email,
    p_success: success,
    p_reason: reason,
  })
  if (error) console.warn('Login event not recorded:', error.message)
}

// Insert a generic audit entry for an arbitrary action.
// Called from pages after mutating actions (create/edit/archive/delete/role change).
// RLS: any signed-in user can insert. Treated as an activity trail, not tamper-proof.
export async function addAuditLog(userEmail, action, details = {}) {
  const { error } = await supabase
    .from('audit_log')
    .insert({ user_email: userEmail, action, details })
  if (error) console.warn('Audit log insert failed:', error.message)
}

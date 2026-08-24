// Edge Function: admin-users
//
// Server-side gate for admin user management. Replaces the old pattern of
// shipping VITE_SUPABASE_SERVICE_ROLE_KEY to the browser (which let anyone
// read it out of the JS bundle and bypass RLS entirely).
//
// The service-role key lives here only, as an injected secret on the hosted
// Supabase runtime. Every request must carry the caller's JWT in the
// Authorization header (supabase-js functions.invoke does this automatically),
// and the caller's profiles.role must be 'admin'.
//
// Deploy once per project:
//   npx supabase login
//   npx supabase link --project-ref <your-project-ref>
//   npx supabase functions deploy admin-users
//
// Request bodies:
//   { action: 'create', email, password, fullName?, role } -> { id, email }
//   { action: 'delete', userId }                           -> { ok: true }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(message: string, status: number): Response {
  return json({ error: message }, status)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return fail('Missing or malformed Authorization header', 401)
    }

    // Service client — bypasses RLS, used only inside this function.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Resolve the caller from their JWT.
    const token = authHeader.replace('Bearer ', '')
    const { data: callerData, error: callerError } =
      await admin.auth.getUser(token)
    if (callerError || !callerData.user) {
      return fail('Invalid or expired token', 401)
    }
    const callerId = callerData.user.id

    // 2. Only admins may manage accounts.
    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .maybeSingle()
    if (profileError) throw profileError
    if (callerProfile?.role !== 'admin') {
      return fail('Forbidden: admin role required', 403)
    }

    // 3. Dispatch the action.
    const body = await req.json().catch(() => null)

    if (body?.action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
      const role = ['admin', 'manager', 'user'].includes(body.role)
        ? body.role
        : 'user'

      if (!email || !password) {
        return fail('Email and password are required', 400)
      }

      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || undefined },
        })
      if (createError) throw createError

      // The handle_new_user trigger already created a profile row; set role/name.
      const { error: updateError } = await admin
        .from('profiles')
        .update({ role, full_name: fullName || null })
        .eq('id', created.user.id)
      if (updateError) throw updateError

      return json({ id: created.user.id, email: created.user.email })
    }

    if (body?.action === 'delete') {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!userId) return fail('userId is required', 400)
      if (userId === callerId) {
        return fail('You cannot delete your own account', 400)
      }

      // profiles rows cascade on auth.users delete.
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
      if (deleteError) throw deleteError

      return json({ ok: true })
    }

    return fail("Unknown action — expected 'create' or 'delete'", 400)
  } catch (err) {
    console.error('admin-users error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return fail(message, 500)
  }
})

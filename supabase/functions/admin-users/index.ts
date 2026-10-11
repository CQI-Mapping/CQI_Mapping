// Edge Function: admin-users
//
// Server-side gate for admin user management. Replaces the old pattern of
// shipping VITE_SUPABASE_SERVICE_ROLE_KEY to the browser (which let anyone
// read it out of the JS bundle and bypass RLS entirely).
//
// The service-role key lives here only, as an injected secret on the hosted
// Supabase runtime. Every request must carry the caller's JWT in the
// Authorization header (supabase-js functions.invoke does this automatically).
//
// Tiered access:
//   admin   — create any role (admin/manager/user), delete any account.
//   manager — create 'user' (faculty) accounts only; any requested role is
//             forced to 'user' so privilege escalation is impossible.
//             Delete stays admin-only.
//
// Welcome email: after a successful create, the new user is emailed at their
// address ("your account was created by <inviter name>"). Sending uses Resend
// and is skipped gracefully when the secrets below are unset — account
// creation still succeeds, and the response reports welcomeEmailSent:false.
//
//   npx supabase secrets set RESEND_API_KEY=re_... WELCOME_FROM_EMAIL="CQI Monitoring <accounts@your-domain>" APP_URL=https://your-app-url
//
// Redeploy after changing this file:
//   npx supabase login
//   npx supabase link --project-ref <your-project-ref>
//   npx supabase functions deploy admin-users
//
// Request bodies:
//   { action: 'create', email, password, fullName?, role } -> { id, email, welcomeEmailSent }
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

    // 2. Admins manage all accounts; managers may only create faculty.
    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', callerId)
      .maybeSingle()
    if (profileError) throw profileError
    const callerRole = callerProfile?.role ?? null
    if (callerRole !== 'admin' && callerRole !== 'manager') {
      return fail('Forbidden: admin or manager role required', 403)
    }
    const isAdmin = callerRole === 'admin'

    // 3. Dispatch the action.
    const body = await req.json().catch(() => null)

    if (body?.action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
      // Managers can only create faculty — force the role so a crafted
      // request can never mint an admin or manager account.
      const role = !isAdmin
        ? 'user'
        : ['admin', 'manager', 'user'].includes(body.role)
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

      // Welcome email to the new user, naming who added them. Never blocks
      // creation: any failure is logged and reported as welcomeEmailSent:false.
      // (The password is intentionally NOT included — the inviter shares it
      // with them directly, or they use password recovery.)
      let welcomeEmailSent = false
      const resendKey = Deno.env.get('RESEND_API_KEY') || ''
      const fromEmail = Deno.env.get('WELCOME_FROM_EMAIL') || ''
      const appUrl = Deno.env.get('APP_URL') || ''
      const inviterName =
        callerProfile?.full_name || callerProfile?.email || 'your administrator'
      const roleLabel =
        role === 'admin' ? 'Administrator' : role === 'manager' ? 'Program Head' : 'Faculty'
      if (resendKey && fromEmail) {
        try {
          const emailResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: email,
              subject: 'Your CQI Monitoring account was created',
              text:
                `Hello ${fullName || email},\n\n` +
                `An account has been created for you on the CQI Monitoring System ` +
                `(NBSC · Institute of Computer Studies) by ${inviterName}.\n\n` +
                `Role: ${roleLabel}\n` +
                `Sign-in email: ${email}\n` +
                (appUrl ? `Sign-in page: ${appUrl}\n` : '') +
                `Ask ${inviterName} for your password, or use password recovery on the sign-in page.\n\n` +
                `— CQI Monitoring System`,
            }),
          })
          welcomeEmailSent = emailResp.ok
          if (!emailResp.ok) {
            console.error('welcome email failed:', await emailResp.text())
          }
        } catch (err) {
          console.error('welcome email error:', err)
        }
      }

      return json({ id: created.user.id, email: created.user.email, welcomeEmailSent })
    }

    if (body?.action === 'delete') {
      if (!isAdmin) {
        return fail('Forbidden: admin role required', 403)
      }
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

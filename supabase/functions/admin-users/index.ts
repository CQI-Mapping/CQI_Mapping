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
// address ("your account was created by <inviter name>"). When no password
// was supplied — the manager's Add Faculty form only asks for an email —
// a strong random password is generated here (nobody sees it) and the user
// is emailed a way to set their own password before signing in:
//   * Resend secrets configured  -> custom-branded welcome email with a
//     one-time "set your password" link (an auth recovery link minted here).
//   * otherwise (the default)    -> Supabase's built-in mailer sends its
//     recovery email for the fresh account; its template already carries
//     the working link, so no third-party service is involved. Built-in
//     sending is rate-limited (~2 emails/hour) by Supabase's shared mailer.
//   * neither is available / send failures -> creation still succeeds and
//     the response reports welcomeEmailSent:false; the user falls back to
//     "Forgot password" on the sign-in page.
//
//   npx supabase secrets set RESEND_API_KEY=re_... WELCOME_FROM_EMAIL="CQI Monitoring <accounts@your-domain>" APP_URL=https://your-app-url
//
// Redeploy after changing this file:
//   npx supabase login
//   npx supabase link --project-ref <your-project-ref>
//   npx supabase functions deploy admin-users
//
// Request bodies:
//   { action: 'create', email, password?, fullName?, role, programId? } -> { id, email, welcomeEmailSent }
//   { action: 'resend', userId } -> { ok, email, inviteSent }  (fresh one-time sign-in email)
//   { action: 'delete', userId }                                -> { ok: true }
//
// programId is accepted from admins only, and only for manager/user
// roles — it must exist in the programs table (verified here), and is
// always cleared for admins, who are not bounded to one program.

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

// Cryptographically random password for invite-flow creations. The value is
// never returned to the caller or logged — the generated account's password
// is "whatever nobody knows"; the user sets their own via the emailed
// recovery link. The 55-char alphabet avoids look-alike characters; the
// byte→char mapping carries a negligible modulo bias, inconsequential for a
// one-time password that the user immediately replaces by their own.
function generatePassword(length = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

// Sends Supabase's BUILT-IN recovery email for an existing account — the
// no-third-party path. GoTrue's own mailer renders the default "Reset
// Password" template whose {{ .ConfirmationURL }} is the one-time link the
// user opens to set their password (the app's PASSWORD_RECOVERY flow takes
// over from there, same as Forgot-password). `redirect_to` points the link
// at the app; if it is rejected (not in the project's redirect allow-list)
// the send retries without it so GoTrue falls back to the configured Site
// URL. Returns true only when the mailer accepted the send; never throws.
// Beware: the built-in mailer is limited to ~2 sends/hour per project.
async function sendBuiltInRecoveryEmail(to: string, appUrl: string): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!url || !anon) return false
  const post = async (redirectTo: string | null): Promise<Response> =>
    await fetch(
      redirectTo
        ? `${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`
        : `${url}/auth/v1/recover`,
      {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: to }),
      },
    )
  try {
    // Prefer landing the link on the app; on rejection, delete redirect and
    // retry so the email still goes out (points at the Site URL).
    let resp = appUrl ? await post(appUrl) : await post(null)
    if (!resp.ok && appUrl) resp = await post(null)
    if (!resp.ok) {
      console.error('built-in recovery email failed:', resp.status, await resp.text())
      return false
    }
    console.log('built-in recovery email accepted for:', to)
    return true
  } catch (err) {
    console.error('built-in recovery email error:', err)
    return false
  }
}

// Escapes user-controlled text (names, emails) for safe interpolation into
// the HTML email — plain innerText replacement, no entities beyond the five
// meaningful ones.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Builds the branded card-style HTML email (inline styles only — email
// clients strip <style> blocks). Mirrors the plain-text twin above: a card
// with the greeting, the role, a highlighted sign-in-email box, the
// one-time set-password button and the NBSC footer. Green theme matches
// the app (16a34a); background stays light so Gmail's light/dark themes
// and Outlook render it safely.
function buildEmailHtml(args: {
  to: string
  name: string
  role: string
  inviterName: string
  appUrl: string
  setupLink?: string
  passwordGenerated?: boolean
  resend?: boolean
}): string {
  const name = escapeHtml(args.name || 'there')
  const to = escapeHtml(args.to)
  const inviter = escapeHtml(args.inviterName)
  const roleLabel =
    args.role === 'admin' ? 'Administrator' : args.role === 'manager' ? 'Program Head' : 'Faculty'
  const escapedRole = escapeHtml(roleLabel)

  // Greeting + intro sentence differ between the first invite and a re-send.
  const title = args.resend ? 'Your CQI Monitoring sign-in link' : 'Welcome to CQI Monitoring'
  const intro = args.resend
    ? `Here is a new one-time sign-in link for your account, sent by <b>${inviter}</b>. If your previous link expired or never arrived, use this one.`
    : `An account has been created for you as a <b>${escapedRole}</b> on the CQI Monitoring System by ${inviter}.`

  let actionBlock: string
  if (args.setupLink) {
    const link = escapeHtml(args.setupLink)
    actionBlock =
      `<p style="margin:0 0 16px; font-size:15px; color:#374151;">` +
      `To set your password and sign in, click the button below.</p>\n` +
      `<a href="${link}" style="display:inline-block; background:#16a34a; color:#ffffff; ` +
      `font-size:15px; font-weight:600; padding:12px 24px; border-radius:10px; ` +
      `text-decoration:none;">Set Password &amp; Sign In</a>\n` +
      `<p style="margin:14px 0 0; font-size:12.5px; color:#6b7280; line-height:1.5;">` +
      `This link can be used once. If it has expired or doesn't work, use ` +
      `"Forgot password" on the sign-in page instead.</p>`
  } else if (args.passwordGenerated) {
    // Rare fallback: the password was generated server-side but no link
    // could be built — recovery is the only way in.
    actionBlock =
      `<p style="margin:0 0 16px; font-size:15px; color:#374151;">` +
      `To choose your password, use <b>"Forgot password"</b> on the sign-in ` +
      `page — you'll receive an email to finish signing in.</p>\n` +
      (args.appUrl
        ? `<a href="${escapeHtml(args.appUrl)}" style="display:inline-block; background:#16a34a; color:#ffffff; font-size:15px; font-weight:600; padding:12px 24px; border-radius:10px; text-decoration:none;">Go to Sign-In</a>`
        : '')
  } else {
    // Inviter chose the password themselves (admin flow).
    actionBlock =
      `<p style="margin:0 0 16px; font-size:15px; color:#374151;">` +
      `Ask ${inviter} for your password, or use password recovery on the ` +
      `sign-in page.</p>\n` +
      (args.appUrl
        ? `<a href="${escapeHtml(args.appUrl)}" style="display:inline-block; background:#16a34a; color:#ffffff; font-size:15px; font-weight:600; padding:12px 24px; border-radius:10px; text-decoration:none;">Access Portal</a>`
        : '')
  }

  return (
    `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif; background:#f4f6f4; padding:24px 12px;">\n` +
    `<div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #dbe5db; border-radius:16px; padding:32px;">\n` +
    `<h1 style="margin:0 0 16px; font-size:22px; color:#111827;">${title}</h1>\n` +
    `<p style="margin:0 0 12px; font-size:15px; color:#111827;">Hello <b>${name}</b>,</p>\n` +
    `<p style="margin:0 0 20px; font-size:15px; color:#374151; line-height:1.6;">${intro}</p>\n` +
    `<div style="background:#f1f5f1; border:1px solid #dbe5db; border-radius:10px; padding:14px 18px; margin:0 0 20px;">\n` +
    `<div style="font-size:13px; color:#6b7280; margin:0 0 4px;"><b>Sign-in Email:</b></div>\n` +
    `<span style="font-size:16px; color:#16a34a; font-weight:600;">${to}</span>\n` +
    `</div>\n` +
    actionBlock + `\n` +
    `<hr style="border:none; border-top:1px solid #e5e7eb; margin:26px 0 18px;" />\n` +
    `<p style="margin:0; text-align:center; font-size:12.5px; color:#6b7280;">` +
    `Northern Bukidnon State College &middot; Institute of Computer Studies</p>\n` +
    `</div>\n</div>`
  )
}

// Sends the "your account was created by <inviter>" welcome email via Resend.
// Returns true only when Resend accepted it (and logs the Resend message id
// so the delivery can be traced in the Resend dashboard). Never throws:
// missing secrets or send failures resolve false so account creation is
// never blocked. (When the inviter did not choose a password, `setupLink`
// carries the one-time set-your-password link and the email leads with it;
// otherwise the inviter shares the chosen password directly.)
async function sendWelcomeEmail(args: {
  to: string
  name: string
  role: string
  inviterName: string
  setupLink?: string
  passwordGenerated?: boolean
  resend?: boolean
}): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const fromEmail = Deno.env.get('WELCOME_FROM_EMAIL') || ''
  const appUrl = Deno.env.get('APP_URL') || ''
  if (!resendKey || !fromEmail) return false
  const roleLabel =
    args.role === 'admin'
      ? 'Administrator'
      : args.role === 'manager'
        ? 'Program Head'
        : 'Faculty'
  // A fresh invitation re-send: different subject/intro so the recipient
  // isn't left wondering why their account is "created" yet again.
  const intro = args.resend
    ? `Here is a new one-time sign-in link for your CQI Monitoring System ` +
      `(NBSC · Institute of Computer Studies) account, sent by ${args.inviterName}.`
    : `An account has been created for you on the CQI Monitoring System ` +
      `(NBSC · Institute of Computer Studies) by ${args.inviterName}.`
  const subject = args.resend
    ? 'Your CQI Monitoring sign-in link'
    : 'Welcome to CQI Monitoring'
  const bodyLines = args.setupLink
    ? `Role: ${roleLabel}\n` +
      `Sign-in email: ${args.to}\n` +
      (appUrl ? `Sign-in page: ${appUrl}\n` : '') +
      `\nTo set your password and sign in, open this one-time link:\n` +
      `${args.setupLink}\n\n` +
      `The link can be used once. If it has expired or doesn't work, use ` +
      `"Forgot password" on the sign-in page instead.\n\n`
    : args.passwordGenerated
      ? // Rare fallback: the password was generated here but the one-time
        // link couldn't be built, so there is no password anyone can hand
        // over — recovery is the way in.
        `Role: ${roleLabel}\n` +
        `Sign-in email: ${args.to}\n` +
        (appUrl ? `Sign-in page: ${appUrl}\n` : '') +
        `To choose your password, use "Forgot password" on the sign-in ` +
        `page (you'll get an email to finish signing in).\n\n`
      : `Role: ${roleLabel}\n` +
        `Sign-in email: ${args.to}\n` +
        (appUrl ? `Sign-in page: ${appUrl}\n` : '') +
        `Ask ${args.inviterName} for your password, or use password recovery ` +
        `on the sign-in page.\n\n`
  try {
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: args.to,
        subject,
        text:
          `Hello ${args.name || args.to},\n\n` +
          intro + `\n\n` +
          bodyLines +
          `— CQI Monitoring System`,
        html: buildEmailHtml(args),
      }),
    })
    if (!emailResp.ok) {
      console.error('welcome email failed:', await emailResp.text())
      return false
    }
    const sent = await emailResp.json().catch(() => null)
    console.log('welcome email sent:', sent?.id ?? '(no id)', 'to:', args.to)
    return true
  } catch (err) {
    console.error('welcome email error:', err)
    return false
  }
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
    const inviterName =
      callerProfile?.full_name || callerProfile?.email || 'your administrator'

    // 3. Dispatch the action.
    const body = await req.json().catch(() => null)
    // Where emailed sign-in links land (and the email's "Sign-in page" line).
    const appUrl = Deno.env.get('APP_URL') || ''

    if (body?.action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
      // Managers can only create faculty — force the role so a crafted
      // request can never mint an admin or manager account.
      const role = !isAdmin
        ? 'user'
        : ['admin', 'manager', 'user'].includes(body.role)
          ? body.role
          : 'user'

      if (!email) {
        return fail('Email is required', 400)
      }

      // The password is optional: the inviter-chosen one (admin flow) or a
      // generated random one (invite flow where the new user sets their own
      // password through the emailed one-time link). Either way the account
      // exists with a real password, so it can sign in immediately.
      let password = typeof body.password === 'string' ? body.password : ''
      const passwordGenerated = !password
      if (passwordGenerated) password = generatePassword()
      // Password policy mirrors the client: 8+ characters (generated ones
      // always satisfy it).
      if (password.length < 8) {
        return fail('Password must be at least 8 characters', 400)
      }

      // Program assignment: admins only, and never for admin accounts.
      // The id is verified so a crafted request cannot point at a
      // nonexistent program; managers' requests are ignored entirely.
      let programId: string | null = null
      if (isAdmin && role !== 'admin' && typeof body.programId === 'string' && body.programId) {
        const { data: program, error: programError } = await admin
          .from('programs')
          .select('id')
          .eq('id', body.programId)
          .maybeSingle()
        if (programError) throw programError
        if (!program) return fail('Unknown program selected', 400)
        programId = body.programId
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
        .update({ role, full_name: fullName || null, program_id: programId })
        .eq('id', created.user.id)
      if (updateError) throw updateError

      // Welcome email to the new user, naming who added them. When the
      // password was generated here (invite flow), the user is emailed a way
      // to set their own password:
      //   * Resend configured -> custom-branded email led by a minted
      //     one-time recovery link (generateLink never sends mail itself;
      //     its failure just degrades the wording inside the email).
      //   * otherwise -> Supabase's built-in mailer recovery email; the
      //     default template already contains the one-time set-password link.
      //   * neither works -> welcomeEmailSent:false and the UI tells the
      //     inviter to point the user at Forgot password on the sign-in page.
      let welcomeEmailSent = false
      if (passwordGenerated) {
        const resendConfigured =
          !!Deno.env.get('RESEND_API_KEY') && !!Deno.env.get('WELCOME_FROM_EMAIL')
        if (resendConfigured) {
          let setupLink: string | undefined
          try {
            const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
              type: 'recovery',
              email,
              ...(appUrl ? { options: { redirectTo: appUrl } } : {}),
            })
            if (linkError) throw linkError
            setupLink = linkData?.properties?.actionLink || undefined
          } catch (err) {
            console.error('generateLink failed (falling back to recovery-note email):', err)
          }
          welcomeEmailSent = await sendWelcomeEmail({
            to: email,
            name: fullName,
            role,
            inviterName,
            setupLink,
            passwordGenerated,
          })
          if (!welcomeEmailSent) {
            // Resend rejected the send (wrong recipient for the sandbox
            // sender until a domain is verified, expired key, outage...).
            // Fall back to Supabase's built-in mailer so the faculty member
            // still receives the one-time set-password email rather than
            // nothing — branded delivery comes back on its own once Resend
            // accepts the sender/recipient pair.
            console.error('resend send rejected — falling back to built-in mailer')
            welcomeEmailSent = await sendBuiltInRecoveryEmail(email, appUrl)
          }
        } else {
          welcomeEmailSent = await sendBuiltInRecoveryEmail(email, appUrl)
        }
      }

      return json({ id: created.user.id, email: created.user.email, welcomeEmailSent })
    }

    if (body?.action === 'resend') {
      // Re-invite an existing account: mint a fresh one-time link and email
      // it (branded via Resend when configured, falling back to Supabase's
      // built-in mailer). Admins may re-invite any account but their own;
      // managers only their faculty.
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!userId) return fail('userId is required', 400)
      if (userId === callerId) {
        return fail('You already know how to sign in — use Forgot password if you lost it', 400)
      }
      const { data: target, error: targetError } = await admin
        .from('profiles')
        .select('id, role, email, full_name, status')
        .eq('id', userId)
        .maybeSingle()
      if (targetError) throw targetError
      if (!target) return fail('Unknown account', 404)
      if (!isAdmin && target.role !== 'user') {
        return fail('Forbidden: managers may only re-invite faculty accounts', 403)
      }
      if (target.status === 'archived') {
        return fail('This account is archived — restore it before re-inviting', 400)
      }

      let resendLink: string | undefined
      try {
        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email: target.email,
          ...(appUrl ? { options: { redirectTo: appUrl } } : {}),
        })
        if (linkError) throw linkError
        resendLink = linkData?.properties?.actionLink || undefined
      } catch (err) {
        console.error('resend generateLink failed:', err)
      }

      let inviteSent = await sendWelcomeEmail({
        to: target.email,
        name: target.full_name || '',
        role: target.role || 'user',
        inviterName,
        setupLink: resendLink,
        passwordGenerated: true,
        resend: true,
      })
      if (!inviteSent) {
        inviteSent = await sendBuiltInRecoveryEmail(target.email, appUrl)
      }

      return json({ ok: true, email: target.email, inviteSent })
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

// End-to-end Add-User verification against the live project — the same path
// the admin Users & Accounts page takes, without needing the app or clicking
// anything. Use it to check Migration 020's heal (or any future drift) in one
// command:
//
//   node scripts/diag-admin-create.mjs [adminEmail] [adminPassword]
//
// Defaults to the seeded demo admin documented in README §3.1. What it does:
//   1. signs in (email/password) and takes that session's JWT,
//   2. invokes the admin-users Edge Function with action:'create' for a
//      scratch address the database has never seen (password empty — the
//      invite flow, exactly as the admin form sends it),
//   3. prints the raw HTTP status + body, so a trigger failure shows as
//      GoTrue's "Database error creating new user" 500 and a healthy run
//      shows the created { id, email, welcomeEmailSent },
//   4. when creation SUCCEEDED, immediately deletes the scratch account via
//      the same function, leaving the database as it was (no profile, no
//      audit rows — those are written by the page, not the function).
//
// The script prints no secrets; the JWT is kept in memory only. It reads
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env (never committed).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

function readEnv() {
  try {
    const raw = readFileSync(join(here, '..', '.env'), 'utf8')
    const vars = {}
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m) vars[m[1]] = m[2]
    }
    return vars
  } catch {
    return {}
  }
}

const env = readEnv()
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
const ADMIN_EMAIL = process.argv[2] || 'admin@cqi.test'
const ADMIN_PASSWORD = process.argv[3] || 'Admin@123456'

const die = (m) => { console.error('FATAL:', m); process.exit(1) }
if (!url || !anon) die('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (set them in .env at the repo root).')

// 1. Sign in.
const signRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
})
const signBody = await signRes.json()
console.log(`[1] sign-in as ${ADMIN_EMAIL}: HTTP ${signRes.status}`)
if (!signRes.ok) die(`sign-in failed: ${JSON.stringify(signBody)}`)

// 2. Invoke the Edge Function like supabase-js functions.invoke does:
//    Authorization = the user's JWT, apikey = the anon key.
const scratchEmail = `admin.diagnostic+${Date.now()}@cqi.test`
const createRes = await fetch(`${url}/functions/v1/admin-users`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${signBody.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'create', email: scratchEmail, password: '', fullName: 'Add-User Diagnostic', role: 'user' }),
})
const createText = await createRes.text()
console.log(`[2] admin-users create (${scratchEmail}): HTTP ${createRes.status}`)
console.log(`    ${createText}`)

let createdId = null
try { createdId = JSON.parse(createText).id } catch { /* non-JSON body — delete skipped */ }

// 3. Clean up after a healthy run so the database keeps its shape.
if (createRes.ok && createdId) {
  const deleteRes = await fetch(`${url}/functions/v1/admin-users`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${signBody.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', userId: createdId }),
  })
  const deleteText = await deleteRes.text()
  console.log(`[3] admin-users delete (scratch ${createdId}): HTTP ${deleteRes.status} ${deleteText}`)
  console.log(`\nRESULT: Add User works end to end — created then removed the scratch account.`)
  process.exit(0)
}

if (createRes.status === 500 && /Database error creating new user/i.test(createText)) {
  console.log(
    `\nRESULT: the auth.users trigger still fails the INSERT. Run ` +
    `supabase/migrations/020-user-creation-heal.sql in the Supabase SQL Editor ` +
    `(it heals the function + trigger and self-reports schema blockers), then rerun this script.`,
  )
  process.exit(1)
}

console.log(`\nRESULT: create failed for a reason the Edge Function reported above.`)
process.exit(1)

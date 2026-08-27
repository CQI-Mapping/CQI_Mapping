# CQI Monitoring System

Design and development of a data-driven CQI monitoring system for curriculum mapping and outcomes alignment. Built on a role-based web app starter (React + Vite + Supabase) with three roles — **admin**, **manager**, and **user** — each with their own navigation, pages, and permissions enforced at both the UI and the database (Row Level Security) level.

This README is a full development reference: how to set the project up, how the database and service layer work, and how to extend the system with new role-restricted features.

---

## 1. Overview

- **Frontend:** React 18 + Vite 8, TypeScript — `src/App.tsx` holds the active page in state and renders it based on the signed-in user's role.
- **Backend:** Supabase (hosted Postgres + Auth). All data goes through the service functions in `src/services/database.ts`.
- **Roles:**
  - `admin` — System Administrator / ICT Officer. Full control: manage accounts and roles, create users, manage and delete curriculum records, view the audit log.
  - `manager` — Program Head / CQI Lead. Manages curriculum records (create/edit/archive), browses the faculty directory (read-only), views the audit log.
  - `user` — Faculty / Instructor. Browses curriculum records and edits their own profile.

The UI hides pages you can't use, but the *real* enforcement is **Row Level Security (RLS)** in the database — a `user` cannot read other users or mutate curriculum records even by calling Supabase directly from the browser.

### 1.1 Roles & Actors

The system uses three application roles, each mapped to the people who actually use it:

| Role | Actors | Typical responsibilities in the system |
|---|---|---|
| `admin` | System Administrator / ICT Officer | User & role management, system configuration, full oversight, audit log review |
| `manager` | Program Head / CQI Lead / Curriculum Coordinator | Curriculum mapping, course-to-outcome (CLO/PO) alignment, CQI monitoring, publishing curriculum data |
| `user` | Faculty / Instructor / Department Staff | Viewing curriculum maps & outcomes data, submitting course-level performance inputs, updating own profile |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Build tool | Vite 8 |
| Framework | React 18 (function components + hooks) |
| Styling | Plain CSS with CSS custom properties in `src/index.css` |
| Backend / DB | Supabase (Postgres, Auth, RLS, triggers) |
| Client | `@supabase/supabase-js` |
| Scripts | `npm run dev` / `npm run build` / `npm run preview` |

No CSS framework, no router library — deliberately simple so it's easy to extend during development.

---

## 3. Role Matrix

| Capability | admin | manager | user |
|---|---|---|---|
| Sign in | yes | yes | yes |
| View own dashboard | yes | yes | yes |
| Browse curriculum records | yes | yes | yes |
| Create curriculum records | yes | yes | — |
| Edit curriculum records | yes | yes | — |
| Archive / restore curriculum records | yes | yes | — |
| Delete curriculum records | yes | — | — |
| View faculty directory (all profiles) | yes | yes | — |
| Change user roles | yes | — | — |
| Create user accounts | yes* | — | — |
| View audit log | yes | yes | — |
| View / edit own profile | yes | yes | yes |

\* Creating user accounts uses the Supabase admin API and therefore requires `VITE_SUPABASE_SERVICE_ROLE_KEY` in `.env`. Without it, the "Create user" form shows an error; role changes and everything else still work.

### 3.1 Test Accounts

Ready-made accounts for the demo (created in the Supabase project, roles set in `profiles`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@cqi.test` | `Admin@123456` |
| Manager | `manager@cqi.test` | `Manager@123456` |
| User | `user@cqi.test` | `User@123456` |

> Roles survive schema re-runs automatically — no manual SQL needed:
> 1. The schema's seed section recreates profiles for all existing auth users and assigns the demo roles by email.
> 2. The app calls the `sync_demo_role` RPC on every sign-in, restoring each demo account's expected role (or promoting the first user to admin when no admin exists).
> (Manual alternative: re-apply the roles)
> ```sql
> UPDATE public.profiles SET role='admin'   WHERE email='admin@cqi.test';
> UPDATE public.profiles SET role='manager' WHERE email='manager@cqi.test';
> UPDATE public.profiles SET role='user'    WHERE email='user@cqi.test';
> ```

---

## 4. Project Structure

```
.
├── .env                      # Local secrets (gitignored) — fill with your keys
├── .gitignore
├── GUIDE.md                  # Simple step-by-step setup guide for new users
├── index.html                # Vite entry HTML
├── package.json              # Dependencies + scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.js            # Vite config (React plugin)
├── supabase-schema.sql       # FULL database schema — run in Supabase SQL Editor
└── src/
    ├── main.tsx              # React entry point
    ├── App.tsx               # Session handling, role-based nav + page gating
    ├── index.css             # Theme variables + all component styles
    ├── vite-env.d.ts         # Vite environment variable types
    ├── components/
    │   └── Sidebar.tsx       # Nav shell (items change per role) + logout
    ├── data/
    │   └── vcqiSyllabus.ts   # Static syllabus data (vision, mission, CLO/PO mappings)
    ├── pages/
    │   ├── Login.tsx         # Sign in (login only, no create-account tab)
    │   ├── Profile.tsx       # View/edit own profile (shared by all roles)
    │   ├── admin/
    │   │   ├── Dashboard.tsx         # Admin overview: role/resources/user counts
    │   │   ├── Users.tsx             # Manage roles + create users
    │   │   ├── ChedMemoOrders.tsx    # CHED Memorandum Orders (editable)
    │   │   ├── StrategicGoals.tsx    # Strategic Goals (editable)
    │   │   ├── ProgramEducationalObjectives.tsx  # PEOs (editable)
    │   │   ├── ProgramOutcomes.tsx   # Program Outcomes (editable)
    │   │   ├── CourseLearningOutcomes.tsx  # CLOs (editable)
    │   │   ├── View.tsx              # Printable curriculum map / syllabus report
    │   │   ├── ActivityLogs.tsx      # Filterable activity log table
    │   │   └── curriculum/
    │   │       └── useEntityCrud.ts  # Shared CRUD hook for entity forms
    │   ├── manager/
    │   │   ├── Dashboard.tsx         # Manager overview + capabilities
    │   │   ├── Users.tsx             # Read-only faculty directory
    │   │   └── Curriculum.tsx        # Create/edit/archive (no delete)
    │   └── user/
    │       ├── Dashboard.tsx         # User overview + capabilities
    │       └── Curriculum.tsx        # Read-only browse
    ├── services/
    │   └── database.ts       # ALL Supabase queries used by the app
    ├── styles/
    │   └── Sidebar.css       # Sidebar-specific styles
    └── utils/
        └── supabaseClient.ts # Creates the Supabase client from env vars
```

---

## 5. Setup (Development Phase)

### Prerequisites
- Node.js 18+ and npm installed
- A Supabase project (create one free at [supabase.com](https://supabase.com))

### 1. Run the database schema
1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Paste the entire contents of `supabase-schema.sql` and run it.

> ⚠️ **Run this file only once (fresh setup).** It begins with `DROP TABLE ...` — re-running it wipes all profiles, roles, and data. After a re-run, re-apply the role UPDATEs in section 3.1.

This creates:
- `user_role` enum (`admin`, `manager`, `user`)
- `profiles`, `resources`, `activity_logs` tables
- All Row Level Security policies
- The `handle_new_user` trigger (auto-creates a profile on signup)
- The `current_user_role()` helper function
- Three seed resources

### 2. Create your first account
Go to **Dashboard > Authentication > Users** and add a user with any email/password. The trigger automatically creates their profile with the `user` role. (Alternatively, sign up directly in the app — same result.)

### 3. Promote yourself to admin
In the SQL Editor run (replace the email):

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email';
```

### 4. Configure `.env`
Copy `.env.example` values into `.env`:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — from **Settings > API** (safe to expose; Supabase RLS protects the data).
- `VITE_SUPABASE_SERVICE_ROLE_KEY` — **optional**, only for the admin "Create user" feature. It **bypasses RLS**, so keep it secret and never commit it.

### 5. Run
```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`) and sign in.

---

## 6. Database Schema Reference

### 6.1 Tables

**`profiles`** — one row per auth user, created automatically.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | references `auth.users(id)`, cascade delete |
| `email` | TEXT (unique) | |
| `full_name` | TEXT | |
| `role` | `user_role` | default `'user'`; `'admin' \| 'manager' \| 'user'` |
| `created_at` | TIMESTAMPTZ | default `now()` |
| `updated_at` | TIMESTAMPTZ | default `now()` |

**`resources`** — the generic content that admins/managers publish.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `title` | TEXT (not null) | |
| `description` | TEXT | |
| `status` | TEXT | `'active' \| 'archived'` (CHECK constraint), default `'active'` |
| `created_by` | UUID (FK) | references `profiles(id)`, set null on delete |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**`activity_logs`** — record of user actions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_email` | TEXT | who did it |
| `action` | TEXT | e.g. `auth.login`, `role.updated`, `resource.created` |
| `details` | JSONB | extra data (ids, values) |
| `created_at` | TIMESTAMPTZ | |

### 6.2 Row Level Security Policies

All three tables have RLS enabled. Policies use `public.current_user_role()` — a `SECURITY DEFINER` function that reads the caller's role while bypassing RLS. This avoids infinite-recursion when a policy references the same table it gates.

**`profiles`**

| Policy | Operation | Allowed for |
|---|---|---|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Users can insert own profile | INSERT | own row (self-heal on first sign-in) |
| Users can update own profile | UPDATE | own row |
| Managers and admins can view all profiles | SELECT | role `admin` or `manager` |
| Admins can update any profile | UPDATE | role `admin` |

**`resources`**

| Policy | Operation | Allowed for |
|---|---|---|
| Authenticated users can read resources | SELECT | any signed-in user |
| Managers and admins can create resources | INSERT | role `admin`/`manager` **and** `created_by = auth.uid()` |
| Managers and admins can update resources | UPDATE | role `admin`/`manager` |
| Admins can delete resources | DELETE | role `admin` |

**`activity_logs`**

| Policy | Operation | Allowed for |
|---|---|---|
| Authenticated users can insert audit logs | INSERT | any signed-in user |
| Admins and managers can view audit logs | SELECT | role `admin`/`manager` |

### 6.3 Functions & Triggers

- **`public.current_user_role()`** — returns the calling user's role. `SECURITY DEFINER`, so it works inside RLS policies without recursion.
- **`public.handle_new_user()`** — `AFTER INSERT` trigger on `auth.users`. Creates a `profiles` row (role defaults to `user`) on signup. On conflict it does nothing.
- **`public.record_login_event(email, success, reason)`** — `SECURITY DEFINER` function that writes an `auth.login` / `auth.login_failed` audit entry. It is callable by `anon` and `authenticated` so it works even for failed logins that have no session (RLS would otherwise block the insert).
- **`public.sync_demo_role()`** — `SECURITY DEFINER` function called by the app on every sign-in. Restores each demo account's expected role when it fell back to `user` (`admin@cqi.test` → admin, `manager@cqi.test` → manager) and promotes the first user to `admin` when the system has no admin at all. Never overrides a deliberately-changed role and never creates a second admin.

### 6.4 Seed Data

The seed section recreates `profiles` for every existing auth user, assigning the demo roles by email (`admin@cqi.test` → admin, `manager@cqi.test` → manager, all others → user). This is what makes roles survive a schema re-run.

Three sample curriculum records are inserted on setup:
- `Curriculum mapping guide` (active)
- `Outcomes alignment matrix` (active)
- `Sample archived course data` (archived — demonstrates admin-only delete)

The CQI curriculum domain is seeded with:
- Two programs: `BSIT` (Information Technology) and `BSCS` (Computer Science)
- Five courses across the two programs (e.g. `IT101 Intro to IT`, `CS201 Data Structures`)
- Eight program outcomes (PO1–PO8 per program, covering the program educational objectives)
- Nine course learning outcomes (CLO1–CLO9) distributed across the courses
- Sample `clo_po_matrix` rows with strength levels (1–3) mapping CLOs to POs of the same program

---

## 7. Service Layer Reference

All queries live in `src/services/database.ts`. Signatures, purpose, and who can call them (per RLS):

| Function | Purpose | Callable by |
|---|---|---|
| `ensureProfile(user)` | Fetch own profile; insert a fresh row (role `user`) if missing | the owner |
| `updateProfile(profileId, updates)` | Update own profile (e.g. full_name) | the owner; admins |
| `syncDemoRole()` | Restore the caller's expected role (demo accounts) or bootstrap the first admin | any signed-in user |
| `fetchAllProfiles()` | List all users | admins/managers |
| `updateUserRole(profileId, role)` | Change a user's role | admins |
| `adminCreateUser(email, password, fullName, role)` | Create an auth user via Supabase admin API | admins (needs service role key) |
| `fetchResources()` | List resources with creator name (embedded join) | all signed-in users |
| `createResource(title, description, userId)` | Insert a resource | admins/managers |
| `updateResource(id, updates)` | Edit title/description/status | admins/managers |
| `fetchPrograms()` | List all programs | all signed-in users |
| `createProgram(payload)` | Insert a program | admins/managers |
| `updateProgram(id, updates)` | Edit a program (code/name/description/status) | admins/managers |
| `deleteProgram(id)` | Permanently delete a program (cascades) | admins |
| `fetchCourses()` | List courses with embedded program | all signed-in users |
| `createCourse(payload)` | Insert a course | admins/managers |
| `updateCourse(id, updates)` | Edit a course | admins/managers |
| `deleteCourse(id)` | Permanently delete a course (cascades to CLOs) | admins |
| `seedIt21Course()` | Seed the IT21 course data | admins |
| `fetchProgramOutcomes(programId)` | List program outcomes, optionally by program | all signed-in users |
| `createProgramOutcome(payload)` | Insert a program outcome | admins/managers |
| `updateProgramOutcome(id, updates)` | Edit a program outcome | admins/managers |
| `deleteProgramOutcome(id)` | Permanently delete a program outcome | admins |
| `fetchCourseLearningOutcomes(courseId)` | List course learning outcomes, optionally by course | all signed-in users |
| `createCourseLearningOutcome(payload)` | Insert a course learning outcome | admins/managers |
| `updateCourseLearningOutcome(id, updates)` | Edit a course learning outcome | admins/managers |
| `deleteCourseLearningOutcome(id)` | Permanently delete a course learning outcome | admins |
| `fetchCloPoMatrix(courseId)` | List CLO/PO matrix rows, optionally by course | all signed-in users |
| `upsertCloPoMapping(cloId, poId, level)` | Insert or update a CLO/PO strength cell (1–3) | admins/managers |
| `deleteCloPoMapping(cloId, poId)` | Remove a CLO/PO mapping | admins |
| `fetchStrategicGoals()` | List strategic goals | all signed-in users |
| `createStrategicGoal(payload)` | Insert a strategic goal | admins/managers |
| `updateStrategicGoal(id, updates)` | Edit a strategic goal | admins/managers |
| `deleteStrategicGoal(id)` | Permanently delete a strategic goal | admins |
| `fetchProgramEducationalObjectives()` | List PEOs | all signed-in users |
| `createProgramEducationalObjective(payload)` | Insert a PEO | admins/managers |
| `updateProgramEducationalObjective(id, updates)` | Edit a PEO | admins/managers |
| `deleteProgramEducationalObjective(id)` | Permanently delete a PEO | admins |
| `fetchProgramOutcomesStandalone()` | List standalone program outcomes (for View page) | all signed-in users |
| `createProgramOutcomeStandalone(payload)` | Insert a standalone PO | admins/managers |
| `updateProgramOutcomeStandalone(id, updates)` | Edit a standalone PO | admins/managers |
| `deleteProgramOutcomeStandalone(id)` | Permanently delete a standalone PO | admins |
| `fetchCourseLearningOutcomesStandalone()` | List standalone CLOs (for View page) | all signed-in users |
| `createCourseLearningOutcomeStandalone(payload)` | Insert a standalone CLO | admins/managers |
| `updateCourseLearningOutcomeStandalone(id, updates)` | Edit a standalone CLO | admins/managers |
| `deleteCourseLearningOutcomeStandalone(id)` | Permanently delete a standalone CLO | admins |
| `fetchChedMemoOrders()` | List CHED memorandum orders | all signed-in users |
| `createChedMemoOrder(payload)` | Insert a CHED memo order | admins/managers |
| `updateChedMemoOrder(id, updates)` | Edit a CHED memo order | admins/managers |
| `deleteChedMemoOrder(id)` | Permanently delete a CHED memo order | admins |
| `fetchActivityLogs()` | Latest 100 audit entries | admins/managers |
| `recordLoginEvent(email, success, reason?)` | Record a sign-in attempt via RPC | any caller (RPC) |
| `addActivityLog(userEmail, action, details)` | Insert an audit entry | any signed-in user |

> Note: `addActivityLog` is called from the client. A determined user could write to the audit log directly, so treat it as an activity log, not a tamper-proof security record. Login attempts use `record_login_event` — a `SECURITY DEFINER` function — precisely so failed logins (which have no session) can be recorded. For tamper-proof auditing of every action, move all inserts server-side.

---

## 8. Page-by-Page Guide

### `Login.tsx`
- Sign in with email/password (`supabase.auth.signInWithPassword`).
- Empty-field validation: submitting with a blank email or password shows "Email and password are required." without hitting the API.
- Failed sign-ins show a generic "Invalid email or password." (never leaks Supabase's raw error, e.g. rate limits or account state).
- Every attempt is written to `activity_logs` via the `record_login_event` RPC (`auth.login` on success, `auth.login_failed` on failure).

### `admin/Dashboard.tsx`
- Reads the `profile` prop. Shows stat cards: your role, total resources, and total users. Counts use `head: true` queries.
- Lists what the admin role can do.

### `manager/Dashboard.tsx` and `user/Dashboard.tsx`
- Same overview pattern for the manager and user roles, with their own stat cards and capability lists.

### `admin/Users.tsx`
- Full account management: table of all users with an inline role `<select>` (calls `updateUserRole`, then writes an audit entry) plus a "Create user" form (calls `adminCreateUser`).

### `admin/ChedMemoOrders.tsx`
- Manage CHED Memorandum Orders: create, edit, archive, and delete records.

### `admin/StrategicGoals.tsx`
- Manage Strategic Goals: create, edit, archive, and delete records.

### `admin/ProgramEducationalObjectives.tsx`
- Manage Program Educational Objectives (PEOs): create, edit, archive, and delete records.

### `admin/ProgramOutcomes.tsx`
- Manage Program Outcomes: create, edit, archive, and delete records.

### `admin/CourseLearningOutcomes.tsx`
- Manage Course Learning Outcomes (CLOs): create, edit, archive, and delete records.

### `admin/View.tsx`
- Printable curriculum map / syllabus report. Displays Vision, Mission, Strategic Goals, PEOs, Program Outcomes, Curriculum Mapping, Course Learning Outcomes, and Course Details in a formatted document layout.
- Supports inline editing and archiving of Strategic Goals, PEOs, and Program Outcomes via an Edit toggle.
- Static syllabus content (vision/mission wording, curriculum mapping, course details) comes from `src/data/vcqiSyllabus.ts`.

### `manager/Users.tsx`
- Read-only faculty directory showing role badges. Role changes are admin-only.

### `manager/Curriculum.tsx`
- Props: `userEmail`. Same as admin but without the Delete button.

### `user/Curriculum.tsx`
- Read-only browse of published curriculum records.

### `ActivityLogs.tsx` (admin and manager)
- Fetches the latest 100 entries. Columns: when, user, action, details.

### `Profile.tsx`
- Props: `profile`, `onSaved`. Edits `full_name`, writes an audit entry, and reports the updated profile back to `App.tsx` via `onSaved`. Shared by all roles.

### `App.tsx`
- Holds `session`, `profile`, `activePage`. Defines the `NAV` map (role → nav items) and the `PAGES` map (role → page components, one per role folder; `Profile` is shared). On session change, loads the profile via `ensureProfile` (auto-creates the row if missing — e.g. after a schema re-run) and renders `Login` when signed out; otherwise renders the Sidebar + topbar + current page.
- **Gating:** `page` is coerced to a role-valid page, so even a crafted `activePage` value can't show an unauthorized page.
- **Login guard:** A `profileLoaded` flag prevents rendering the dashboard before the user's role is known, so the correct role-specific page appears immediately without a flash.

### `Sidebar.tsx`
- Renders `navItems` (passed from App, role-specific), the current role, and a logout button.

---

## 9. How to Extend the System

New role-restricted feature, end to end. Example: a `reports` table that admins create and everyone can read.

1. **Schema** — add the table to `supabase-schema.sql` (and run the DDL in the SQL Editor for your dev DB):
   ```sql
   CREATE TABLE public.reports (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       title TEXT NOT NULL,
       created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
   ```

2. **RLS policies** — gate reads and writes:
   ```sql
   CREATE POLICY "Everyone can read reports" ON public.reports FOR SELECT
       USING (auth.role() = 'authenticated');
   CREATE POLICY "Admins can create reports" ON public.reports FOR INSERT
       WITH CHECK (public.current_user_role() = 'admin' AND created_by = auth.uid());
   ```

3. **Service functions** — add `fetchReports()` and `createReport()` to `src/services/database.js` following the existing pattern (try/catch, return `[]`/`null` on error).

4. **Page** — create the page in the folder of the role(s) that should see it, e.g. `src/pages/manager/Reports.tsx` modeled on `src/pages/manager/Curriculum.tsx`.

5. **Nav + gating** — add `{ id: 'reports', label: 'Reports' }` to the role entries you want in `NAV` inside `App.tsx`, and add the matching entry to the `PAGES` map.

6. **Style** — reuse classes from `src/index.css` or add new ones.

7. **Test** — sign in as each role and confirm only the intended users can read/write (try it from the browser console too — RLS must block what buttons don't).

---

## 10. Security Notes

- **RLS is the real gate.** Hiding buttons/nav is UX only. Every policy is enforced by Postgres, so a user can't bypass the UI.
- **`current_user_role()`** is `SECURITY DEFINER` — it intentionally bypasses RLS to read roles. Keep its `search_path` pinned to `public`.
- **Service role key** bypasses RLS entirely. Never commit it, never expose it to the frontend in production (it lives in `.env` and is bundled by Vite — fine for development only).
- **`.env` is gitignored** — commit `.env.example`, not `.env`.
- **Audit log** is client-inserted; treat it as an activity trail, not a tamper-proof record.
- **Never promote via email-derived rules.** In this starter, role is assigned explicitly (admin updates it). Do not derive access from email domains or department fields — that is fragile and error-prone (see the instructor-ui repo discussion).
- **Password policy** — Supabase defaults apply; `adminCreateUser` uses `email_confirm: true` so created users can sign in immediately (development convenience).

---

## 11. Troubleshooting

| Problem | Cause / Fix |
|---|---|
| `npm install` fails with `ERESOLVE` (peer vite@... from @vitejs/plugin-react) | `@vitejs/plugin-react@4` only supports Vite 4–7, but the project uses Vite 8. Fix: upgrade the plugin — change `"@vitejs/plugin-react": "^6.0.5"` in `package.json` — then `npm install` again. |
| Re-running `supabase-schema.sql` seems to "reset" everything | The file starts with `DROP TABLE ... profiles` — it wipes profiles, resources, activity_logs, **and all roles** each run. Don't re-run it casually; if you do, re-apply the role UPDATEs from section 3.1 (or the app self-heals missing profiles as role `user`). |
| Logged in but shown as `user` (no admin powers) | The profile's `role` column is `user` in the DB. Promote it (section 3.1 SQL) — the role lives in `profiles`, not in the email. |
| Logged in but stuck on Login or empty dashboard | Profile missing. `ensureProfile` now auto-creates a profile row on sign-in, so this self-heals; if it persists, check the profile INSERT policy exists. |
| `42501` / "permission denied for table" | RLS blocking. Check the role of the signed-in user (`SELECT role FROM profiles WHERE id = auth.uid()`) and confirm the matching policy exists. |
| "Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env to create users" | The "Create user" admin feature needs the service role key. Either add it (dev) or accept the feature is disabled. |
| Resource creator shows "Unknown" | The embedded `created_by ( full_name )` join returns null when RLS hides that profile row (a `user` viewing another user's resource). Expected behavior. |
| Login shows "Invalid email or password." | Generic error by design (hides whether the email exists). Double-check the exact email/password and case; if correct, confirm the account exists under Authentication → Users. |
| Changes to `supabase-schema.sql` have no effect | The SQL file is only the source of truth — you must re-run it (or the relevant DDL) in the Supabase SQL Editor. |
| Port already in use on `npm run dev` | Vite picks another port automatically, or kill the process holding the port. |
| Stale data after edits | Data is fetched on page load; navigate away and back (or refresh). No realtime subscriptions are set up. |

---

## 12. Scripts

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Production build (output in `dist/`) |
| `npm run preview` | Serve the production build locally |

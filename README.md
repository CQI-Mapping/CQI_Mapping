
Design and development of a data-driven CQI monitoring system for curriculum mapping and outcomes alignment. Built on a role-based web app starter (React + Vite + Supabase) with three roles — **admin**, **manager**, and **user** — each with their own navigation, pages, and permissions enforced at both the UI and the database (Row Level Security) level.

This README is a full development reference: how to set the project up, how the database and service layer work, and how to extend the system with new role-restricted features.

---

## 1. Overview

- **Frontend:** React 18 + Vite 8, TypeScript — `src/App.tsx` holds the active page in state and renders it based on the signed-in user's role.
- **Backend:** Supabase (hosted Postgres + Auth). All data goes through the service functions in `src/services/database.ts`.
- **Roles:**
  - `admin` — System Administrator / ICT Officer. Full control: manage accounts and roles, create users, manage and delete curriculum records, view the audit log.
  - `manager` — Program Head / CQI Lead. Manages curriculum records (create/edit/archive), browses the faculty directory (read-only), views the audit log.
  - `user` — Faculty / Instructor. Edits course learning outcomes, builds Table of Specifications (Generate TOS), generates program reports, browses the subject graph, edits own profile.

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
| Tests | Vitest 2 — 335 unit tests (`npm test`) |
| Styling | Plain CSS with CSS custom properties in `src/index.css` |
| Graph | d3 7 — Subject Graph (`admin/Map.tsx`) |
| Documents | ExcelJS (TOS workbooks), `docx` (Word syllabus exports), `jspdf` + `html2canvas` (report PDFs), `xlsx` (report workbooks) |
| Backend / DB | Supabase (Postgres, Auth, RLS, triggers) |
| Client | `@supabase/supabase-js` |
| Scripts | `npm run dev` / `npm run test` / `npm run build` / `npm run preview` |

No CSS framework, no router library — deliberately simple so it's easy to extend during development.

---

## 3. Role Matrix

| Capability | admin | manager | user |
|---|---|---|---|
| Sign in | yes | yes | yes |
| View own dashboard | yes | yes | yes |
| Browse curriculum records | yes | yes | — |
| Create curriculum records | yes | yes | — |
| Edit curriculum records | yes | yes | — |
| Archive / restore curriculum records | yes | yes | — |
| Delete curriculum records | yes | — | — |
| Manage courses (create/edit/archive, no delete for manager) | yes | yes | — |
| Browse subjects + CLOs | yes | yes | yes |
| View Subject Graph | yes | yes | yes |
| View users directory (all profiles) | yes | yes | — |
| Add / remove users (`user` role only) | — | yes | — |
| Change user roles | yes† | — | — |
| Create user accounts (any role) | yes* | — | — |
| View audit log | yes | yes | — |
| View / edit own profile | yes | yes | yes |

\* Creating user accounts uses the Supabase admin API and therefore requires `VITE_SUPABASE_SERVICE_ROLE_KEY` in `.env`. Without it, the "Create user" form shows an error; everything else still works.
† `updateUserRole()` exists in `src/services/database.ts` but no UI calls it yet — role changes are done via SQL (`UPDATE public.profiles SET role=...`) or the service function from console.

### 3.1 Test Accounts

Ready-made accounts for the demo (created in the Supabase project, roles set in `profiles`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@cqi.test` | `Admin@123456` |
| Manager | `manager@cqi.test` | `Manager@123456` |
| User | `user@cqi.test` | `User@123456` |

> These are database-side demo accounts for the demo; the login card no longer displays them on screen — the card ends at the Login button.

> Roles survive schema re-runs automatically — no manual SQL needed:
> 1. The schema's seed section recreates profiles for all existing auth users and assigns the demo roles by email.
> 2. The app calls the `sync_demo_role` RPC on every sign-in, restoring each demo account's expected role (the admin bootstrap runs only for the `admin@cqi.test` fixture; every other account lands as `user` and is promoted by an existing admin).
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
    │   ├── Sidebar.tsx               # Dark-glass top navbar, per-role nav + mega dropdown + profile menu
    │   ├── ErrorBoundary.tsx         # App-root crash guard: readable fallback page + stack in <details>
    │   ├── icons.tsx                 # The `Icon` set (name → svg) used across pages
    │   ├── ConfirmDialog.tsx         # Accessible destructive-action confirm (Profile & Security uses it)
    │   ├── PageBanner.tsx            # Screen-only banner strip for TOS / View / Map
    │   ├── TosSheetGrid.tsx          # The on-screen workbook grid (green inputs / gray formulas)
    │   ├── TosBlueprintEditor.tsx    # Inline blueprint editor inside a library card
    │   ├── SyllabusReport.tsx        # Document renderer shared by View / reports / Word export
    │   ├── ProgramOutcomeReport.tsx  # PO alignment + CMO sections of the reports
    │   ├── ProgramEducationalObjectiveReport.tsx  # PEO / Strategic Goals sections
    │   ├── CloViewModal.tsx          # Read-only CLO viewer modal (shared)
    │   ├── CourseDetails.tsx / OutcomeDetailsCard.tsx / PoCoverageBars.tsx
    │   ├── SuggestionInput.tsx       # PO-suggestion combobox on the CLO page
    │   └── ViewModeToggle.tsx        # List/grid toggle, as on Curriculum pages
    ├── pages/
    │   ├── Login.tsx         # Sign in (email/password + school-scoped Google) — password recovery is admin-initiated
    │   ├── Profile.tsx       # View/edit own profile (shared by all roles)
    │   ├── SecurityPrivacy.tsx  # Password change, sessions, audit trail, privacy controls
    │   ├── ResetPassword.tsx    # Set-a-new-password screen (recovery-link sessions) + success card
    │   ├── ResetLinkExpired.tsx # Expired/used recovery link — screen 5 of the reset redesign
    │   ├── shared/
    │   │   └── Reports.tsx   # Generate Map (all roles): mapping summary, PO coverage, exports
    │   ├── admin/
    │   │   ├── Dashboard.tsx         # Admin overview + banner strip + quick actions
    │   │   ├── Users.tsx             # Manage roles + create users (role select: admin/manager/faculty)
    │   │   ├── Program.tsx           # Programs CRUD
    │   │   ├── ChedMemoOrders.tsx    # CHED Memorandum Orders (via shared EntityCrudPage)
    │   │   ├── StrategicGoals.tsx    # Strategic Goals (via shared EntityCrudPage)
    │   │   ├── ProgramEducationalObjectives.tsx  # PEOs (via shared EntityCrudPage)
    │   │   ├── ProgramOutcomesAdmin.tsx  # Program Outcomes (via shared EntityCrudPage)
    │   │   ├── CourseLearningOutcomes.tsx  # CLOs (bespoke page: stats + search + tabs)
    │   │   ├── Map.tsx               # d3 Subject Graph, green-monochrome theme (all roles share it)
    │   │   ├── Syllabus.tsx          # Printable curriculum map / syllabus report
    │   │   ├── ActivityLogs.tsx      # Filterable activity log table (shared with manager)
    │   │   ├── ActivityLabels.ts     # Action string → human-readable label
    │   │   └── curriculum/
    │   │       ├── EntityCrudPage.tsx  # Shared CRUD UI (PO/PEO/SG/CHED) — search, tabs, skeleton, `allowDelete`
    │   │       └── useEntityCrud.ts  # Shared CRUD hook for entity forms
    │   ├── manager/
    │   │   ├── Dashboard.tsx         # Manager overview + banner strip + quick actions
    │   │   ├── Users.tsx             # Users directory + add/remove users (`user` role only)
    │   │   ├── Curriculum.tsx        # Create/edit/archive (no delete) + search
    │   │   ├── ProgramOutcomes.tsx   # Manager-side PO alignment; inline add form with a reader leg (all POs, grouped per CMO category)
    │   │   └── Course.tsx            # Wraps AdminCourse with `hideDelete`-style gating (no delete)
    │   └── user/
    │       ├── Dashboard.tsx         # Faculty home: next step, own-outcome figures, subjects, quick actions, program brief
    │       ├── CourseLearningOutcomes.tsx  # Faculty CLO editor (same bespoke page)
    │       └── TOS.tsx               # Generate TOS: blueprint editor + saved-blueprint library
    ├── services/
    │   └── database.ts       # ALL Supabase queries used by the app
    ├── styles/
    │   ├── Sidebar.css       # Top navbar styles (dark glass theme)
    │   └── Login.css         # Login page: circuit background + green glass card
    └── utils/
        ├── supabaseClient.ts # Creates the Supabase client from env vars
        ├── tosMath.ts        # TOS validation/weighting math (+ tests)
        ├── tosXlsx.ts        # ExcelJS export of a TOS paper, styled like the workbook
        ├── tosOptions.ts     # Program/course/term pickers data
        ├── report.ts         # Report model + letterhead constants (vision/mission wording)
        ├── syllabusDocx.ts   # Word (.docx) export of the syllabus docs
        └── alignment.ts / poMatch.ts / poRank.ts / poSemantic.ts / cloPoMapping.ts / facultyDashboard.ts / download.ts 
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

### 6. (Optional) Enable Google sign-in

"Continue with Google" appears on the sign-in page once the provider is configured. Until then the button shows a "not set up yet" message — nothing breaks. The only difference from the demo project's hand-rolled flow (google_callback.php-style): Supabase's callback endpoint does the token exchange/verification server-side; three console steps here replace that code entirely.

1. **Google Cloud Console** → create an *OAuth client (Web)*. Add the authorized redirect URI exactly:
   `https://<project-ref>.supabase.co/auth/v1/callback` (find `<project-ref>` in **Settings > API**).
2. **Supabase Dashboard → Authentication → Providers → Google**: enable it, paste the client **ID** and **secret**.
3. **Supabase Dashboard → Authentication → Sign In / Up → Allowed email domains**: `nbsc.edu.ph`.

   This step is the server-side version of the school-accounts-only rule: it enforces *back at the auth layer*, not just in the UI, that only official `@nbsc.edu.ph` Google accounts can sign in. Because it lives in a dashboard setting rather than a repo file, document it per project. The repo carries the other layers of the same door: the closed-registration gate in `handle_new_user` (migration `017-closed-google-registration.sql`) refuses *any* Google identity the admin or manager never registered — no auth row, no profile, no session — and `App.tsx` re-checks the email once a session lands, signing out anything not `@nbsc.edu.ph` with a notice on the Login screen.

4. **Supabase Dashboard → Authentication → Sign In / Up → Allow new users to sign up**: OFF. With this toggle, a stranger can only ever match an account the admin or manager already created; the closed-registration trigger backs the same rule up in code.

On Google sign-in only **registered** addresses complete the flow: registration always creates the auth user (and, via `handle_new_user`, its profile row) at Add-user time, so a registered person signing in with Google simply matches their existing row and lands signed in — no new account is ever auto-created. Self-created Google identities raise inside the transaction and bounce back with the sign-in error *"Google sign-in works only for registered accounts. Ask the admin or manager to register you first."* Every completed Google sign-in writes the same `auth.login` audit row the password path writes.

### 7. Align the password minimum to 8 (auth config)

Every password form in this app requires **8 characters** (`src/utils/passwordPolicy.ts`), but a fresh Supabase project still accepts **6** server-side — so a 7-character password sent by anything other than our forms (a direct API call) would slip through the policy split. Close it in the dashboard:

**Supabase Dashboard → Authentication → Policies → "Minimum password length" → `8`** (in older dashboard layouts this lives under **Settings → Authentication / Providers**, as "Minimum password length").

It is a project setting, not a schema file, so per database it's a one-time toggle. Already-set accounts aren't affected — only new/changed passwords are checked.

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
| `user_email` | TEXT | who did it — stamped server-side, never supplied by the client |
| `action` | TEXT | e.g. `auth.login`, `role.updated`, `resource.created` |
| `details` | JSONB | optional context: `{entity, entity_id, label, reason}` |
| `created_at` | TIMESTAMPTZ | |

Indexes on `created_at DESC` and `action`, since the log is always read
newest-first and filtered by action/date.

`details` is what makes an entry an audit trail rather than a click counter —
without it every row reads `user / resource.updated` and there is no way to
tell which record changed. It is deliberately **not** where the actor lives:
`user_email` is stamped from the caller's JWT by `log_activity`, so a client
can never attribute an action to someone else. `label` is snapshotted at write
time, so renaming a record later does not rewrite history.

**`tos_exams` / `tos_sheets` / `tos_topics`** — the Generate TOS blueprints (faculty-owned).

| Table | Key columns | Notes |
|---|---|---|
| `tos_exams` | `user_id`, `code`, `title`, `exam_type`, `term`, `total_hours`, `status` | one blueprint header; `UNIQUE (exam_id, kind)` lives on sheets |
| `tos_sheets` | `exam_id` (CASCADE), `kind` (`items` \| `points`), `label`, `total`, `position` | the two papers of an exam |
| `tos_topics` | `sheet_id` (CASCADE), `position`, `title`, `slo`, `hours`, `bloom` (JSONB) | rows of a paper; `bloom` holds the six Bloom counts |

Both child tables cascade on exam delete, so removing a blueprint from the
library removes its papers and topics in one statement.

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
- **`public.record_login_event(email, success, reason)`** — `SECURITY DEFINER` function that writes an `auth.login` / `auth.login_failed` audit entry, keeping `reason` in `details.reason` on failure. It is callable by `anon` and `authenticated` so it works even for failed logins that have no session (RLS would otherwise block the insert).
- **`public.log_activity(action, details)`** — `SECURITY DEFINER` function behind the `addActivityLog` client helper. Stamps `user_email` from the caller's JWT, so the client cannot attribute an action to another user. `details` defaults to NULL; an empty object is normalised to NULL so the UI has one falsy case for "no context".
- **`public.sync_demo_role()`** — `SECURITY DEFINER` function called by the app on every sign-in. Restores each demo account's expected role when it fell back to `user` (`admin@cqi.test` → admin, `manager@cqi.test` → manager). The admin bootstrap is demo-emails-only — every other email, school or otherwise, lands as `user` and stays there until an existing admin promotes it, so the first stranger to sign in can never take the admin chair. Never overrides a deliberately-changed role and never creates a second admin. (Migration `016-strangers-never-admin.sql`.)

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
| `updateUserStatus(profileId, status)` | Archive/restore an account (soft delete) | admins; managers (faculty rows only — migration 012) |
| `adminResendInvite(userId)` | Re-email a fresh one-time sign-in link via the `admin-users` Edge Function | admins/managers (managers can only re-invite faculty) |
| `adminCreateUser(email, password?, fullName?, role)` | Create an auth user via the `admin-users` Edge Function; with no password one is generated and a one-time set-password link is emailed to the user | admins/managers (managers can only create faculty) |
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
| `fetchTosExams(status?)` | List the signed-in user's TOS blueprints (default: active) | the owner (RLS) |
| `createTosExam(payload, userId)` / `deleteTosExam(id)` | Create / permanently delete a blueprint header | the owner |
| `updateTosExam(id, updates)` | Edit code/title/term/status/total_hours | the owner |
| `createTosSheet(payload)` / `updateTosSheet(id, updates)` | Create the papers; edit `total`/`label`/`note` | the owner |
| `fetchTosSheets(examId)` / `fetchTosSheetsByExam(ids)` | List a paper set (one exam, or one query for many) | the owner |
| `fetchTosTopics(sheetId)` / `replaceTosTopics(sheetId, topics)` | Read a paper's rows; write the full row set back | the owner |
| `fetchActivityLogs()` | Latest 100 audit entries | admins/managers |
| `recordLoginEvent(email, success, reason?)` | Record a sign-in attempt via RPC | any caller (RPC) |
| `addActivityLog(action, details?)` | Insert an audit entry via RPC | any signed-in user |

> Note: `addActivityLog` passes only the action and an optional details blob —
> never the actor. The `log_activity` RPC is `SECURITY DEFINER` and stamps
> `user_email` from the caller's JWT, so entries cannot be forged against
> another user. Two caveats remain: a client can still *invent* actions (it
> chooses the action string), and `record_login_event` takes the email from the
> client and is callable by `anon`, so unauthenticated callers can write
> arbitrary `auth.login_failed` rows. Treat this as an activity log, not a
> tamper-proof security record; closing both gaps means moving writes
> server-side.

---

## 8. Page-by-Page Guide

### `Login.tsx`
- Sign in with email/password (`supabase.auth.signInWithPassword`).
- The NBSC brand plate (`src/assets/login-bg.jpg`, circuit artwork) is the page background **and** the app-wide `body` wallpaper; a thin veil keeps its stripes visible.
- Dark-green glass card tuned to the artwork's own center tones: "Welcome Back!" header, "Log in to your account" subtitle, sr-only labels, person/password icons, show/hide toggle, gradient **Login →** button. No divider/links row and no test-accounts strip — the card ends at the button, with the © NBSC footer below.
- Error has `role="alert"`, clears on typing; submit shows spinner + `aria-busy`.
- Empty-field validation: submitting with a blank email or password shows "Email and password are required." without hitting the API.
- Failed sign-ins show a generic "Invalid email or password." (never leaks Supabase's raw error, e.g. rate limits or account state).
- Every attempt is written to `activity_logs` via the `record_login_event` RPC (`auth.login` on success, `auth.login_failed` on failure), with the failure reason (`invalid_credentials` / `service_unreachable`) kept in `details.reason`.
- Respects `prefers-reduced-motion`; mobile padding at 360px.

### `ResetPassword.tsx` & `ResetLinkExpired.tsx`
The rest of the password-reset journey (mockup: `design/profile-reset-redesign.html`, screens 3–5):
- `ResetPassword` is the **set-a-new-password screen**: a `PASSWORD_RECOVERY` auth event swaps the whole app shell for it (App.tsx), and it writes the same `profile.password_changed` audit row the retired profile card used to write. Its submit endures an audit-write failure (logged, never thrown) so a completed change can't lie about itself.
- On success the flow ends with the **"Password updated" card** (animated check, `login-check`) and a 5-second countdown; the recovery session — which was only ever valid for choosing a new password — is signed out, so the sign-in that follows genuinely comes from the fresh password. The countdown and the button both land on the sign-in page (`onDone`).
- An **expired or already-used link** never reaches that page: Supabase's verify endpoint bounces it back to the app with `error_description="Email link is invalid or has expired"`, App reads it once (`src/utils/oauthErrors.ts`), scrubs the URL, and renders **`ResetLinkExpired`** — "nothing was changed, your current password still works", with the fix named honestly: an administrator sends a fresh recovery email or resends the invite.
- **Self-service password reset is not on the sign-in page by design** (removed from Login with the admin's consent): accounts exist only because an administrator put them there, so recovery is administrator-initiated too — from the Supabase dashboard (**Authentication → Users → the account's row → send password-recovery email**). A recovery email triggered there still lands in this app exactly as before: `ResetPassword` swaps in and the person chooses their new password. The invite-failure messages on the Users pages point at "Resend invite"/the dashboard, never a control that doesn't exist.
- Other auth bounces (OAuth cancellations, sign-ups-disabled refusals) arrive at Login as a pre-remixed one-line notice via the same module — expiry is matched **before** `access_denied` because a dead recovery link packs both markers, and sign-up-disabled before cancellation for the same reason. Covered by `oauthErrors.test.ts`.

### `admin/Dashboard.tsx`
- Banner strip with the composed campus-entrance artwork (`banner-bg.jpg`) + greeting; skeleton stat cards with per-item error fallback (`0`, never stuck), `aria-busy` grid.
- Stats: Users, Strategic Goals, PEOs, Program Outcomes, CLOs, CHED Memo Orders.
- Quick actions: Add Program, Map CLO → PO, Review Outcomes, Activity Logs. Recent activity (latest 5, `toLocaleString`).

### `manager/Dashboard.tsx`
- Same banner + skeleton pattern. The manager page is deliberately slim — no role-badge line, no "what you can do" panel.
- Manager: stats (Curriculum, Programs, Courses, POs, CLOs, Faculty) + Course quick-action.

### `user/Dashboard.tsx` (the faculty home)
- Opens on a **next-step** card. `utils/facultyDashboard.ts` (`planNextStep`) picks the first subject in curriculum order that holds no *active* outcome from the faculty member: "Start with …" before any active outcome exists, "Next up: …" while subjects still lack one, and "Every subject is covered" once none do. Its button opens Course Outcomes.
- Four figures from the faculty member's own outcomes (`ownFigures`): outcomes written (active and archived), subjects covered out of all subjects in the system, outcomes changed in the last 7 days, and the time since the last edit. An archived outcome does not cover its subject.
- "Your subjects" lists the subjects they have written for, most recently edited first, five at a time (`groupOutcomesBySubject`). Spellings of one code group together ("it 10" and "IT10"), and each row shows its archived count. A row opens that subject's latest outcome in the shared CLO modal.
- Quick actions: Course Outcomes, Generate Map, Generate TOS, My Profile.
- "Program at a glance" closes the page with `MapBrief` and its `MapPreview` curriculum map, the same blocks the admin and manager dashboards embed.
- Styles are the `fac-*` classes in `index.css`. `MapBrief`'s panel tokens (`--reports-gap`, `--reports-radius`, `--reports-band`) are defined only under `.reports`, so `.fac-dash` sets them itself. The admin and manager dashboards do not, so their brief panels lose the gap and corner radius; defining the tokens on `.map-brief` would fix all three dashboards at once.
- CLO stats are role-scoped: RLS lets managers/admins read every outcome, while a faculty user counts only their own (migration `009-private-clos.sql`). The faculty figures depend on that scope.

> **Theme note (2026 look):** the app sits on the same dark circuit wallpaper everywhere. Dashboards keep the entrance-art banner; every content page's banner strip uses the open-book artwork (`banner-bg-page.jpg`); page banners, panels, table headers and hairlines are sage-tinted so the light content sits comfortably against the dark background. Both banners carry a deep drop shadow + faint green rim so they lift off the wallpaper.

### `admin/Users.tsx`
- Create accounts with role select (**admin**, **manager**, or **faculty**) plus table of all users with role badges. Needs `VITE_SUPABASE_SERVICE_ROLE_KEY`. No role `<select>` on existing rows — role changes via SQL or `updateUserRole()`.
- **Edit** per row opens a modal fixing another account's Full name + Nickname — the same display-name fields that user's Profile page shows (same 80/40 caps, empty nickname clears it). Saves through `updateProfile()` (RLS already lets admins update any profile row) and logs `user.profile_updated`.
- Password Show/Hide uses light-form `.password-wrapper` override (dark text on white).

### `admin/Course.tsx` and `manager/Course.tsx`
- Admin Course: programs + curriculums + courses with prereq/coreq, lecture/lab credits, search, Active/Archive tabs, stats, skeleton cards. Delete renders **only on archived cards**.
- Optional `hideDelete` prop hides Delete entirely; `manager/Course.tsx` wraps it with `hideDelete` (create/edit/archive/restore, no delete).

### Entity pages (`ProgramOutcomes`, `ProgramEducationalObjectives`, `StrategicGoals`, `ChedMemoOrders` via `curriculum/EntityCrudPage.tsx`)
- Shared UI: stats, search (`program-search`), Active/Archive tabs with counts, skeleton cards, unified empty states (`No ... yet`), `role=alert/status` messages, flat green top-border.
- `allowDelete` prop gates the Delete button (archived only), enabling future manager reuse.
- **Reference data (one-time cleanup, not a seed):** `supabase/migrations/010-official-program-outcomes.sql` repairs the manager's Program Outcomes input — it archives the drifted rows and inserts the official CMO 25 S. 2015 list (PO-1…PO-4 + SD-1…SD-13) verbatim as `manager`-sourced rows with the category header in `description` (that's what the Curriculum Mapping matrix reads). The list itself is never seeded by the app: everything reads live from `admin_program_outcomes`, so the manager's page edits flow straight through. Re-running is safe; `utils/report.ts`'s `outcomeCodeKey` sorts the two families correctly everywhere.

### `admin/CourseLearningOutcomes.tsx`
- Bespoke page (not shared): course-scoped CLOs + PO suggestion mapping, stats + search + tabs + skeleton + unified empty states. Also mounted on the faculty route.

#### Closest-PO suggestion engine (premium accuracy)
- **Hybrid fusion** (`utils/poRank.ts`): keyword overlap + semantic cosine + exact-code/phrase bonus + Bloom-verb family + per-browser click memory (`poMemory.ts`, localStorage only) + a stage-2 **per-field rerank** (finalists re-scored against title/description/extra separately; can only raise a score).
- **Expanded lexicon** (`utils/poMatch.ts`): ~40 curriculum synonym groups covering the CMO 25 s. 2015 vocabulary, with a trailing-e stem fold so "create/creating", "integrate/integrated", "recognize/recognized" all meet on one token.
- **Premium model** (`utils/poSemantic.ts`): `Xenova/all-mpnet-base-v2` (110M params, 768-dim) via `@huggingface/transformers` v4 — WebGPU where available, WASM fallback. Free, local, no API keys. Weights (~110 MB) download once, cached by the browser; the strip shows "Enhancing accuracy — loading AI model… %" while that happens, and the page preloads the model in the background. If it can't load (offline / blocked CDN), a silent fallback to the keyword matcher keeps the strip working — never blank.
- **Pinned accuracy** (`utils/poOfficial.ts` + `poOfficial.test.ts`): 61-case fixture on the official CMO list (exact + paraphrase + faculty-style drafts, with honest alternates for the CMO's own near-duplicate pair PO-1/SD-3). Measured 2026-10-28: **top-1 100%, top-3 100%**; tests pin top-1 ≥ 90% / top-3 ≥ 95% so future edits can't silently regress. The displayed % is relative (top pick = 100%); the raw score behind gates/auto-fill is in the tooltip.
- Calibration note: `SEM_GATE = 35` gates semantic-only candidates — measured on the official corpus: exact drafts land 58–87, true paraphrases 44–85, gibberish noise ≤ 19, so the gate sits between noise and the weakest useful paraphrase. Exact-phrase (`+15`) and Bloom (`+5`) bonuses are unchanged from the original calibration.

### `user/TOS.tsx` (Generate TOS, faculty)
- A spreadsheet-style blueprint editor backed by `tos_exams` / `tos_sheets` / `tos_topics`: you type in the green cells, the hour-weighted "Number of Items/Points" column, header percentages and column totals recompute live (`utils/tosMath.ts`).
- Every edit autosaves on a 600 ms debounce; the **Save pending** button flushes all sheets immediately, **Discard** reloads from the database.
- The library panel lists every saved blueprint with Edit (inline full editor), Open, Archive/Restore, and **Delete** (red trash, confirms, cascades papers + topics, writes `tos_exam.deleted` to the audit log). Deleting the blueprint that is open in the editor stands down its pending writers first and parks the editor on the next exam.
- **Export** builds the faculty workbook with ExcelJS (`utils/tosXlsx.ts`): letterhead, green editable cells + gray formula cells, formulas written live (`=SUM(...)`), `fullCalcOnLoad` so Excel computes on open. Tabs are named as the workbook spells them (`Multiple Choice`, `ProductPerformance-Based`); both papers end at the Create column — no extra grand-total column.

### `components/MapBrief.tsx` (embedded on all three role dashboards)
- The program's curriculum at a glance, moved off the Generate Map page: the seven KPI tiles (Total Programs … Unmapped / Incomplete), the Curriculum Mapping Summary table and the PO Coverage Chart. Self-contained — it fetches its own data, opens on the account's program assignment (then BSIT, then first), and re-uses the shared alignment engines (`utils/alignment.ts`, `utils/cloPoMapping.ts`), so its figures always agree with the report's PDF.
- The tiles read the **committed framework** (corrected 2026-11-05, twice — see below): "Total PO's" shows the **official CMO 25 S. 2015 document** — the manager-sourced rows carrying one of the two category headers, recognized by the exact same predicate the report's mapping matrix uses (`isManagerOutcome` + `isManagerCmCategory`), because migration 010 deliberately stamped the official list as `source='manager'` so the report builds from manager rows. The qualifier discloses what's beyond that set: `N additional · M archived` (both live-computed; duplicates along an official code can't inflate the extras). Mapping deliberately still runs on the **union of all active sources**, so a CLO may target an official or a non-official outcome, and quoting an archived code correctly shows as a gap. "Unmapped / Incomplete" names its own two halves in the sub (`N CLOs unmapped · M outcomes unanchored`): a faculty CLO that names no program outcome vs an outcome no CMO/PEO/Strategic-Goal document anchors.
- The **empty pipeline keeps the literal 0%, and says why** (as chosen by the user on 2026-11-05): until any faculty member creates the first CLO, "Mapping Coverage" reads `0%` with the qualifier `0 / 33 subjects — no CLOs yet`, so the zero explains itself — the engine isn't broken, the input side just hasn't started. "Unmapped / Incomplete" likewise says `M unanchored outcomes · no CLOs yet`. The `—` display remains reserved for the genuinely unmeasurable case (no subjects in the program at all). The tiles stay aggregates (admin/manager see all users' CLOs under RLS 009; a faculty member's tile is scoped to their own). Coverage itself still counts a subject only when it has CLOs and every one of them names an outcome — partial mapping stays parked in Unmapped/Incomplete, never in Coverage.

### `components/MapPreview.tsx` (slotted inside MapBrief on all three role dashboards)
- The live OBE Curriculum Map as a dashboard block (added 2026-11-01): the Year·Semester columns (Summer only in 3rd year), the Viridis year palette, the amber prerequisite connectors and the press-to-reveal spotlight (a press lights the pressed dot's forward prerequisite chain to its end; press again or press the empty canvas to clear). Self-fetched like MapBrief and forked deliberately from `Map.tsx`'s `renderCurriculumMap` — geometry and palette are copies; the page-specific machinery (PO/PI filters, zoom, inspection card, floating tooltip) stays there.
- Since 2026-11-01 it sits **between MapBrief's KPI tiles and its two panels** (figures → map → summary + coverage chart): MapBrief grew a `children` slot rendered after the tile row, and the dashboards pass the preview through it instead of stacking it below.
- Curriculum pick mirrors Generate Map's landing boot: a program qualifies when one of its courses carries a curriculum in Resources → viewer's program, else BSIT, else the first that qualifies; the first anchored course's curriculum is drawn. Footer's "Open Generate Map →" routes every role to Subject Graph (`subject-view`).

### `shared/Reports.tsx` (no longer routed in the sidebar)
- The overall report page. Its on-screen brief blocks (KPIs, summary, coverage chart) moved to the dashboards (`components/MapBrief.tsx`), and its "Reports" sidebar entry was removed from all three roles on 2026-11-01, so the page is currently unreachable; the file stays for the export machinery until the route is deleted or restored.
- Exports: Excel workbook + PDF (`report.ts`, `download.ts`) and Word (`syllabusDocx.ts`) with the letterhead + navy heading styling; document constants (vision/mission wording) live in `utils/report.ts`, not `src/data/`.

### `admin/Map.tsx` (shared by all roles as Subject Graph)
- d3 outcome hierarchy: Subject → Curriculum → Prereq/Coreq → CLO → PO → PEO → SG → CMO. Renders after pressing View.
- Strict green-monochrome + gray + 1 amber (prereq) theme; legend with per-kind counts + Unresolved badge (`countKinds`); placeholder/loading/empty states; mobile stacks panels and scrolls graph horizontally.
- Live auto-update: watches every table the map reads (`MAP_TABLES`) with Supabase realtime change events, refetches on tab focus/visibility, and polls quietly every 45s as a backup — manager/user edits to subjects, CLOs, POs, PEOs, SGs, CMOs or curricula appear on the open map without a manual reload (realtime events need Realtime replication enabled on those tables in the Supabase dashboard; focus + polling cover it otherwise).

### `manager/Users.tsx`
- Users directory (table with role badges) + add/remove users (`user` role only, never self). Role changes are admin-only (via SQL).

### `manager/Curriculum.tsx`
- Props: `userEmail`. Create/edit/archive (no delete), search box, Active/Archive tabs with counts, `role=alert/status` messages.

### `manager/Course.tsx`
- Wraps `admin/Course` with `hideDelete` (create/edit/archive/restore, no delete). Falls through `renderPage` with `profile` prop.

### `admin/Syllabus.tsx`
- Printable curriculum map / syllabus report. Displays Vision, Mission, Strategic Goals, PEOs, Program Outcomes, Curriculum Mapping, Course Learning Outcomes, and Course Details in a formatted document layout.
- Supports inline editing and archiving of Strategic Goals, PEOs, and Program Outcomes via an Edit toggle. Archives write `strategic_goal.archived` / `peo.archived` / `program_outcome.archived` rather than a generic `.updated`.
- Static syllabus content (vision/mission wording, curriculum mapping, course details) comes from `src/utils/report.ts` (the old `src/data/vcqiSyllabus.ts` was folded into it).

### `user/Curriculum.tsx`
- Unrouted legacy read-only browse (faculty nav is Dashboard + CLO + Subject Graph + Profile).

### `ActivityLogs.tsx` (admin and manager)
- Latest 100 entries with search + action/date filters, empty/filtered-empty states. Columns: when (`toLocaleString`), user, action badge.
- Labels come from `ActivityLabels.ts`, which covers every action the app emits — archive/restore are distinct actions from updates, so an archive never reads as an edit. Unknown actions fall back to de-snake-cased text rather than a raw string.
- Each entry's `details` renders as a second line under the badge: the record's `label`, and for `auth.login_failed` the reason in red. Both are searchable.
- A "Failed sign-ins" stat counts failures in the current filtered view.

### `admin/ActivityLabels.ts`
- `ACTION_LABELS` — action string → human-readable label, plus `labelAction()` / `labelReason()` helpers. Derived from what the app actually emits, not from an ideal wish list, so nothing renders as raw snake_case.

### `Profile.tsx`
- Laid out as the concept in `design/profile-redesign.html`: a dark hero with a role-tinted avatar and fact chips, then two columns. The left holds the identity card (picture, name, verified email, role badge, capabilities, last activity) and **Profile information**. The right holds a security summary and the personal activity trail.
- Only the picture, full name and nickname are editable, through the explicit **Edit profile → Save changes / Cancel** cycle the Profile & Security spec requires. Email, department, program, designation, role and account status display read-only.
- Password and sessions are not on this page. The security card links to Security & privacy, so the concept's password form is not ported.
- Role badges use the concept's colours (green admin, lime manager, grey faculty). The Users pages and the activity log still use the global purple and blue badges, so the two differ.
- Styles are the `prf-*` classes in `index.css`. `.profile-timeline`, `.profile-empty` and `.pf-link` are shared with Security & privacy and unchanged.
- Props: `profile`, `onSaved`, `onNavigate`. Writes `profile.updated`, `profile.avatar_changed` and `profile.avatar_removed` audit entries, and reports the updated profile back to `App.tsx` via `onSaved`. Shared by all roles.

### `App.tsx`
- Holds `session`, `profile`, `activePage`. Defines the `NAV` map (role → nav items) and the `PAGES` map (role → page components, one per role folder; `Profile` is shared). On session change, loads the profile via `ensureProfile` (auto-creates the row if missing — e.g. after a schema re-run) and renders `Login` when signed out; otherwise renders the header + current page.
- **Gating:** `page` is coerced to a role-valid page, so even a crafted `activePage` value can't show an unauthorized page.
- **Login guard:** A `profileLoaded` flag prevents rendering the dashboard before the user's role is known, so the correct role-specific page appears immediately without a flash.

### `Sidebar.tsx`
- Dark-glass top navbar (`styles/Sidebar.css`): brand + role-specific pill nav + profile menu, blur + green hairline edge matching the circuit wallpaper. Academic pages group under an `Academics` dropdown (all roles); `subject-view` included. Shows real `full_name`/`email` in the profile menu with role badge; logout lives inside. Active items get `aria-current="page"`; the active pill and avatar sit on the green gradient; the mobile drawer tray stays dark so the light menu text survives; dropdown and profile menus open as sage cards over the dark bar.

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
- **Password policy** — client-side every form requires 8 characters and mirrors it in the strength meter (`src/utils/passwordPolicy.ts`); align the project's **Minimum password length** to 8 in the dashboard (setup step 7) so a direct API call can't sneak in a 6–7-character password. `adminCreateUser` uses `email_confirm: true` so created users can sign in immediately (development convenience). With no password given, the Edge Function generates one (nobody sees it) and the user is emailed a one-time set-password link: Supabase's built-in mailer by default (rate-limited ~2/hour), or a custom-branded Resend email when `RESEND_API_KEY`/`WELCOME_FROM_EMAIL` secrets are set. No password is ever shared with the inviter.
- **Log an action only when it happened.** `useEntityCrud` handlers return early when there is no row to act on and skip the audit write in that case. Copy the pattern when adding handlers — an audit entry for a mutation that did not occur is worse than a missing one, because it looks like evidence.
- **Archive/restore are not updates.** Give them their own action names (`<entity>.archived` / `<entity>.restored`) so the log can distinguish removing a record from renaming one. `EntityCrudPage` derives these from `updateAction`.

---

## 11. Troubleshooting

| Problem | Cause / Fix |
|---|---|
| `npm install` fails with `ERESOLVE` (peer vite@... from @vitejs/plugin-react) | `@vitejs/plugin-react@4` only supports Vite 4–7, but the project uses Vite 8. Fix: upgrade the plugin — change `"@vitejs/plugin-react": "^6.0.5"` in `package.json` — then `npm install` again. |
| Re-running `supabase-schema.sql` seems to "reset" everything | The file starts with `DROP TABLE ... profiles` — it wipes profiles, resources, activity_logs, **and all roles** each run. Don't re-run it casually; if you do, re-apply the role UPDATEs from section 3.1 (or the app self-heals missing profiles as role `user`). |
| Want to apply a schema change **without losing data** | Don't re-run `supabase-schema.sql` (it drops every table). Run the matching file in `supabase/migrations/` instead — those are policy/DDL-only and idempotent. For the activity log, use `supabase/migrations/002-activity-log-writer.sql`, which adds the `details` column, the two indexes, and the updated `log_activity` / `record_login_event` functions. |
| Audit entries show no record name | The `details` column is missing in your database. Run `supabase/migrations/002-activity-log-writer.sql` in the SQL Editor. Entries written before the migration keep showing with no detail — that is expected, the column is nullable and old rows were never given one. |
| Activity Logs shows **only** sign-ins | `log_activity()` is missing from your database. It was added in a later commit than `record_login_event()`, so a database created before then has the sign-in writer but not the main one. Every page's `addActivityLog()` call fails silently against it, so nothing on screen looks broken. Run `supabase/migrations/002-activity-log-writer.sql`, then sign out and back in. |
| A manager can see the **admin's** activity | The pre-`003` policy put admin and manager on one tier (`IN ('admin','manager')`), so a manager read every row. Run `supabase/migrations/003-manager-log-visibility.sql` in the SQL Editor to separate them — an admin keeps reading everything. Nothing is deleted; it is a view restriction. |
| Admin entries missing for an admin | The scoped policy is missing. Run `003-manager-log-visibility.sql` (or `007-manager-log-faculty-only.sql`, which recreates the policy and its newer `actor_role()` helper); both are safe to re-run. |
| A manager sees **manager or Unknown** rows in the log | `003` still let a manager read other managers' and unattributable rows, and its admin check matched emails case-sensitively, so an entry stamped `Admin@cqi.test` (capital A) slipped through as Unknown. Run `supabase/migrations/007-manager-log-faculty-only.sql` — managers then see faculty entries only, and email matching is case-insensitive. Safe to re-run. |
| An archived account cannot sign in ("account has been archived") | That is the soft delete working: an admin archived the account, and sign-in stays refused until it is restored. An admin restores it from Users & Accounts → Archive tab. |
| A faculty user's Course Learning Outcomes page is **empty** (or shows fewer rows than before) | Outcomes are owned per faculty member since `009-private-clos.sql` — each user sees only what they created; managers and admins still see everything. The migration attributes existing rows from `clo.created` audit entries; rows with no matching log stay unowned (admin/manager-visible). Hand one to a user with the UPDATE snippet in the migration's header comment. |
| Faculty Delete on a CLO fails with a permission error | Before `009` there was no DELETE policy for non-admins, so the button could never work. The migration lets an owner delete their own rows — run it. |
| The CLO page's Program Outcomes suggestions (and the syllabus's outcome lists) show old titles, duplicate codes like two different "PO 2"s, or a messy mix | The outcomes table drifted from hand-typed rows. Run `supabase/migrations/010-official-program-outcomes.sql` — it archives the drifted rows and inserts the official CMO 25 S. 2015 list (PO-1…PO-4 + SD-1…SD-13) verbatim. Reversible: restore any archived row by flipping its `status` back to `active`. |
| Logged in but shown as `user` (no admin powers) | The profile's `role` column is `user` in the DB. Promote it (section 3.1 SQL) — the role lives in `profiles`, not in the email. |
| Logged in but stuck on Login or empty dashboard | Profile missing. `ensureProfile` now auto-creates a profile row on sign-in, so this self-heals; if it persists, check the profile INSERT policy exists. |
| `42501` / "permission denied for table" | RLS blocking. Check the role of the signed-in user (`SELECT role FROM profiles WHERE id = auth.uid()`) and confirm the matching policy exists. |
| "Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env to create users" | The "Create user" admin feature needs the service role key. Either add it (dev) or accept the feature is disabled. |
| Add User fails with "Database error creating new user" | The `on_auth_user_created` trigger (whose `handle_new_user` seeds the profile row) is failing inside GoTrue's INSERT transaction — the Edge Function, RLS and the page itself are already correct at that point. Run `supabase/migrations/020-user-creation-heal.sql` in the SQL Editor: it reinstalls the canonical handler, re-binds the trigger, and self-reports (NOTICE/WARNING lines) any profiles column that would still block the seed insert. Then verify with `node scripts/diag-admin-create.mjs`. |
| Add User fails with "admin.auth.admin.getUserByEmail is not a function" | A deployed Edge Function older than the fix called a method that does not exist on supabase-js 2.112's admin API (users are addressable by id or the paginated `listUsers`, never directly by email). Redeploy the current file: `npx supabase functions deploy admin-users` (login/link prerequisites are in the function header). Duplicate emails still get the friendly 400 — GoTrue's own refusal text carries it post-creation. |
| Resource creator shows "Unknown" | The embedded `created_by ( full_name )` join returns null when RLS hides that profile row (a `user` viewing another user's resource). Expected behavior. |
| Login shows "Invalid email or password." | Generic error by design (hides whether the email exists). Double-check the exact email/password and case; if correct, confirm the account exists under Authentication → Users. |
| Changes to `supabase-schema.sql` have no effect | The SQL file is only the source of truth — you must re-run it (or the relevant DDL) in the Supabase SQL Editor. |
| Port already in use on `npm run dev` | Vite picks another port automatically, or kill the process holding the port. |
| Stale data after edits | Data is fetched on page load; navigate away and back (or refresh). No realtime subscriptions are set up. |

---

## 12. Continuous Integration

`.github/workflows/ci.yml` runs on **every push and pull request** on a GitHub-hosted Ubuntu runner — no secrets, no Supabase connection needed:

1. `npm ci` — installs the pinned tree (`package-lock.json`); the platform-specific rolldown/rollup bindings resolve as optional transitive dependencies, so one lockfile installs cleanly on Windows (dev) and Linux (CI).
2. `npx tsc --noEmit` — the typecheck gate.
3. `npm test` — the `vitest` suite (pure logic, 300+ tests).
4. `npm run build` — the production bundle.

A red match here means a regression landed; fixing it precedes any new feature work. The workflow never runs migrations against the database — schema changes stay manual by design (see §6).

---

## 12. Scripts

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm test` | Run the 257 unit tests (Vitest) |
| `npm run build` | Production build (output in `dist/`) |
| `npm run preview` | Serve the production build locally |
| `node scripts/diag-admin-create.mjs` | End-to-end Add-User check against the live project (reads `.env`): signs in as the demo admin, invokes the `admin-users` Edge Function for a scratch address, reports the raw result, and removes the scratch account when creation succeeds. Optional args: admin email, admin password. |

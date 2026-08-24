# CQI Monitoring System

A role-based web application for curriculum mapping and outcomes alignment. Built with React + Vite + Supabase, with three roles — **admin**, **manager**, and **user** — each with their own pages and permissions enforced at both the UI and the database (Row Level Security) level.

---

## 1. Overview

- **Frontend:** React 18 + Vite, TypeScript — `src/App.tsx` holds the active page in state and renders it based on the signed-in user's role.
- **Backend:** Supabase (hosted Postgres + Auth). All data goes through service functions in `src/services/database.ts`.
- **Roles:**
  - `admin` — System Administrator / ICT Officer. Full control: manage accounts and roles, manage curriculum entities, view the audit log.
  - `manager` — Program Head / CQI Lead. Manages curriculum records and program outcomes (create/edit), browses the faculty directory (read-only), views the audit log.
  - `user` — Faculty / Instructor. Browses curriculum data, maintains course learning outcomes (create/edit), and edits their own profile.

The UI hides pages you can't use, but the *real* enforcement is **Row Level Security (RLS)** in the database.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Build tool | Vite |
| Framework | React 18 (function components + hooks) |
| Language | TypeScript |
| Styling | Plain CSS with CSS custom properties in `src/index.css` |
| Backend / DB | Supabase (Postgres, Auth, RLS, triggers) |
| Client | `@supabase/supabase-js` |

---

## 3. Roles & Permissions

| Capability | admin | manager | user |
|---|---|---|---|
| Sign in | yes | yes | yes |
| View own dashboard | yes | yes | yes |
| Manage programs / courses / POs / CLOs | full CRUD | create/edit | read-only |
| Manage strategic goals, PEOs, CHED memos, standalone POs | yes | — | — |
| Create/edit standalone course learning outcomes | yes | yes | yes |
| Delete standalone POs / CLOs | yes | — | — |
| Archive/restore standalone lists (POs, CLOs, PEOs, goals, memos) | yes | — | — |
| View faculty directory | yes | yes | — |
| Change user roles | yes | — | — |
| View audit log | yes | yes | — |
| View / edit own profile | yes | yes | yes |

### 3.1 Test Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@cqi.test` | `Admin@123456` |
| Manager | `manager@cqi.test` | `Manager@123456` |
| User | `user@cqi.test` | `User@123456` |

Roles survive schema re-runs — the seed section restores profiles for existing auth users by email.

---

## 4. Project Structure

```
.
├── .env                      # Local secrets (gitignored)
├── .env.example              # Template for .env
├── .gitignore
├── index.html                # Vite entry HTML
├── package.json              # Dependencies + scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite config (React plugin)
├── supabase-schema.sql       # Full database schema — run in Supabase SQL Editor
└── src/
    ├── main.tsx              # React entry point
    ├── App.tsx               # Session handling, role-based nav + page gating
    ├── index.css             # Theme variables + all component styles
    ├── vite-env.d.ts         # Vite environment variable types
    ├── components/
    │   └── Sidebar.tsx       # Nav shell (items change per role) + logout
    ├── pages/
    │   ├── Login.tsx         # Sign in
    │   ├── Profile.tsx       # View/edit own profile (shared by all roles)
    │   ├── admin/
    │   │   ├── Dashboard.tsx
    │   │   ├── ActivityLogs.tsx
    │   │   ├── ProgramOutcomes.tsx
    │   │   ├── CourseLearningOutcomes.tsx
    │   │   ├── StrategicGoals.tsx
    │   │   ├── ProgramEducationalObjectives.tsx
    │   │   ├── ChedMemoOrders.tsx
    │   │   └── curriculum/
    │   │       └── useEntityCrud.ts
    │   ├── manager/
    │   │   ├── Dashboard.tsx
    │   │   ├── Users.tsx
    │   │   └── Curriculum.tsx
    │   └── user/
    │       ├── Dashboard.tsx
    │       └── Curriculum.tsx
    ├── services/
    │   └── database.ts       # All Supabase queries + Edge Function calls
    ├── styles/
    │   └── Sidebar.css
    └── utils/
        └── supabaseClient.ts # Creates the Supabase client from env vars
└── supabase/
    └── functions/
        └── admin-users/      # Edge Function: admin-only user create/delete
```

---

## 5. Setup

### Prerequisites
- Node.js 18+ and npm
- A Supabase project ([supabase.com](https://supabase.com))

### 1. Run the database schema
Open your Supabase project → **SQL Editor** → paste the contents of `supabase-schema.sql` → run.

> **Warning:** This file begins with `DROP TABLE ...` — re-running it wipes all data.

### 2. Create your first account
Go to **Dashboard > Authentication > Users** and add a user. The trigger automatically creates their profile.

### 3. Promote yourself to admin
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email';
```

### 4. Configure `.env`
Copy `.env.example` to `.env` and fill in your Supabase keys:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

> **Note:** There is deliberately **no service-role key** here. Anything prefixed
> `VITE_` is bundled into the JavaScript shipped to browsers, so the service-role
> key must never be used in frontend code.

### 5. Deploy the `admin-users` Edge Function
Creating and deleting auth users requires admin API access, which is done
server-side by an Edge Function (the service-role key lives only there, as a
hosted secret):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy admin-users
```

### 6. Run
```bash
npm install
npm run dev
```

---

## 6. Database Schema

### Tables

**`profiles`** — one row per auth user, created automatically on signup.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | references `auth.users(id)`, cascade delete |
| `email` | TEXT (unique) | |
| `full_name` | TEXT | |
| `role` | `user_role` | default `'user'` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**`programs`** — academic programs (e.g. BSIT, BSCS).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `code` | TEXT (unique) | e.g. `BSIT` |
| `name` | TEXT | |
| `description` | TEXT | |
| `status` | TEXT | `'active'` or `'archived'` |

**`courses`** — courses belonging to a program.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `program_id` | UUID (FK) | cascades on delete |
| `code` | TEXT | unique per program |
| `title` | TEXT | |
| `units` | INTEGER | default 3 |

**`program_outcomes`** — outcomes tied to a program (PO1, PO2, etc.).

**`course_learning_outcomes`** — CLOs tied to a course (CLO1, CLO2, etc.).

**`activity_logs`** — audit trail of user actions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_email` | TEXT | who did it |
| `action` | TEXT | e.g. `auth.login`, `program.created` |
| `created_at` | TIMESTAMPTZ | |

**`resources`** — curriculum records managed by managers/admins.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `title` | TEXT | |
| `description` | TEXT | |
| `status` | TEXT | `'active'` or `'archived'` |
| `created_by` | UUID (FK) | references `profiles(id)`, set null on delete |

**`strategic_goals`** — institutional strategic goals (admin-managed).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `code` | TEXT (unique) | e.g. `SG1` |
| `title` | TEXT | |
| `description` | TEXT | |
| `status` | TEXT | `'active'` or `'archived'`; only admins may change it |

**`admin_program_outcomes`** — standalone reference list of program outcomes (admin-managed).

**`program_educational_objectives`** — PEOs (admin-managed).

**`admin_course_learning_outcomes`** — standalone reference list of course learning outcomes (admin-managed).

**`ched_memorandum_orders`** — CHED Memorandum Orders (admin-managed).

The last four tables share the same structure: `id` UUID PK, `code` TEXT unique, `title` TEXT, `description` TEXT, `status` TEXT (`'active'`/`'archived'`, admin-only changes), `created_at`, `updated_at`.

### Functions & Triggers

- **`current_user_role()`** — returns the caller's role. `SECURITY DEFINER`, used inside RLS policies.
- **`handle_new_user()`** — `AFTER INSERT` trigger on `auth.users`. Creates a `profiles` row on signup.
- **`record_login_event(email, success, reason)`** — records sign-in attempts. `SECURITY DEFINER`, callable by `anon` and `authenticated` so failed logins (no session) can be recorded.
- **`log_activity(action)`** — writes an audit entry stamped with the caller's real email from their JWT. `SECURITY DEFINER`, callable by `authenticated`. Clients can only supply the action — the actor is resolved server-side.
- **`sync_demo_role()`** — called on every sign-in. Restores demo account roles and auto-promotes the first user to admin when no admin exists. `SECURITY DEFINER`, callable by `authenticated`.
- **`enforce_status_admin_only()`** — trigger on the five standalone lists. RLS is row-level only, so this rejects `status` changes from non-admins at the database level even if they hold UPDATE rights on the row.

---

## 7. Service Layer

All queries live in `src/services/database.ts`:

| Function | Purpose |
|---|---|
| `ensureProfile` | Fetch own profile; auto-create if missing |
| `updateProfile` | Update own full_name |
| `syncDemoRole` | Restore demo account roles / bootstrap first admin |
| `fetchAllProfiles` | List all users (admin/manager) |
| `fetchResources` / `createResource` / `updateResource` | Manage curriculum resources |
| `fetchStrategicGoals` / CRUD | Manage strategic goals (admin) |
| `fetchProgramEducationalObjectives` / CRUD | Manage PEOs (admin) |
| `fetchProgramOutcomesStandalone` / CRUD | Manage standalone POs (admin) |
| `fetchCourseLearningOutcomesStandalone` / CRUD | Manage standalone CLOs (admin) |
| `fetchChedMemoOrders` / CRUD | Manage CHED memos (admin) |
| `fetchActivityLogs` | Latest 100 audit entries (admin/manager) |
| `recordLoginEvent` | Record sign-in via RPC |
| `addActivityLog(action)` | Write an audit entry via the server-stamped `log_activity` RPC |
| `adminCreateUser` / `adminDeleteUser` | Create/delete auth users via the `admin-users` Edge Function |

---

## 8. Scripts

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build (output in `dist/`) |
| `npm run preview` | Serve production build locally |

---

## 9. Security Notes

- **RLS is the real gate.** Hiding buttons/nav is UX only. Every policy is enforced by Postgres.
- **`current_user_role()`** is `SECURITY DEFINER` — bypasses RLS to read roles. Keep `search_path` pinned to `public`.
- **No service-role key in the frontend.** `VITE_*` env vars are inlined into the browser bundle, so the service-role key lives only inside the `admin-users` Edge Function as a hosted secret. That function verifies the caller's JWT resolves to an `admin` profile before acting.
- **Audit log is server-stamped.** Direct inserts into `activity_logs` are blocked by RLS (no INSERT policy); entries are written only through `log_activity()` / `record_login_event()`, which resolve the actor from the JWT — clients cannot forge someone else's email.
- **`.env` is gitignored** — commit `.env.example`, not `.env`.

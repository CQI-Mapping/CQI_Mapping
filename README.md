# CQI Monitoring System

A role-based web application for curriculum mapping and outcomes alignment. Built with React + Vite + Supabase, with three roles — **admin**, **manager**, and **user** — each with their own pages and permissions enforced at both the UI and the database (Row Level Security) level.

---

## 1. Overview

- **Frontend:** React 18 + Vite, TypeScript — `src/App.tsx` holds the active page in state and renders it based on the signed-in user's role.
- **Backend:** Supabase (hosted Postgres + Auth). All data goes through service functions in `src/services/database.ts`.
- **Roles:**
  - `admin` — System Administrator / ICT Officer. Full control: manage accounts and roles, manage curriculum entities, view the audit log.
  - `manager` — Program Head / CQI Lead. Manages curriculum entities (create/edit), browses the faculty directory (read-only), views the audit log.
  - `user` — Faculty / Instructor. Browses curriculum data and edits their own profile.

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
| Manage strategic goals, PEOs, CHED memos, standalone POs/CLOs | yes | — | — |
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
    │   └── database.ts       # All Supabase queries
    ├── styles/
    │   └── Sidebar.css
    └── utils/
        └── supabaseClient.ts # Creates the Supabase client from env vars
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
VITE_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 5. Run
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

**`admin_program_outcomes`** — standalone reference list of program outcomes (admin-managed).

**`program_educational_objectives`** — PEOs (admin-managed).

**`admin_course_learning_outcomes`** — standalone reference list of course learning outcomes (admin-managed).

**`ched_memorandum_orders`** — CHED Memorandum Orders (admin-managed).

The last four tables share the same structure: `id` UUID PK, `code` TEXT unique, `title` TEXT, `description` TEXT, `created_at`, `updated_at`.

### Functions & Triggers

- **`current_user_role()`** — returns the caller's role. `SECURITY DEFINER`, used inside RLS policies.
- **`handle_new_user()`** — `AFTER INSERT` trigger on `auth.users`. Creates a `profiles` row on signup.
- **`record_login_event(email, success, reason)`** — records sign-in attempts. `SECURITY DEFINER`, callable by `anon` and `authenticated` so failed logins (no session) can be recorded.
- **`sync_demo_role()`** — called on every sign-in. Restores demo account roles and auto-promotes the first user to admin when no admin exists. `SECURITY DEFINER`, callable by `authenticated`.

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
| `addActivityLog` | Insert an audit entry (client-side) |

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
- **Service role key** bypasses RLS entirely. Never commit it.
- **`.env` is gitignored** — commit `.env.example`, not `.env`.
- **Audit log** is client-inserted; treat it as an activity trail, not tamper-proof.

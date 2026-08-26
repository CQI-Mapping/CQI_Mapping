# CQI Monitoring System

A data-driven CQI (Continuous Quality Improvement) monitoring system for curriculum mapping and outcomes alignment. Built for Northern Bukidnon State College (NBSC) capstone project.

---

## Quick Start

### Prerequisites
- **Node.js 18+** and **npm** installed
- A **Supabase** project (free at [supabase.com](https://supabase.com))

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up Database
1. Go to your Supabase dashboard
2. Open **SQL Editor**
3. Paste the contents of `supabase-schema.sql`
4. Click **Run**

### Step 3: Configure Environment
Create a `.env` file in the project root:
```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
Find these values in **Supabase > Settings > API**.

### Step 4: Run the App
```bash
npm run dev
```
Open http://localhost:5173 in your browser.

---

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cqi.test | Admin@123456 |
| Manager | manager@cqi.test | Manager@123456 |
| User | user@cqi.test | User@123456 |

---

## Project Structure

```
src/
├── App.tsx                 # Main app with role-based routing
├── index.css               # All styles
├── pages/
│   ├── Login.tsx           # Login page
│   ├── Profile.tsx         # User profile
│   └── admin/
│       ├── Dashboard.tsx           # Admin dashboard
│       ├── Users.tsx               # User management
│       ├── StrategicGoals.tsx      # Strategic goals (SG-1 to SG-5)
│       ├── ProgramEducationalObjectives.tsx  # PEOs
│       ├── ProgramOutcomes.tsx     # Program outcomes
│       ├── CurriculumMap.tsx       # Curriculum mapping table
│       ├── ChedMemoOrders.tsx      # CHED memorandum orders
│       └── ActivityLogs.tsx        # Activity logs
├── services/
│   └── database.ts         # All Supabase queries
└── utils/
    └── supabaseClient.ts   # Supabase client setup
```

---

## Features

### Admin Dashboard
- **Strategic Goals** (SG-1 to SG-5) - Pre-populated from VCQI syllabus
- **Program Educational Objectives (PEOs)** - 5 objectives from VCQI
- **Program Outcomes (POs)** - 27 outcomes organized in 5 sections
- **Curriculum Map** - Academic document format with numbered outcomes
- **CHED Memorandum Orders** - CMO references
- **User Management** - Create and manage user accounts
- **Activity Logs** - Track all system activities

### Curriculum Map Format
The curriculum map follows the official VCQI syllabus format:
- Single continuous table with thin black borders
- Numbered outcomes (1-27) in 5 sections
- Professional academic font (Arial)
- Editable outcomes with inline editing

---

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## Tech Stack

- **Frontend:** React 18 + Vite 8 + TypeScript
- **Backend:** Supabase (PostgreSQL + Auth)
- **Styling:** Plain CSS

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Run `npm cache clean --force` then `npm install` |
| Port 5173 in use | Vite will use another port automatically |
| Login fails | Check `.env` has correct Supabase URL and keys |
| Blank page | Open browser console (F12) for errors |
| Data not showing | Ensure database schema was run in Supabase |

---

## License

Capstone project for Northern Bukidnon State College (NBSC)

# Guide to Run the CQI Monitoring System

A step-by-step guide to set up and run this project on your computer.

---

## Prerequisites

Before you start, make sure you have:

- **Node.js 18+** — Download from [nodejs.org](https://nodejs.org)
- **npm** — Comes with Node.js
- **Supabase account** — Create free at [supabase.com](https://supabase.com)

---

## Step 1: Install Node.js

1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS** version
3. Run the installer and follow the prompts
4. Verify installation by opening a terminal and typing:
   ```
   node -v
   npm -v
   ```

---

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and sign up / log in
2. Click **"New project"**
3. Fill in:
   - **Project name:** `cqi-monitoring`
   - **Database password:** (choose one and save it)
   - **Region:** Closest to you
4. Wait for the project to be created (1-2 minutes)

---

## Step 3: Run the Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase-schema.sql` from this project folder
4. Copy the entire contents and paste into the SQL Editor
5. Click **"Run"** to execute

This creates all the tables, roles, and security policies.

---

## Step 4: Create Test Accounts

1. In Supabase, go to **Authentication > Users**
2. Click **"Add user"** and create these accounts:

| Email | Password | Role |
|-------|----------|------|
| admin@cqi.test | Admin@123456 | Admin |
| manager@cqi.test | Manager@123456 | Manager |
| user@cqi.test | User@123456 | User |

3. After creating each user, go to **SQL Editor** and run:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@cqi.test';
   UPDATE public.profiles SET role = 'manager' WHERE email = 'manager@cqi.test';
   UPDATE public.profiles SET role = 'user' WHERE email = 'user@cqi.test';
   ```

---

## Step 5: Get Your Supabase Keys

1. In Supabase, go to **Settings > API** (left sidebar)
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

## Step 6: Create the .env File

1. In the project folder, create a file named `.env`
2. Add these lines (replace with your actual keys):

   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## Step 7: Install and Run

1. Open a terminal in the project folder
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```
4. Open the URL shown (usually `http://localhost:5173`)

---

## Step 8: Sign In

1. Use one of the test accounts from Step 4
2. Sign in with email and password
3. You should see the dashboard based on your role

---

## Quick Commands

| Command | What it does |
|---------|--------------|
| `npm install` | Install all project files |
| `npm run dev` | Start the app in development mode |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Make sure Node.js 18+ is installed. Try deleting `node_modules` folder and running `npm install` again |
| Can't sign in | Check your `.env` file has the correct Supabase URL and key |
| "Invalid email or password" | Make sure you created the account in Supabase Authentication > Users |
| Port already in use | Vite will automatically use another port. Check the terminal for the correct URL |
| Blank page after login | Check browser console for errors. Usually means Supabase keys are wrong |

---

## Test Accounts Summary

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cqi.test | Admin@123456 |
| Manager | manager@cqi.test | Manager@123456 |
| User | user@cqi.test | User@123456 |

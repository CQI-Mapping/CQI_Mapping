# How to Run the CQI Monitoring System

A simple guide to get this app running on your computer. Follow each step in order.

---

## What You Need First

| Tool | Why | Get It |
|------|-----|--------|
| **Node.js 18 or higher** | Runs the app | [nodejs.org](https://nodejs.org) — pick LTS |
| **npm** | Installs project files | Comes with Node.js (no extra install) |
| **Supabase account** | Database and login | [supabase.com](https://supabase.com) — free |

---

## Step 1: Install Node.js

1. Open [nodejs.org](https://nodejs.org)
2. Click the **LTS** download button
3. Run the file you downloaded, click **Next** through everything
4. Open **Command Prompt** or **PowerShell** and type:
   ```
   node -v
   ```
   If you see a version number (like `v20.11.0`), you are good.

---

## Step 2: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New project"**
3. Fill in:
   - **Name:** `cqi-monitoring` (or anything you like)
   - **Password:** Pick something you will remember — write it down
   - **Region:** Choose the one closest to you
4. Wait about 2 minutes for it to finish setting up

---

## Step 3: Set Up the Database

This creates the tables your app needs.

1. In your Supabase dashboard, look at the left menu → click **SQL Editor**
2. Click **"New query"**
3. Open the file `supabase-schema.sql` inside this project folder
4. Select all the text inside that file (`Ctrl+A`), copy it (`Ctrl+C`)
5. Paste it into the SQL Editor (`Ctrl+V`)
6. Click **"Run"** (or press `Ctrl+Enter`)

You should see a success message. If you see an error, make sure you copied the entire file.

---

## Step 4: Create User Accounts

Your app has 3 types of users: Admin, Manager, and User. Let's create them.

**A) In Supabase, create each account:**

1. Left menu → **Authentication** → **Users**
2. Click **"Add user"**
3. Enter the email and password from this table:

| Email | Password |
|-------|----------|
| admin@cqi.test | Admin@123456 |
| manager@cqi.test | Manager@123456 |
| user@cqi.test | User@123456 |

4. Repeat for all 3 users

**B) Then assign their roles:**

1. Go back to **SQL Editor** → **New query**
2. Paste this and click **Run**:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@cqi.test';
UPDATE public.profiles SET role = 'manager' WHERE email = 'manager@cqi.test';
UPDATE public.profiles SET role = 'user' WHERE email = 'user@cqi.test';
```

---

## Step 5: Get Your API Keys

1. In Supabase, left menu → **Settings** → **API**
2. You need two things:
   - **Project URL** — looks like `https://abc123.supabase.co`
   - **anon public** key — a long string that starts with `eyJ`
3. Copy both of them somewhere safe (like Notepad)

---

## Step 6: Connect the App to Supabase

1. Open the project folder on your computer
2. Create a new file called `.env` (no name before the dot)
3. Open it in any text editor and paste this:

```
VITE_SUPABASE_URL=paste-your-project-url-here
VITE_SUPABASE_ANON_KEY=paste-your-anon-key-here
```

4. Replace the placeholder text with your actual URL and key from Step 5
5. Save the file

---

## Step 7: Start the App

1. Open **Command Prompt** or **PowerShell**
2. Go to your project folder using `cd` (for example):
   ```
   cd "C:\your-project-folder"
   ```
3. Install everything the app needs:
   ```
   npm install
   ```
4. Start the app:
   ```
   npm run dev
   ```
5. You will see a link like `http://localhost:5173` — open it in your browser

---

## Step 8: Log In

1. On the login page, type one of the emails and passwords from Step 4
2. Click sign in
3. You will see the dashboard for your role

---

## Handy Commands

| What You Want To Do | Type This |
|---------------------|-----------|
| Install project files | `npm install` |
| Start the app | `npm run dev` |
| Build for production | `npm run build` |
| Preview production build | `npm run preview` |

---

## Something Not Working?

| Problem | Try This |
|---------|----------|
| `node -v` says "not recognized" | Restart your terminal. If still broken, reinstall Node.js |
| `npm install` fails | Delete the `node_modules` folder, then run `npm install` again |
| Can't log in | Double-check your `.env` file — make sure the URL and key are correct |
| "Wrong email or password" | You may have typed the password wrong, or forgot to create the user in Supabase |
| Page is blank after login | Open browser console (`F12` → Console tab) to see the error |
| Port 5173 is already used | Vite will use a different port — look at the terminal for the right URL |

---

## Test Accounts (Quick Reference)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cqi.test | Admin@123456 |
| Manager | manager@cqi.test | Manager@123456 |
| User | user@cqi.test | User@123456 |

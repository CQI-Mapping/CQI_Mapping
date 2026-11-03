-- ============================================================
-- 015: Manager archive/restore survives the 013 edit-guard
--
-- Run in the Supabase SQL Editor (service role context).
-- Idempotent — safe to re-run. No table, column or row is touched.
--
-- THE BUG IT FIXES
--   Migration 012 gave managers the archive/restore of FACULTY accounts: a
--   manager may flip ONLY profiles.status on rows whose role is 'user'
--   (a policy plus a guard trigger enforce the status-only rule).
--   Migration 013 then shipped `guard_profile_edits()`, which refuses
--   protected-column changes to non-admin callers — including status. Both
--   BEFORE UPDATE triggers fire, 012's runs first and passes the row, and
--   013's then raises
--     'Only administrators can change a role, email, program, status,
--      department or designation.'
--   So the manager's Archive button started failing the day 013 landed.
--   (The two migrations each wrote half of the manager contract.)
--
-- WHAT CHANGES
--   guard_profile_edits() gains a manager carve-out, matching 012:
--
--     A manager acting on ANOTHER row whose OLD.role = 'user' may change
--     ONLY profiles.status. Anything else they touch there (role, email,
--     name, nickname, avatar, program, department, designation) raises
--     42501, and every other self/protected-column rule stays as-is.
--
--   Self rows keep the owner path (a manager editing their own profile is
--   a row-owner edit, and 012 + this guard both leave it alone), and the
--   general user protections are unchanged.
--
-- AFTER RUNNING
--   As MANAGER via the app: Archive works again, and the manager directory
--   gains its own Archive list with Restore. No code migration needed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profile_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_caller public.user_role;
BEGIN
    -- System contexts (Edge Functions via service_role, SECURITY DEFINER
    -- functions like the sync_demo_role bootstrap, and SQL run directly in
    -- the dashboard) bypass the guard — they are the channels admins and
    -- the system itself are supposed to use.
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;

    -- The caller's own role is readable under the existing SELECT policy.
    SELECT role INTO v_caller FROM public.profiles WHERE id = auth.uid();

    -- Admins still repair other people's rows (Users & Accounts). Nobody —
    -- not even an admin — may lift their own protected columns.
    IF v_caller = 'admin' AND NEW.id <> auth.uid() THEN
        RETURN NEW;
    END IF;

    -- Manager faculty management (migration 012): a manager acting on
    -- ANOTHER person's faculty row may flip ONLY the archive status —
    -- that is the park/unpark the directory's tabs are built on. Any other
    -- column there stays admins-only, including the new 013 pair.
    IF v_caller = 'manager' AND NEW.id <> auth.uid() AND OLD.role = 'user' THEN
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.email IS DISTINCT FROM OLD.email
           OR NEW.full_name IS DISTINCT FROM OLD.full_name
           OR NEW.nickname IS DISTINCT FROM OLD.nickname
           OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
           OR NEW.program_id IS DISTINCT FROM OLD.program_id
           OR NEW.department IS DISTINCT FROM OLD.department
           OR NEW.designation IS DISTINCT FROM OLD.designation THEN
            RAISE EXCEPTION
                'Managers may change only the archive status on faculty accounts.'
                USING ERRCODE = '42501'; -- insufficient_privilege
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.program_id IS DISTINCT FROM OLD.program_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.department IS DISTINCT FROM OLD.department
       OR NEW.designation IS DISTINCT FROM OLD.designation THEN
        RAISE EXCEPTION
            'Only administrators can change a role, email, program, status, department or designation.'
            USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger definition is unchanged: recreate guard_profile_edits() and the
-- existing profiles_edit_guard trigger picks it up on the next statement.

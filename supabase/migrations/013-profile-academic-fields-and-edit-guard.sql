-- ============================================================
-- 013: Academic profile fields + profile-edit column guard
--
-- Run in the Supabase SQL editor (service role context).
-- Idempotent — safe to re-run.
--
-- WHAT IT CHANGES
--
--   profiles.department  TEXT NULL — academic department of the account
--   profiles.designation TEXT NULL — position / designation (Instructor I, ...)
--
--   Both are admin-managed: the Users & Accounts "Edit profile" modal can
--   set them, and the Profile page displays them read-only. Nothing in the
--   app writes them anywhere else.
--
--   A BEFORE UPDATE trigger on profiles closes the last self-service hole
--   the spreadsheet of RLS policies left open: a signed-in user may update
--   their OWN row (own-name policy) and that policy does not — and cannot —
--   restrict COLUMNS, so until now full_name edits and role edits came in
--   through the same door. The guard is the column-level part:
--
--     * System contexts pass through untouched. current_user is
--       'authenticated' for every client write; SECURITY DEFINER functions
--       (sync_demo_role's role bootstrap) and service-role connections
--       (Edge Functions) run as their owner, so they keep working.
--     * Admins keep repairing OTHER people's rows (Users & Accounts).
--     * No one — not even an admin — may change their OWN role, email,
--       program, status, department or designation. Those fields move
--       through the admin channels or not at all.
--
--   The UI never offered those edits; this makes the refusal server-side
--   so a hand-crafted API call fails the same way.
--
-- AFTER RUNNING
--   No code change is required (profile selects use `*`), but the Profile
--   page reads the two new columns — apply this before using the app.
-- ============================================================

-- ---------- New academic columns ----------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS designation TEXT;

-- ---------- Column guard ----------
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

DROP TRIGGER IF EXISTS profiles_edit_guard ON public.profiles;
CREATE TRIGGER profiles_edit_guard
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_edits();

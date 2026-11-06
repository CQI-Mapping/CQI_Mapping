-- Managers may archive/restore faculty accounts
-- ============================================================
-- Run this in the Supabase SQL Editor. Safe to re-run: the policy and the
-- guard trigger are dropped before they are created, and the guard function
-- is CREATE OR REPLACE. No table, column or row is touched.
--
-- WHY
--   Migration 008 deliberately kept profile status (archive/restore) in
--   admin hands: RLS let admins update any profile row, and managers could
--   not change status at all. In practice the Program Head parks faculty
--   who left or never completed onboarding, but then has to route around
--   the administrator for a reversible operation. This brings the park/
--   unpark of FACULTY accounts into the manager's remit while leaving the
--   remainder of account lifecycle administration admin-only.
--
-- WHAT CHANGES
--   1. A new profiles UPDATE policy: a manager may update rows whose role
--      is exactly 'user'. Admins and row-owners keep their existing
--      policies untouched.
--   2. A BEFORE UPDATE guard trigger. RLS policies cannot be scoped to
--      columns, so the left hand of the door is the policy (which rows),
--      and the right hand is this trigger (which columns): a manager
--      acting across rows may flip ONLY the status field. Role, name,
--      nickname, avatar, program and email changes on other rows stay
--      admins-only; the manager's own row keeps the owner path and is
--      exempt from the guard, as are admin callers.
--
-- WHO CAN DO WHAT AFTER THIS
--   admin   -> unchanged: any profile, any column
--   manager -> status flips (archive/restore) on 'user' rows only; own row
--              keeps the self-service profile path; everything else refuses
--   user    -> unchanged: own row only (Profile page)
--
-- RESTORE IN THE UI
--   As shipped, only the manager-side button is added (Archive). The
--   manager's directory hides archived rows, so unparking is left to the
--   admin's Archive tab; the policy itself permits either direction.
--
-- WHAT THIS DOES NOT DO
--   Nothing is deleted, no auth account is touched, and activation state
--   remains a reversible flag. Hard delete stays admin-only everywhere.

-- ============================================================
-- 1. The guard trigger function
-- ============================================================
-- SECURITY DEFINER so current_user_role() answers from the JWT without
-- coupling to profiles' own RLS (same reasoning as migration 003). STABLE:
-- reads only the caller identity.

CREATE OR REPLACE FUNCTION public.guard_manager_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- The guard fences only cross-row edits by managers. The row's owner
    -- (self profile edits) keeps the owner path, and admins are governed
    -- solely by their own policy.
    IF NEW.id <> auth.uid() AND public.current_user_role() = 'manager' THEN
        IF OLD.role <> 'user' THEN
            RAISE EXCEPTION 'Managers may only manage faculty accounts';
        END IF;
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.email IS DISTINCT FROM OLD.email
           OR NEW.full_name IS DISTINCT FROM OLD.full_name
           OR NEW.nickname IS DISTINCT FROM OLD.nickname
           OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
           OR NEW.program_id IS DISTINCT FROM OLD.program_id
        THEN
            RAISE EXCEPTION 'Managers may change only the archive status on faculty accounts';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_manager_profile_updates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_manager_profile_updates() TO authenticated;

-- ============================================================
-- 2. Manager-tier UPDATE policy on profiles
-- ============================================================
-- Additive: the two existing policies (owner, admin) keep working — for
-- UPDATE, Postgres ORs the permissive policies together, so a manager who
-- owns the row still passes the owner policy, and the admin policy is
-- untouched.

DROP POLICY IF EXISTS "Managers can archive/restore faculty accounts" ON public.profiles;
CREATE POLICY "Managers can archive/restore faculty accounts" ON public.profiles FOR UPDATE
    USING (public.current_user_role() = 'manager' AND role = 'user')
    WITH CHECK (public.current_user_role() = 'manager' AND role = 'user');

-- ============================================================
-- 3. Attach the guard trigger
-- ============================================================

DROP TRIGGER IF EXISTS guard_manager_profile_updates ON public.profiles;
CREATE TRIGGER guard_manager_profile_updates
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_manager_profile_updates();

-- ============================================================
-- VERIFY (run each block separately as the stated user)
-- ============================================================
-- As Admin:   the policies list has exactly one permissive UPDATE policy
--             with this name, and the trigger exists:
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'profiles' AND cmd = 'UPDATE';
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
--
-- As MANAGER: via the app, Archive a faculty row -> the row leaves their
--             directory (and reappears in the admin's Archive tab). Their
--             own row and MANAGER-badge rows show no Archive button.
--             Attempting a name change from another row via the API must
--             raise 'Managers may change only the archive status...'.
--
-- As Admin:   the same row can be restored from the Archive tab as before.

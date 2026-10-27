-- Activity log: managers see faculty activity only
-- ============================================================
-- Run this in the Supabase SQL Editor. Safe to re-run: the policy is dropped
-- before it is created, and the helper is CREATE OR REPLACE. No table, column
-- or row is touched.
--
-- WHY
--   Migration 003 put the manager one tier under the admin: they saw every
--   non-admin entry — other managers' and unattributable rows included. The
--   manager's remit on the Activity Logs page is faculty activity, so this
--   narrows the manager branch to entries whose actor's profile role is
--   exactly 'user'.
--
--   It also closes a leak 003 left open: is_admin_email() matched
--   profiles.email CASE-SENSITIVELY, so an entry stamped "Admin@cqi.test"
--   (capital A — whatever the auth system recorded that day) did not resolve
--   to the admin's "admin@cqi.test" profile row, failed the not-an-admin test,
--   and stayed visible to managers as an "Unknown" actor. Role matching here
--   is case-insensitive (lower() on both sides).
--
-- WHO SEES WHAT AFTER THIS
--   admin   -> every entry, unchanged
--   manager -> faculty entries only; manager, admin and unattributable rows
--              are outside their level
--   user    -> nothing, unchanged (faculty never had log access)
--
-- WHAT THIS DOES NOT DO
--   It hides entries from view. Nothing is deleted and nothing stops being
--   written — the admin's audit trail stays intact for whoever is accountable
--   for it. This is a read restriction and nothing else.
--
-- AFTER RUNNING
--   Sign out and back in. As Manager: the "Who's been active" summary and the
--   table list faculty rows only — no MANAGER badge, no "Unknown" actors, and
--   the admin's account is gone even when the log spelled its email with a
--   capital letter. As Admin: everything, unchanged.

-- ============================================================
-- 1. The role of an email's profile, as a SECURITY DEFINER function
-- ============================================================
-- Same reasoning as 003's is_admin_email(): a bare subquery on profiles inside
-- the policy would be evaluated under the caller's own permissions and so
-- subject to profiles' own RLS — coupling two policies together. SECURITY
-- DEFINER keeps the answer independent of who is asking.
--
-- STABLE, so the planner may call it once per row. lower() on both sides so
-- capitalisation differences in the stored email cannot re-classify a row.
-- LIMIT 1: emails are unique in practice; the first match is the answer.

CREATE OR REPLACE FUNCTION public.actor_role(p_email TEXT)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.profiles
    WHERE lower(email) IS NOT DISTINCT FROM lower(p_email)
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.actor_role(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actor_role(TEXT) TO authenticated;

-- ============================================================
-- 2. Replace the read policy — BEFORE dropping 003's helper
-- ============================================================
-- The old policy's body calls is_admin_email(), so Postgres refuses to drop
-- that function while the policy still depends on it (2BP01). Dropping the
-- policy first leaves the function with no dependents, and the new policy
-- below then uses actor_role() exclusively.
--
-- Both historical names are dropped: a database that applied 003 carries
-- "Scoped activity log visibility", one that never did may still carry
-- "Admins and managers can view activity logs". Either way this lands on
-- exactly one policy with this name and definition.

DROP POLICY IF EXISTS "Scoped activity log visibility" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins and managers can view activity logs" ON public.activity_logs;

-- 003's helper is superseded by actor_role() above; drop it so a database
-- cannot keep two answers to the same question around. IF EXISTS: a database
-- that never applied 003 has nothing to drop.

DROP FUNCTION IF EXISTS public.is_admin_email(TEXT);

CREATE POLICY "Scoped activity log visibility" ON public.activity_logs FOR SELECT
    USING (
        public.current_user_role() = 'admin'
        OR (
            public.current_user_role() = 'manager'
            AND user_email IS NOT NULL
            AND public.actor_role(user_email) = 'user'
        )
    );

-- ============================================================
-- 3. Verification — run each after applying
-- ============================================================
--
--   SELECT public.current_user_role() AS your_role;
--
-- As MANAGER: rows from managers, admins, or emails with no profile must all
-- be gone (expect zero for each):
--
--   SELECT count(*) AS expected_zero
--   FROM public.activity_logs
--   WHERE lower(user_email) = lower('admin@cqi.test');
--
--   SELECT count(*) AS expected_zero
--   FROM public.activity_logs
--   WHERE lower(user_email) = 'manager@cqi.test';
--
--   SELECT count(*) AS expected_zero
--   FROM public.activity_logs
--   WHERE user_email IS NULL;
--
-- Faculty rows must still be there (expect a positive number):
--
--   SELECT count(*) AS expected_positive
--   FROM public.activity_logs
--   WHERE lower(user_email) = 'user@cqi.test';
--
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'activity_logs';

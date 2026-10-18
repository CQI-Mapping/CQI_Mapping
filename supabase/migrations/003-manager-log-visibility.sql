-- Activity log: separate the admin and manager tiers
-- ============================================================
-- Run this in the Supabase SQL Editor. Safe to re-run: the policy is dropped
-- before it is created, because Postgres has no CREATE POLICY IF NOT EXISTS.
-- No table, column or row is touched.
--
-- WHY
--   The original policy put both supervisory roles on one tier:
--
--     USING (current_user_role() IN ('admin', 'manager'))
--
--   so a manager read every row, admin's included. Nothing was malfunctioning;
--   the policy simply had no hierarchy in it. Only the admin's own pages —
--   user accounts, role changes, deletions — actually fall outside a manager's
--   remit, and that is what this restores.
--
-- WHO SEES WHAT AFTER THIS
--   admin   -> every entry, unchanged
--   manager -> faculty and other managers, never an admin's
--   user    -> nothing, unchanged (faculty never had log access)
--
-- A row whose actor cannot be resolved (user_email is null, which happens when
-- log_activity() cannot match the caller to a profile) is hidden from managers:
-- an unattributable change is not something a manager can assess, so it is an
-- admin's problem, not theirs.
--
-- WHAT THIS DOES NOT DO
--   It hides entries from view. Nothing is deleted and nothing stops being
--   written — the admin's audit trail stays intact for whoever is accountable
--   for it. This is a read restriction and nothing else.
--
-- AFTER RUNNING
--   Sign out and back in. Sign in as Manager: admin@cqi.test is gone from the
--   log, the "Who's been active" summary and the user filter. Sign in as Admin:
--   everything, unchanged.

-- ============================================================
-- 1. The test the policy needs, as a SECURITY DEFINER function
-- ============================================================
-- A bare subquery on profiles inside the policy would be evaluated under the
-- caller's own permissions, so it would be subject to profiles' own RLS. That
-- works today (both roles may read all profiles) but couples two policies
-- together: tightening profiles' RLS later would silently change what this one
-- hides, with no error anywhere. SECURITY DEFINER makes the answer independent
-- of who is asking.
--
-- STABLE, so the planner may call it once per row rather than once per row per
-- candidate policy check.
--
-- The role is read from profiles at query time rather than stored on each row,
-- so visibility follows the actor's CURRENT role: promote a faculty member to
-- manager and their past entries become visible to managers; demote an admin
-- and their history becomes visible too. That was chosen over adding an
-- actor_role column written by every log insert (plus a backfill for existing
-- rows) because it stays correct as roles move.

CREATE OR REPLACE FUNCTION public.is_admin_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE role = 'admin'
          AND email IS NOT DISTINCT FROM p_email
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_email(TEXT) TO authenticated;

-- ============================================================
-- 2. Replace the read policy
-- ============================================================
-- Drop first: a re-run would otherwise fail on the duplicate policy name.

DROP POLICY IF EXISTS "Admins and managers can view activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Scoped activity log visibility" ON public.activity_logs;

CREATE POLICY "Scoped activity log visibility" ON public.activity_logs FOR SELECT
    USING (
        public.current_user_role() = 'admin'
        OR (
            public.current_user_role() = 'manager'
            AND user_email IS NOT NULL
            AND NOT public.is_admin_email(user_email)
        )
    );

-- Both DROP lines, not just one: this policy was briefly committed under each
-- name during development, so a database that applied either of them must be
-- able to move to this one.

-- ============================================================
-- 3. Verification — run each after applying
-- ============================================================
--
-- Your own role first:
--
--   SELECT public.current_user_role() AS your_role;
--     admin   -> admin
--     manager -> manager
--     user    -> user
--
-- As ADMIN: admin entries must be readable (expect a positive number):
--
--   SELECT count(*) AS expected_positive
--   FROM public.activity_logs
--   WHERE user_email = 'admin@cqi.test';
--
-- As MANAGER: the same query must return 0. If it does not, the old policy is
-- still in force — check that pg_policies reports exactly one SELECT policy on
-- activity_logs, named "Scoped activity log visibility".
--
--   SELECT count(*) AS expected_zero
--   FROM public.activity_logs
--   WHERE user_email = 'admin@cqi.test';
--
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'activity_logs';
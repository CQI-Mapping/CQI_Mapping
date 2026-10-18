-- =============================================================================
-- Migration 003 — hide the admin's activity from managers
-- =============================================================================
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- WHY
--   The original policy was:
--       USING (current_user_role() IN ('admin', 'manager'))
--   which put admin and manager on the same tier — a manager could read every
--   row, including the admin's. Changed so the two tiers are separated:
--
--     * admin   reads everything
--     * manager  reads everything except the admin's entries
--
--   What a manager still sees is unchanged in practice: the admin edits
--   programs, outcomes, courses and objectives, all of which a manager can edit
--   too. What goes away is the admin's use of their own pages — user accounts,
--   role changes, deletions.
--
-- A row whose actor cannot be resolved (user_email is null, which happens when
-- log_activity() cannot match the caller to a profile) is treated as the admin's
-- and hidden from managers: an unattributable change is not something a
-- manager can assess, so it is an admin's problem, not theirs.
--
-- NOTE ON WHAT THIS DOES NOT DO
--   It hides entries from view. It does not delete them, and it does not stop
--   them being written — the admin's audit trail is intact for whoever is
--   accountable for it.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The test the policy needs, as a SECURITY DEFINER function.
--
--    A bare subquery on profiles inside the policy would be evaluated under the
--    caller's own permissions, so it would be subject to profiles' own RLS. That
--    works today (both roles can read all profiles) but couples two policies
--    together: tightening profiles' RLS later would silently change what this
--    one hides, with no error anywhere. SECURITY DEFINER makes the answer
--    independent of who is asking.
--
--    STABLE, so the planner may call it once per row rather than per row per
--    candidate policy check.
-- ─────────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace the read policy.
--
--    DROP first: Postgres has no CREATE POLICY IF NOT EXISTS, so a re-run would
--    otherwise fail on the duplicate name.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and managers can view activity logs" ON public.activity_logs;

CREATE POLICY "Admins and managers can view activity logs" ON public.activity_logs FOR SELECT
    USING (
        public.current_user_role() = 'admin'
        OR (
            public.current_user_role() = 'manager'
            AND user_email IS NOT NULL
            AND NOT public.is_admin_email(user_email)
        )
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verification
--
--    As an admin, "can read all rows" should be true. Run these as the
--    authenticated user you are signed in as; the answers differ by role.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT public.current_user_role() AS your_role;
--   admin   -> admin
--   manager -> manager
--
-- SELECT count(*) FILTER (WHERE user_email IS NOT NULL) AS rows_with_actor
--        FROM public.activity_logs;
--   admin   -> every row
--   manager -> the same total MINUS every admin's entries
--
-- Confirm the helper agrees with the roles table:
-- SELECT email, public.is_admin_email(email) AS is_admin FROM public.profiles;
--   admin@cqi.test -> true
--   manager@cqi.test -> false
--   user@cqi.test -> false
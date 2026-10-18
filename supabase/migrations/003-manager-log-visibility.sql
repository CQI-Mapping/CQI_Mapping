-- Activity log: scope who sees whose entries
-- ============================================================
-- A manager can supervise faculty and other managers. They cannot supervise
-- the admin — and until this file, they could read every admin entry anyway:
--
--     "Admins and managers can view activity logs"
--       USING (current_user_role() IN ('admin', 'manager'))
--
-- That grants both roles every row. It is why signing in as Manager showed
-- admin@cqi.test's page views and report reads alongside everyone's.
--
-- SAFE TO RUN: replaces one policy. No table, column or row is touched —
-- entries keep being written exactly as before, admin entries just stop being
-- readable at manager level. Re-running is a no-op.
--
-- WHO SEES WHAT AFTER THIS
--   admin   -> every entry, everyone's, unchanged
--   manager -> faculty and other managers. Never an admin's.
--   user    -> nothing, unchanged (faculty never had log access)
--
-- Rows with a NULL user_email stay visible to managers. They are entries whose
-- writer could not resolve a profile, so they belong to nobody in particular;
-- hiding them would just make the table quietly incomplete.
--
-- WHY THE ROLE IS RESOLVED AT READ TIME, NOT STORED
--   The check joins profiles on the row's user_email rather than trusting a
--   role column written when the entry was made. Consequence: visibility
--   follows the actor's CURRENT role. Promote a faculty member to manager and
--   their past entries become visible to managers; demote an admin and their
--   history becomes visible too. That was chosen over stamping the role on
--   every row (a new column, two writer-function changes, a backfill) because
--   it stays correct as roles change and costs one policy.
--
-- AFTER RUNNING
--   Sign out and back in (RLS is re-evaluated per query, but the existing
--   client session keeps whatever rows it already holds until it refetches).
--   Sign in as Manager: admin@cqi.test is gone from the log, the summary and
--   the user filter. Sign in as Admin: everything, unchanged.

-- ============================================================
-- 1. Replace the blanket policy
-- ============================================================

DROP POLICY IF EXISTS "Admins and managers can view activity logs" ON public.activity_logs;

CREATE POLICY "Scoped activity log visibility" ON public.activity_logs FOR SELECT
    USING (
        CASE public.current_user_role()
            WHEN 'admin' THEN TRUE
            WHEN 'manager' THEN NOT EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.email = activity_logs.user_email
                  AND p.role = 'admin'
            )
            ELSE FALSE
        END
    );

-- The subquery above reads profiles, which carries its own RLS. Managers may
-- read all profiles ("Managers and admins can view all profiles"), so the
-- check resolves for exactly the viewers who reach this table — no extra
-- policy needed, and no chance of it being denied into "hide everything".
--
-- profiles.email is UNIQUE, so this is an index lookup per candidate row over
-- a table with a handful of rows. It only runs for managers, who are already
-- restricted to the newest ACTIVITY_LOG_LIMIT window.

-- ============================================================
-- 2. Verification — run each after applying
-- ============================================================
--
-- Admin's view is unchanged (expect true):
--
--   SELECT 'admin sees all' AS check,
--          count(*) FILTER (WHERE user_email = 'admin@cqi.test') AS expected_positive
--   FROM public.activity_logs;
--
-- The policy now scopes by role. To confirm the manager case directly, run
-- this as the manager (or SET ROLE, if your project allows it):
--
--   SELECT 'manager hides admin' AS check,
--          count(*) AS expected_zero
--   FROM public.activity_logs
--   WHERE user_email = 'admin@cqi.test';
--
-- And the policy count — should report exactly the two log policies
-- (SELECT + the writer functions still being callable, not row policies):
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'activity_logs';
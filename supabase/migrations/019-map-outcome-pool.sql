-- Generate Map reads the whole outcome pool; personal lists stay private
-- ============================================================
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
-- Rewrites an earlier draft of this migration number (019 gave role 'user'
-- whole-table read): if you ran that draft, this file takes its widening
-- back while keeping the map's full picture.
--
-- WHY
--   The Visualization's PO, PEO, SG and CMO branches grow off the CLO pool,
--   and that pool is owner-private since migration 009: a user who had not
--   written outcomes of their own generated a bare shell — the subject root
--   and curriculum hub, "CLO 0 · PO 0 · PEO 0 · SG 0 · CMO 0" — while admins
--   and managers on the same subject saw the full connected tree. The map
--   looked broken for faculty sessions.
--
--   The fix stops at the map on purpose. Outcomes are per-faculty work, so
--   the CLO page, the dashboard figures, the syllabus reader and the reports
--   keep reading their owner-scoped rows; only the Generate Map surface is
--   allowed to see the whole pool. Product-owner decision, 2026-11-06.
--
-- WHAT IT CHANGES
--   1. Base-table RLS unchanged — 009's owner-scoped faculty read. The
--      drop-then-create pair makes this safe in either history: whether the
--      earlier 019 draft widened role 'user' (it is closed again here) or
--      009's original policy still stands.
--   2. A SECURITY DEFINER function, public.map_outcome_pool(), returns every
--      row of the pool — archived included; the app filters actives — to the
--      signed-in curriculum roles: admin, manager, user. The Visualization
--      reads it instead of the table, so every role's map shows the same
--      connected tree. Unauthenticated callers, or profiles with any other
--      role, are refused.
--
-- AFTER RUNNING
--   No re-sign-in needed. The next Visualization load applies the pool, and
--   a faculty session's map fills like an admin's does.

-- 1 · Close the draft migration's whole-table read, if it was applied ------

DROP POLICY IF EXISTS "Users can read every course learning outcome"
    ON public.admin_course_learning_outcomes;

-- 2 · The baseline faculty read, exactly as migration 009 defined it ------
--    (Restored idempotently: if the draft migration removed it, it comes
--    back; if it never ran, this is the same rule re-stated.)

DROP POLICY IF EXISTS "Faculty see only their own course learning outcomes"
    ON public.admin_course_learning_outcomes;

CREATE POLICY "Faculty see only their own course learning outcomes"
    ON public.admin_course_learning_outcomes FOR SELECT
    USING (public.current_user_role() = 'user' AND owner_id = auth.uid());

-- 3 · The map's outcome pool ---------------------------------------------
--    SECURITY DEFINER reads the table as its owner (the table carries no
--    FORCE RLS), so the function sees every row. The role gate inside keeps
--    that reach scoped to the curriculum roles; COALESCE handles profiles
--    that are missing, so NULL cannot slip past the gate.

CREATE OR REPLACE FUNCTION public.map_outcome_pool()
RETURNS SETOF public.admin_course_learning_outcomes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(public.current_user_role()::text, '')
       NOT IN ('admin', 'manager', 'user') THEN
        RAISE EXCEPTION
            'map_outcome_pool is limited to signed-in curriculum roles';
    END IF;
    -- Same row order the lists use, so pickers and counts read alike.
    RETURN QUERY
        SELECT * FROM public.admin_course_learning_outcomes
        ORDER BY code ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.map_outcome_pool() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_outcome_pool() TO authenticated;

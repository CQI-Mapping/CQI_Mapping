-- =============================================================================
-- Manager access to Program, CHED Memo Orders, Strategic Goals and PEOs
-- =============================================================================
-- SAFE TO RUN ON A DATABASE THAT ALREADY HAS DATA.
--
-- Unlike supabase-schema.sql (which starts with DROP TABLE ... CASCADE and
-- therefore wipes every table), this migration touches policies only. DROP
-- POLICY removes a rule, never a row, so no table data is affected.
--
-- What it changes:
--   strategic_goals, program_educational_objectives and ched_memorandum_orders
--   were admin-only for ALL writes. Managers can now INSERT and UPDATE them.
--   DELETE stays admin-only.
--
--   (programs already had manager insert/update policies — no change needed.)
--
-- Postgres ORs together multiple permissive policies for the same command, so
-- these coexist with the existing "Admins can manage ..." FOR ALL policies:
-- an admin matches both, a manager matches only the new ones.
--
-- Every statement is guarded with DROP POLICY IF EXISTS, so the migration is
-- idempotent — running it twice is a no-op rather than an error.
-- =============================================================================

-- ---- STRATEGIC GOALS -------------------------------------------------------

DROP POLICY IF EXISTS "Managers and admins can create strategic_goals" ON public.strategic_goals;
DROP POLICY IF EXISTS "Managers and admins can update strategic_goals" ON public.strategic_goals;
DROP POLICY IF EXISTS "Admins can delete strategic_goals" ON public.strategic_goals;

-- Managers may create/edit/archive strategic goals; only admins delete them.
CREATE POLICY "Managers and admins can create strategic_goals" ON public.strategic_goals FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update strategic_goals" ON public.strategic_goals FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete strategic_goals" ON public.strategic_goals FOR DELETE
    USING (public.current_user_role() = 'admin');

-- ---- PROGRAM EDUCATIONAL OBJECTIVES ---------------------------------------

DROP POLICY IF EXISTS "Managers and admins can create program_educational_objectives" ON public.program_educational_objectives;
DROP POLICY IF EXISTS "Managers and admins can update program_educational_objectives" ON public.program_educational_objectives;
DROP POLICY IF EXISTS "Admins can delete program_educational_objectives" ON public.program_educational_objectives;

-- Managers may create/edit/archive PEOs; only admins delete them.
CREATE POLICY "Managers and admins can create program_educational_objectives" ON public.program_educational_objectives FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update program_educational_objectives" ON public.program_educational_objectives FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete program_educational_objectives" ON public.program_educational_objectives FOR DELETE
    USING (public.current_user_role() = 'admin');

-- ---- CHED MEMORANDUM ORDERS -----------------------------------------------

DROP POLICY IF EXISTS "Managers and admins can create ched_memorandum_orders" ON public.ched_memorandum_orders;
DROP POLICY IF EXISTS "Managers and admins can update ched_memorandum_orders" ON public.ched_memorandum_orders;
DROP POLICY IF EXISTS "Admins can delete ched_memorandum_orders" ON public.ched_memorandum_orders;

-- Managers may create/edit/archive CHED memo orders; only admins delete them.
CREATE POLICY "Managers and admins can create ched_memorandum_orders" ON public.ched_memorandum_orders FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update ched_memorandum_orders" ON public.ched_memorandum_orders FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete ched_memorandum_orders" ON public.ched_memorandum_orders FOR DELETE
    USING (public.current_user_role() = 'admin');

-- =============================================================================
-- Verify with (read-only, safe to run any time):
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('strategic_goals',
--                       'program_educational_objectives',
--                       'ched_memorandum_orders')
--   ORDER BY tablename, cmd, policyname;
--
-- Expect each table to list a manager-capable INSERT policy, a manager-capable
-- UPDATE policy, and an admin-only DELETE policy.
-- =============================================================================
-- Users (faculty) read every Course Learning Outcome
-- ============================================================
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- WHY
--   Migration 009 made admin_course_learning_outcomes owner-private so each
--   faculty user would see only their own rows. That rule reached further
--   than the CLO page: the Visualization (Generate Map) hangs its PO, PEO,
--   SG, and CMO branches off the CLO pool, so a user who had not written any
--   outcomes of their own generated a bare shell — the subject root and the
--   curriculum hub, "CLO 0 · PO 0 · PEO 0 · SG 0 · CMO 0" — while admins and
--   managers on the same subject saw the full connected tree. The empty map
--   looked broken, and the shared curriculum picture it draws from is not
--   per-faculty work: outcomes live on subjects every faculty member reads.
--
-- WHAT IT CHANGES
--   The role-'user' SELECT policy widens from owner-only to the whole table,
--   exactly like the manager policy since 009. Every other rule stays as is:
--   admins keep FOR ALL; INSERT still stamps and requires the creator;
--   UPDATE stays owner-scoped; DELETE for non-admins was already removed by
--   migration 018.
--
--   Owner privacy is retired by decision of the product owner: the knock-on
--   effect is intended — the faculty CLO page, dashboard figures, chips,
--   syllabus reader, and reports now also show every faculty member's
--   outcomes, as managers already could.
--
-- AFTER RUNNING
--   No re-sign-in needed; the next page load applies the new visibility.
--   The map for a user session fills with the same connected tree admins
--   and managers already see.

-- Replace the owner-scoped read with a full-pool read for role 'user'.

DROP POLICY IF EXISTS "Faculty see only their own course learning outcomes"
    ON public.admin_course_learning_outcomes;

CREATE POLICY "Users can read every course learning outcome"
    ON public.admin_course_learning_outcomes FOR SELECT
    USING (public.current_user_role() = 'user');

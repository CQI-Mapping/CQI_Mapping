-- 018 — Archiving is removal for faculty: no DELETE on their outcomes
--
-- The faculty CLO page previously offered a Delete button on archived rows
-- plus a matching DELETE policy ("Faculty delete their own course learning
-- outcomes", migration 009). Archived outcomes are history — the dashboard
-- and the audit trail read them — so removing one outright is now an
-- administrator's action only, the same settlement reached for accounts (008)
-- and manager archive reconciliation (015).
--
-- Faculty keep INSERT and UPDATE: creating outcomes and flipping a row's
-- status (archive / restore) is their everyday work, so "only restore"
-- survives intact. Admins keep full rights through the FOR ALL policy from
-- migration 009.

DROP POLICY IF EXISTS "Faculty delete their own course learning outcomes"
    ON public.admin_course_learning_outcomes;

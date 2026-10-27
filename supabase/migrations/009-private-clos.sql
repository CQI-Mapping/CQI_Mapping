-- Private Course Learning Outcomes: each faculty user owns their own CLOs
-- ============================================================
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- WHY
--   admin_course_learning_outcomes was a shared pool: every authenticated
--   user coul d read (and edit) every row, so a brand-new account created
--   by the manager opened the Course Learning Outcomes page and saw
--   everything the other users had written. Outcomes are per-faculty work,
--   so they are now owned by their creator.
--
-- WHAT IT CHANGES
--   1. admin_course_learning_outcomes.owner_id — the auth user who created
--      the row (NULL for rows that predate ownership).
--   2. Ownership backfill from the audit log: every `clo.created` entry
--      carries the row id and the actor's email, so existing rows are
--      attributed to whoever logged creating them. Rows with no matching
--      log entry stay unowned.
--   3. The unique index widens from (code, course) to (code, course,
--      owner_id): two faculty members may both define CLO1 for IT101
--      without colliding, while one user still cannot duplicate a code
--      for the same course.
--   4. RLS:
--        * admins keep full control (unchanged FOR ALL policy);
--        * managers keep reading everything — oversight needs the whole
--          picture (dashboards, Generate Map, View Syllabus, reports);
--        * faculty SELECT / UPDATE / DELETE only rows whose owner is
--          themselves. Unowned legacy rows are admin/manager-visible.
--      Creation is stamped with the creator's id (the app service does
--      this), so a row can never be smuggled in owned by someone else.
--
--   Faculty-side effects to expect:
--        * a new user starts with an empty Course Learning Outcomes page
--          and sees nobody else's outcomes anywhere — page, dashboard
--          count, Generate Map, reports;
--        * the Delete button on their own rows now actually works (there
--          was no DELETE policy for non-admins before, so it always
--          failed with a permission error);
--        * existing rows stay visible to the faculty member the backfill
--          attributed them to.
--
-- OPTIONAL CLEANUP
--   Unowned rows (no clo.created entry in the log) are hidden from
--   faculty. If such a row belongs to someone, hand it over:
--
--     UPDATE public.admin_course_learning_outcomes c
--     SET owner_id = p.id
--     FROM public.profiles p
--     WHERE lower(p.email) = lower('their@email.here')
--       AND c.owner_id IS NULL;
--
-- AFTER RUNNING
--   No re-sign-in needed; the next page load applies the new visibility.

-- 1 · Ownership column ----------------------------------------------------

ALTER TABLE public.admin_course_learning_outcomes
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2 · Attribute legacy rows from the audit log ----------------------------
-- The earliest clo.created per row wins (DISTINCT ON keeps the first).

UPDATE public.admin_course_learning_outcomes c
SET owner_id = owner.uid
FROM (
    SELECT DISTINCT ON (l.details->>'entity_id')
           l.details->>'entity_id' AS clo_id,
           p.id                    AS uid
    FROM public.activity_logs l
    JOIN public.profiles p ON lower(p.email) = lower(l.user_email)
    WHERE l.action = 'clo.created'
      AND l.details->>'entity_id' IS NOT NULL
    ORDER BY l.details->>'entity_id', l.created_at ASC
) owner
WHERE c.id::text = owner.clo_id
  AND c.owner_id IS NULL;

-- 3 · Uniqueness becomes per-owner ----------------------------------------

-- Legacy single-column unique constraint from the earliest schema, if a
-- database still carries it (same cleanup the consolidated schema does).
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_course_learning_outcomes_code_key') THEN
        ALTER TABLE public.admin_course_learning_outcomes DROP CONSTRAINT admin_course_learning_outcomes_code_key;
    END IF;
END $$;

DROP INDEX IF EXISTS admin_course_learning_outcomes_code_course_unique;
CREATE UNIQUE INDEX IF NOT EXISTS admin_course_learning_outcomes_code_course_owner_unique
    ON public.admin_course_learning_outcomes (code, course, owner_id);

-- 4 · RLS: owner-scoped faculty, full oversight for admin and manager ------

DROP POLICY IF EXISTS "Authenticated users can read admin_course_learning_outcomes" ON public.admin_course_learning_outcomes;
DROP POLICY IF EXISTS "Admins can manage admin_course_learning_outcomes" ON public.admin_course_learning_outcomes;
DROP POLICY IF EXISTS "Authenticated users can create admin_course_learning_outcomes" ON public.admin_course_learning_outcomes;
DROP POLICY IF EXISTS "Authenticated users can update admin_course_learning_outcomes" ON public.admin_course_learning_outcomes;

CREATE POLICY "Admins can manage admin_course_learning_outcomes" ON public.admin_course_learning_outcomes FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Managers can read every course learning outcome" ON public.admin_course_learning_outcomes FOR SELECT
    USING (public.current_user_role() = 'manager');

CREATE POLICY "Faculty see only their own course learning outcomes" ON public.admin_course_learning_outcomes FOR SELECT
    USING (public.current_user_role() = 'user' AND owner_id = auth.uid());

CREATE POLICY "Outcomes are created owned by their creator" ON public.admin_course_learning_outcomes FOR INSERT
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Faculty edit only their own course learning outcomes" ON public.admin_course_learning_outcomes FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- The page's Delete button previously hit a wall for non-admins (no DELETE
-- policy existed); an owner may now remove their own row, admins keep the
-- global right through the FOR ALL policy above.
CREATE POLICY "Faculty delete their own course learning outcomes" ON public.admin_course_learning_outcomes FOR DELETE
    USING (owner_id = auth.uid());

-- =============================================================================
-- CQI Monitoring System — Schema Update: Course Prerequisites
-- =============================================================================
-- Run this in Supabase SQL Editor. Safe to run on your existing schema —
-- it does NOT drop or touch any existing tables/data.
--
-- What this adds:
--   1. course_prerequisites — a join table so a course can have MULTIPLE
--      prerequisites (many-to-many, self-referencing on `courses`). Powers
--      the D3.js curriculum network diagram's links.
--   2. Widens the `courses` INSERT/UPDATE policies so Faculty (role 'user')
--      can add/edit courses too, alongside Manager and Admin.
--      (DELETE stays admin-only — unchanged from your original schema.)
-- =============================================================================

-- ============================================================
-- COURSE PREREQUISITES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.course_prerequisites (
    course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    prerequisite_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, prerequisite_id),
    CONSTRAINT course_prerequisites_no_self_reference
        CHECK (course_id <> prerequisite_id)
);

CREATE INDEX IF NOT EXISTS idx_course_prereq_course_id
    ON public.course_prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_course_prereq_prerequisite_id
    ON public.course_prerequisites(prerequisite_id);

ALTER TABLE public.course_prerequisites ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can view the prerequisite graph
CREATE POLICY "Authenticated users can read course_prerequisites"
    ON public.course_prerequisites FOR SELECT
    USING (auth.role() = 'authenticated');

-- Admin, Manager, and Faculty (user) can all add prerequisite links
CREATE POLICY "Admin, manager, and user can create course_prerequisites"
    ON public.course_prerequisites FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'user'));

-- Admin, Manager, and Faculty (user) can all remove prerequisite links
CREATE POLICY "Admin, manager, and user can delete course_prerequisites"
    ON public.course_prerequisites FOR DELETE
    USING (public.current_user_role() IN ('admin', 'manager', 'user'));

-- ============================================================
-- WIDEN COURSES POLICIES — Faculty (user) can now add/edit courses too
-- ============================================================

DROP POLICY IF EXISTS "Managers and admins can create courses" ON public.courses;
CREATE POLICY "Admin, manager, and user can create courses"
    ON public.courses FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'user'));

DROP POLICY IF EXISTS "Managers and admins can update courses" ON public.courses;
CREATE POLICY "Admin, manager, and user can update courses"
    ON public.courses FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager', 'user'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'user'));

-- "Admins can delete courses" policy is untouched — deletion stays admin-only.
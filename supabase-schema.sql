
-- =============================================================================
-- CQI Monitoring System — Database Schema
-- =============================================================================
-- This file defines all tables, triggers, and RLS policies for the
-- CQI (Continuous Quality Improvement) Mapping application.
--
-- Tables:
--   profiles                      — user accounts (linked to auth.users)
--   resources                     — curriculum records (managed by manager/admin)
--   activity_logs                 — system-wide action history
--   programs / courses            — academic programs and their courses
--   program_outcomes              — program outcomes tied to programs
--   course_learning_outcomes      — CLOs tied to courses
--   strategic_goals               — institutional strategic goals (admin)
--   admin_program_outcomes        — standalone admin-managed PO list
--   program_educational_objectives— PEOs (admin)
--   admin_course_learning_outcomes— standalone admin-managed CLO list
--   ched_memorandum_orders        — CHED memo orders (admin)
-- =============================================================================


-- Cleanup
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.resources CASCADE;
DROP TABLE IF EXISTS public.course_learning_outcomes CASCADE;
DROP TABLE IF EXISTS public.program_outcomes CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.programs CASCADE;
DROP TABLE IF EXISTS public.strategic_goals CASCADE;
DROP TABLE IF EXISTS public.admin_program_outcomes CASCADE;
DROP TABLE IF EXISTS public.program_educational_objectives CASCADE;
DROP TABLE IF EXISTS public.admin_course_learning_outcomes CASCADE;
DROP TABLE IF EXISTS public.ched_memorandum_orders CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

-- ============================================================
-- ENUM + TABLES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user');

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      description TEXT,
      units INTEGER CHECK (units >= 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CQI curriculum domain: academic programs, their courses, program outcomes
-- (PO), and course learning outcomes (CLO). These feed the CLO/PO mapping
-- matrix and the CQI analytics dashboards in later phases.

CREATE TABLE public.programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
      curriculum_id UUID REFERENCES public.resources(id) ON DELETE SET NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      prerequisite TEXT NOT NULL DEFAULT '',
      corequisite TEXT NOT NULL DEFAULT '',
      credit_lecture INTEGER NOT NULL DEFAULT 0 CHECK (credit_lecture >= 0 AND credit_lecture <= 3),
      credit_laboratory INTEGER NOT NULL DEFAULT 0 CHECK (credit_laboratory >= 0 AND credit_laboratory <= 3),
      units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (program_id, code)
  );

CREATE TABLE public.program_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (program_id, code)
);

CREATE TABLE public.course_learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, code)
);

CREATE TABLE public.strategic_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    title TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHED MEMORANDUM ORDERS (created before admin_program_outcomes so the
-- Program Outcome -> CMO link can be declared inline below).
-- codes may repeat IF the title differs; the exact (code, title) pair is unique.
CREATE TABLE public.ched_memorandum_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (code, title)
);

-- PROGRAM OUTCOMES (standalone admin list)
-- cmo_id: optional link to a CHED Memorandum Order, set when the outcome's
-- alignment references a CMO that exists.
-- PROGRAM EDUCATIONAL OBJECTIVES
CREATE TABLE public.program_educational_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_program_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    cmo_id UUID REFERENCES public.ched_memorandum_orders(id) ON DELETE SET NULL,
    peo_id UUID REFERENCES public.program_educational_objectives(id) ON DELETE SET NULL,
    peo_text TEXT,
    sg_id UUID REFERENCES public.strategic_goals(id) ON DELETE SET NULL,
    sg_text TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Same Code is allowed if any of the 5 fields differs:
-- Code, Description (title), CMO Alignment (cmo_id+description), PEO Alignment (peo_text/peo_id), SG Alignment (sg_text/sg_id).
-- Only an exact duplicate across ALL five is rejected.
-- Drop legacy constraints/indexes then create the broad unique index.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_program_outcomes_code_key') THEN
        ALTER TABLE public.admin_program_outcomes DROP CONSTRAINT admin_program_outcomes_code_key;
    END IF;
    DROP INDEX IF EXISTS public.admin_program_outcomes_code_cmo_unique;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS admin_program_outcomes_all5_unique
    ON public.admin_program_outcomes (
        code,
        title,
        COALESCE(description, ''),
        COALESCE(cmo_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(peo_text, ''),
        COALESCE(peo_id::text, ''),
        COALESCE(sg_text, ''),
        COALESCE(sg_id::text, '')
    );

-- Backfill for existing rows after adding cmo_id:
-- UPDATE public.admin_program_outcomes a
-- SET cmo_id = c.id
-- FROM public.ched_memorandum_orders c
-- WHERE a.cmo_id IS NULL AND a.description ILIKE '%' || c.code || '%';

-- COURSE LEARNING OUTCOMES (standalone admin list)
CREATE TABLE public.admin_course_learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    course TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHED MEMORANDUM ORDERS
-- (definition is above, before admin_program_outcomes)

-- ============================================================
-- HELPER: current user's role (bypasses RLS, avoids recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_program_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_educational_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_course_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ched_memorandum_orders ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Managers and admins can view all profiles" ON public.profiles FOR SELECT
    USING (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- RESOURCES
CREATE POLICY "Authenticated users can read resources" ON public.resources FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Managers and admins can create resources" ON public.resources FOR INSERT
    WITH CHECK (
        public.current_user_role() IN ('admin', 'manager')
        AND created_by = auth.uid()
    );

CREATE POLICY "Managers and admins can update resources" ON public.resources FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete resources" ON public.resources FOR DELETE
    USING (public.current_user_role() = 'admin');

-- PROGRAMS
CREATE POLICY "Authenticated users can read programs" ON public.programs FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Managers and admins can create programs" ON public.programs FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update programs" ON public.programs FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete programs" ON public.programs FOR DELETE
    USING (public.current_user_role() = 'admin');

-- COURSES
CREATE POLICY "Authenticated users can read courses" ON public.courses FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Managers and admins can create courses" ON public.courses FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update courses" ON public.courses FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete courses" ON public.courses FOR DELETE
    USING (public.current_user_role() = 'admin');

-- PROGRAM OUTCOMES
CREATE POLICY "Authenticated users can read program outcomes" ON public.program_outcomes FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Managers and admins can create program outcomes" ON public.program_outcomes FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update program outcomes" ON public.program_outcomes FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete program outcomes" ON public.program_outcomes FOR DELETE
    USING (public.current_user_role() = 'admin');

-- COURSE LEARNING OUTCOMES
CREATE POLICY "Authenticated users can read course learning outcomes" ON public.course_learning_outcomes FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Managers and admins can create course learning outcomes" ON public.course_learning_outcomes FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update course learning outcomes" ON public.course_learning_outcomes FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete course learning outcomes" ON public.course_learning_outcomes FOR DELETE
    USING (public.current_user_role() = 'admin');

-- ACTIVITY LOGS
-- No INSERT policy: rows are written server-side only, via the SECURITY DEFINER
-- functions log_activity(p_action) and record_login_event(...), so users cannot
-- forge log entries with someone else's email.
CREATE POLICY "Admins and managers can view activity logs" ON public.activity_logs FOR SELECT
    USING (public.current_user_role() IN ('admin', 'manager'));

-- STRATEGIC GOALS
CREATE POLICY "Authenticated users can read strategic_goals" ON public.strategic_goals FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage strategic_goals" ON public.strategic_goals FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- ADMIN PROGRAM OUTCOMES
CREATE POLICY "Authenticated users can read admin_program_outcomes" ON public.admin_program_outcomes FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage admin_program_outcomes" ON public.admin_program_outcomes FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- Managers may create and edit program outcomes but not delete them.
CREATE POLICY "Managers and admins can create admin_program_outcomes" ON public.admin_program_outcomes FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update admin_program_outcomes" ON public.admin_program_outcomes FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

-- PROGRAM EDUCATIONAL OBJECTIVES
CREATE POLICY "Authenticated users can read program_educational_objectives" ON public.program_educational_objectives FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage program_educational_objectives" ON public.program_educational_objectives FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- ADMIN COURSE LEARNING OUTCOMES
CREATE POLICY "Authenticated users can read admin_course_learning_outcomes" ON public.admin_course_learning_outcomes FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage admin_course_learning_outcomes" ON public.admin_course_learning_outcomes FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- All roles may create and edit course learning outcomes; only admins delete them.
CREATE POLICY "Authenticated users can create admin_course_learning_outcomes" ON public.admin_course_learning_outcomes FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'user'));

CREATE POLICY "Authenticated users can update admin_course_learning_outcomes" ON public.admin_course_learning_outcomes FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager', 'user'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'user'));

-- CHED MEMORANDUM ORDERS
CREATE POLICY "Authenticated users can read ched_memorandum_orders" ON public.ched_memorandum_orders FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage ched_memorandum_orders" ON public.ched_memorandum_orders FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- ============================================================
-- LOGIN AUDIT
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_login_event(
    p_email TEXT,
    p_success BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.activity_logs (user_email, action)
    VALUES (
        p_email,
        CASE WHEN p_success THEN 'auth.login' ELSE 'auth.login_failed' END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_event(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_event(TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================================
-- ACTIVITY LOG WRITER
-- SECURITY DEFINER: stamps the caller's real email from their JWT,
-- so the client never supplies (or spoofs) user_email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_activity(p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    IF p_action IS NULL OR btrim(p_action) = '' THEN
        RAISE EXCEPTION 'action is required';
    END IF;

    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

    INSERT INTO public.activity_logs (user_email, action)
    VALUES (v_email, btrim(p_action));
END;
$$;

REVOKE ALL ON FUNCTION public.log_activity(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_activity(TEXT) TO authenticated;

-- ============================================================
-- ROLE RESTORE / FIRST ADMIN BOOTSTRAP
-- Called by the app on every sign-in. Restores demo account roles
-- and promotes the first user to admin when no admin exists.
-- SECURITY DEFINER so it bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_demo_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_email text;
    v_current public.user_role;
    v_role public.user_role;
    v_has_admin boolean;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT email, role INTO v_email, v_current
    FROM public.profiles WHERE id = v_uid;
    IF v_email IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_current <> 'user' THEN
        RETURN v_current;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') INTO v_has_admin;

    v_role := CASE v_email
        WHEN 'admin@cqi.test' THEN
            CASE WHEN v_has_admin THEN 'user'::public.user_role ELSE 'admin'::public.user_role END
        WHEN 'manager@cqi.test' THEN 'manager'::public.user_role
        WHEN 'user@cqi.test' THEN 'user'::public.user_role
        ELSE
            CASE WHEN v_has_admin THEN 'user'::public.user_role ELSE 'admin'::public.user_role END
    END;

    IF v_role <> v_current THEN
        UPDATE public.profiles SET role = v_role WHERE id = v_uid;
    END IF;

    RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_demo_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_demo_role() TO authenticated;

-- ============================================================
-- PROFILE RESTORE (not seed data)
-- Recreate profiles for EXISTING auth users (the DROP above wiped
-- them) and restore the demo roles, so admin/manager/user land on
-- the right dashboard after a schema re-run. New signups are still
-- handled by handle_new_user. ON CONFLICT DO NOTHING keeps any role
-- an admin deliberately changed.
-- ============================================================

INSERT INTO public.profiles (id, email, full_name, role)
SELECT
    u.id,
    u.email,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        split_part(u.email, '@', 1)
    ),
    CASE u.email
        WHEN 'admin@cqi.test'   THEN 'admin'::public.user_role
        WHEN 'manager@cqi.test' THEN 'manager'::public.user_role
        ELSE 'user'::public.user_role
    END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

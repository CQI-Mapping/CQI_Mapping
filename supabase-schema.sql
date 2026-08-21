
-- =============================================================================
-- CQI Monitoring System — Database Schema
-- =============================================================================
-- Tables:
--   profiles                 — user accounts (linked to auth.users)
--   programs / courses       — academic programs and their courses
--   program_outcomes         — program outcomes tied to programs
--   course_learning_outcomes — CLOs tied to courses
--   activity_logs            — system-wide action history
-- =============================================================================


-- Cleanup
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.course_learning_outcomes CASCADE;
DROP TABLE IF EXISTS public.program_outcomes CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.programs CASCADE;
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
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 3 CHECK (units > 0),
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

CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

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
CREATE POLICY "Authenticated users can insert activity logs" ON public.activity_logs FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins and managers can view activity logs" ON public.activity_logs FOR SELECT
    USING (public.current_user_role() IN ('admin', 'manager'));

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
-- SEED DATA — restore profiles for existing auth users
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

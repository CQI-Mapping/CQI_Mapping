-- ============================================================
-- ROLE-BASED STARTER — Supabase schema
-- Roles: admin / manager / user
--
-- SETUP (run this whole file in the Supabase SQL Editor):
--   1. Run this script to create tables, RLS, triggers, and seed data.
--   2. Create an auth user in Dashboard > Authentication > Users
--      (any email/password). The trigger auto-creates their profile
--      with role 'user'.
--   3. Promote yourself to admin by replacing your-email below:
--        UPDATE public.profiles SET role = 'admin'
--        WHERE email = 'your-email';
--   4. (Optional) For the admin "create user" feature, also set
--      VITE_SUPABASE_SERVICE_ROLE_KEY in .env — grab it from the
--      project Settings > API > service_role (kept secret).
--
-- ROLES & WHAT THEY CAN DO
--   admin   : manage users (roles), create users, manage resources,
--             view audit log, view all profiles
--   manager : manage resources (create/edit/archive), view all
--             profiles (directory), view audit log
--   user    : view resources, view/edit own profile
-- ============================================================

-- Cleanup
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.resources CASCADE;
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
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT,
    action TEXT NOT NULL,
    details JSONB,
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
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

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

-- AUDIT LOG
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins and managers can view audit logs" ON public.audit_log FOR SELECT
    USING (public.current_user_role() IN ('admin', 'manager'));

-- ============================================================
-- LOGIN AUDIT
-- Records successful and failed sign-ins. SECURITY DEFINER so
-- it can insert an audit entry even when there is no session
-- (e.g. a failed login attempt).
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
    INSERT INTO public.audit_log (user_email, action, details)
    VALUES (
        p_email,
        CASE WHEN p_success THEN 'auth.login' ELSE 'auth.login_failed' END,
        jsonb_build_object('reason', p_reason)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_event(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_event(TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO public.resources (title, description, status) VALUES
    ('Curriculum mapping guide', 'How courses map to program outcomes in this CQI monitoring system.', 'active'),
    ('Outcomes alignment matrix', 'CLO/PO alignment reference for program outcomes across the curriculum.', 'active'),
    ('Sample archived course data', 'An example of an archived curriculum record only admins can delete.', 'archived');

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
DROP TABLE IF EXISTS public.clo_po_matrix CASCADE;
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

-- CLO/PO matrix: strength (1-3) of each course learning outcome's
-- contribution to each program outcome of the same program. One row per
-- (CLO, PO) pair; blank cells have no row. The BEFORE trigger keeps data
-- consistent by rejecting pairs whose CLO course and PO are in different
-- programs.

CREATE TABLE public.clo_po_matrix (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clo_id UUID NOT NULL REFERENCES public.course_learning_outcomes(id) ON DELETE CASCADE,
    po_id UUID NOT NULL REFERENCES public.program_outcomes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (clo_id, po_id)
);

CREATE OR REPLACE FUNCTION public.validate_clo_po_program()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clo_program UUID;
    v_po_program UUID;
BEGIN
    SELECT c.program_id INTO v_clo_program
    FROM public.course_learning_outcomes clo
    JOIN public.courses c ON c.id = clo.course_id
    WHERE clo.id = NEW.clo_id;

    SELECT program_id INTO v_po_program
    FROM public.program_outcomes
    WHERE id = NEW.po_id;

    IF v_clo_program IS DISTINCT FROM v_po_program THEN
        RAISE EXCEPTION 'CLO and PO must belong to the same program';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clo_po_program_match ON public.clo_po_matrix;
CREATE TRIGGER trg_clo_po_program_match
    BEFORE INSERT OR UPDATE ON public.clo_po_matrix
    FOR EACH ROW EXECUTE FUNCTION public.validate_clo_po_program();

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
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clo_po_matrix ENABLE ROW LEVEL SECURITY;

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

-- CLO/PO MATRIX
CREATE POLICY "Authenticated users can read clo_po_matrix" ON public.clo_po_matrix FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Managers and admins can create clo_po_matrix" ON public.clo_po_matrix FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Managers and admins can update clo_po_matrix" ON public.clo_po_matrix FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'manager'))
    WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete clo_po_matrix" ON public.clo_po_matrix FOR DELETE
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

-- CQI curriculum seed: sample programs, courses, program outcomes (PO),
-- and course learning outcomes (CLO) to demo the admin Curriculum tabs.

INSERT INTO public.programs (code, name, description, status) VALUES
    ('BSIT', 'Bachelor of Science in Information Technology', 'Information technology curriculum for program outcomes alignment.', 'active'),
    ('BSCS', 'Bachelor of Science in Computer Science', 'Computer science curriculum for program outcomes alignment.', 'active');

INSERT INTO public.courses (program_id, code, title, units)
SELECT p.id, c.code, c.title, c.units
FROM (VALUES
    ('BSIT', 'IT101', 'Introduction to Computing', 3),
    ('BSIT', 'IT102', 'Computer Programming 1', 3),
    ('BSIT', 'IT210', 'Database Systems', 3),
    ('BSCS', 'CS101', 'Fundamentals of Computing', 3),
    ('BSCS', 'CS120', 'Object-Oriented Programming', 3)
) AS c(program_code, code, title, units)
JOIN public.programs p ON p.code = c.program_code;

INSERT INTO public.program_outcomes (program_id, code, description)
SELECT p.id, po.code, po.description
FROM (VALUES
    ('BSIT', 'PO1', 'Apply knowledge of computing, science, and mathematics appropriate to the discipline.'),
    ('BSIT', 'PO2', 'Analyze complex problems and identify computing requirements.'),
    ('BSIT', 'PO3', 'Design, implement, and evaluate computing-based solutions.'),
    ('BSIT', 'PO4', 'Function effectively as a member or leader of a development team.'),
    ('BSIT', 'PO5', 'Communicate effectively with a range of audiences.'),
    ('BSCS', 'PO1', 'Analyze a complex computing problem and apply principles of computing.'),
    ('BSCS', 'PO2', 'Design and implement algorithms and computing solutions.'),
    ('BSCS', 'PO3', 'Apply computer science theory and software development fundamentals.')
) AS po(program_code, code, description)
JOIN public.programs p ON p.code = po.program_code;

INSERT INTO public.course_learning_outcomes (course_id, code, description)
SELECT c.id, clo.code, clo.description
FROM (VALUES
    ('IT101', 'CLO1', 'Explain the fundamental concepts of computing and information technology.'),
    ('IT101', 'CLO2', 'Demonstrate basic skills in using computer hardware and software.'),
    ('IT101', 'CLO3', 'Describe the components of a computer system.'),
    ('IT101', 'CLO4', 'Identify ethical issues in the use of information technology.'),
    ('IT102', 'CLO1', 'Design algorithms to solve simple programming problems.'),
    ('IT102', 'CLO2', 'Implement programs using a high-level programming language.'),
    ('IT102', 'CLO3', 'Test and debug simple programs.'),
    ('CS101', 'CLO1', 'Describe the roles of computing in society.'),
    ('CS101', 'CLO2', 'Identify the main components of a computing system.')
) AS clo(course_code, code, description)
JOIN public.courses c ON c.code = clo.course_code;

-- CLO/PO matrix seed: sample strength (1-3) of each CLO's contribution to
-- the program outcomes of the same program.

INSERT INTO public.clo_po_matrix (clo_id, po_id, level)
SELECT clo.id, po.id, m.level
FROM (VALUES
    ('BSIT', 'IT101', 'CLO1', 'PO1', 3),
    ('BSIT', 'IT101', 'CLO2', 'PO3', 2),
    ('BSIT', 'IT101', 'CLO3', 'PO1', 2),
    ('BSIT', 'IT101', 'CLO4', 'PO4', 1),
    ('BSIT', 'IT102', 'CLO1', 'PO1', 2),
    ('BSIT', 'IT102', 'CLO2', 'PO3', 3),
    ('BSIT', 'IT102', 'CLO3', 'PO3', 2),
    ('BSCS', 'CS101', 'CLO1', 'PO1', 1),
    ('BSCS', 'CS101', 'CLO2', 'PO2', 2)
) AS m(program_code, course_code, clo_code, po_code, level)
JOIN public.programs p ON p.code = m.program_code
JOIN public.courses c ON c.program_id = p.id AND c.code = m.course_code
JOIN public.course_learning_outcomes clo ON clo.course_id = c.id AND clo.code = m.clo_code
JOIN public.program_outcomes po ON po.program_id = p.id AND po.code = m.po_code;

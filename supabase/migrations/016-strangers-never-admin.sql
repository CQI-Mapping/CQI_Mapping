-- ============================================================
-- 016: Strangers can never sign their way into admin
--
-- Run in the Supabase SQL editor (service role context).
-- Idempotent — safe to re-run. No table changes.
--
-- WHY
--   sync_demo_role() restored demo roles AND promoted the FIRST unknown
--   signer-in to admin whenever the system had no admin yet. Combined with
--   the Google provider accepting any personal Gmail (until allowed email
--   domains is configured in the dashboard), the first random person to
--   press the button could become administrator of the whole system.
--
-- WHAT IT CHANGES
--   * The unknown-email branch now always returns 'user'. Only the three
--     fixture emails keep their bootstrap:
--       admin@cqi.test   -> admin  (only while no admin exists)
--       manager@cqi.test -> manager
--       user@cqi.test    -> user
--   * Nothing else moves: a deliberately-promoted school admin keeps the
--     role, and live school accounts are promoted through Users & Accounts
--     by an existing admin.
--
-- ALSO (app side, not in this file)
--   App.tsx now refuses any Google session whose email is not @nbsc.edu.ph
--   — signed out with a notice on the Login screen — while allowed email
--   domains: nbsc.edu.ph (Authentication -> Sign In / Up) stays the primary
--   auth-layer gate. Enable it on the project if it is not set yet.
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
        -- Everyone else lands as 'user', never admin. The old ELSE branch
        -- promoted the first unknown signer-in to admin on an admin-less
        -- system, which handed the keys to any Google account that slipped
        -- past the allowed-email-domains gate. Real school accounts are
        -- promoted by an existing admin through Users & Accounts.
        ELSE 'user'::public.user_role
    END;

    IF v_role <> v_current THEN
        UPDATE public.profiles SET role = v_role WHERE id = v_uid;
    END IF;

    RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_demo_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_demo_role() TO authenticated;

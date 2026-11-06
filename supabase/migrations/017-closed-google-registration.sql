-- ============================================================
-- 017: Closed registration — only admin/manager-registered emails
--      can Google sign in
--
-- Run in the Supabase SQL editor (service role context).
-- Idempotent — safe to re-run. No table changes.
--
-- WHY
--   The Google provider auto-creates an auth user at the OAuth callback for
--   ANY identity Google returns (until new signups are disabled in the
--   dashboard). The trigger then seeded the stranger a profile, and they
--   walked in as a faculty account. The rule this system actually wants:
--   accounts exist only because the admin or manager created them
--   (Users & Accounts → Add user) — everyone else bounces.
--
-- HOW IT WORKS
--   Registration in this system ALWAYS creates the auth row up front
--   (the admin-users edge function does auth.admin.createUser with a real
--   password), so a registered person already exists in auth.users AND in
--   profiles before they ever touch Google. When they sign in with Google,
--   GoTrue matches the existing row and signs them in — no insert happens,
--   so this trigger never runs for them.
--
--   A stranger's Google sign-up, however, reaches the trigger as a NEW
--   auth.users insert with app_metadata.provider = 'google' and no profile
--   row at their email. The function now RAISES in that case, which rolls
--   back the entire callback transaction: no auth row, no profile, no
--   session. GoTrue reports the failure to the browser and the app shows
--   "Google sign-in works only for registered accounts...". This is the
--   same bounce shape the "Allow new users to sign up" dashboard toggle
--   produces, so one code path handles both.
--
-- WHAT IT CHANGES
--   * handle_new_user() gains the registration gate above the seeding
--     insert. Provider 'email' creations (edge function, dashboard manual
--     add, seeded fixtures) are never gated — normal account management
--     keeps working. Case-insensitive email match against profiles.
--
-- RECOMMENDATION (outside this file, once per project)
--   Also set Authentication -> Sign In / Up -> Allow new users to sign up:
--   OFF, and Allowed email domains: nbsc.edu.ph. Trigger, toggle and domain
--   are three layers of the same door; any one closes it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Closed registration. This trigger fires inside the OAuth callback
    -- transaction whenever Supabase auto-creates an auth user — for a
    -- Google identity nobody registered. Only emails the admin or manager
    -- already registered (their auth row and profile exist from the Add
    -- user / invite flow) may use the system: an unknown Google sign-up
    -- raises here, which refuses the whole callback transaction — no auth
    -- row, no profile, no session — and GoTrue bounces the outsider back
    -- with a sign-in error. Password-path creations (the admin-users edge
    -- function and seeded fixtures) carry provider 'email'
    -- and always seed, so normal account creation is untouched. A
    -- registered email that signs in with Google does not reach this
    -- trigger at all: GoTrue matches the existing row and simply signs in.
    IF NEW.app_metadata->>'provider' = 'google'
       AND NOT EXISTS (
           SELECT 1 FROM public.profiles
           WHERE lower(email) = lower(NEW.email)
       ) THEN
        RAISE EXCEPTION 'Google sign-up refused: % is not registered. Accounts are created by the admin or manager.', NEW.email;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        ),
        NULLIF(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- The trigger definition itself (schema file line ~350) points at this
-- function; recreating the function is enough for fresh and existing installs.

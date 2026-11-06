-- ============================================================
-- 014: Google sign-in profile seeding
--
-- Run in the Supabase SQL editor (service role context).
-- Idempotent — safe to re-run. No table changes.
--
-- WHY
--   Google sign-in (Supabase auth provider "google") creates the auth user
--   server-side; handle_new_user() then auto-creates the profile row. The
--   function previously stamped only the name, so a Google-created account
--   landed without its photo, and a Google-only identity (no full_name in
--   metadata — Google supplies "name") could fall back to the email prefix
--   as the display name.
--
-- WHAT IT CHANGES
--
--   profile rows created at signup now also carry, when Google provided it:
--
--   * avatar_url  — the Google account's profile photo URL, so the sidebar,
--                   Profile page and reports show the picture immediately
--                   (the Profile page's own precedence still applies: an
--                   uploaded picture wins over any seeded Gravatar/Google one).
--   * full_name stays exactly as before — full_name first, then the OAuth
--     provider's "name", then the email prefix fallback.
--
--   Only INSERT-time seeding. Existing rows are untouched (ON CONFLICT DO
--   NOTHING keeps any identity someone already configured), and no audit
--   entry is written here — the sign-in event was already recorded.
--
-- CONSOLE PREREQUISITES (outside this file, once per project)
--   1. Google Cloud Console: OAuth client (Web), redirect URI
--      https://<project-ref>.supabase.co/auth/v1/callback
--   2. Supabase Dashboard → Authentication → Providers → Google: enable,
--      paste the client ID/secret.
--   3. Supabase Dashboard → Authentication → Sign In / Up → Allowed email
--      domains: nbsc.edu.ph  (the server-side version of the
--      school-accounts-only rule SBO Nexus enforces in its own callback).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- The trigger definition is unchanged (it was created by the schema file
-- and points at this function); recreating the function above is enough
-- for both fresh and existing installs.

-- ============================================================
-- 020: Heal user creation — reinstall handle_new_user(), re-bind its
--      trigger, and report anything in profiles that still blocks it
--
-- Run in the Supabase SQL editor (service role context).
-- Idempotent — safe to re-run. No table changes.
--
-- WHY
--   auth.admin.createUser started failing for EVERY new account with
--   GoTrue's "Database error creating new user" — the admin Add User
--   form shows it for Administrator, Program Head and Faculty alike.
--   GoTrue's createUser only fails inside its own database transaction,
--   and the one database thing it does there is fire the project's
--   on_auth_user_created trigger on auth.users, whose handler
--   (public.handle_new_user) seeds public.profiles. The failure is
--   therefore one of exactly three things:
--
--     (a) the LIVE function body drifted from migrations 014/017
--         (older gate, a hand-edit, a partial paste),
--     (b) the trigger binding itself is missing or went stale,
--     (c) profiles gained a NOT NULL, no-default column that the
--         seeding insert does not supply.
--
--   This migration repairs (a) by reinstalling the canonical body (the
--   exact one migration 017 ships, gate unchanged), repairs (b) by
--   re-binding the trigger, and REPORTS (c) at the end of the run —
--   healing an unknown schema change blind would only hide whatever the
--   column was added for. The report prints as NOTICE/WARNING lines in
--   the SQL editor's result; anything WARNING means paste it back.
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

-- Re-bind the trigger explicitly instead of trusting the schema file's
-- earlier install: a dropped, renamed or stale binding fails (b), and a
-- CREATE OR REPLACE FUNCTION alone would heal nothing if the event never
-- fired. Same definition the schema file ships.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- The report (fix class c): any NOT NULL column without a DEFAULT that
-- the seeding insert does not supply kills every signup insert with
-- "Database error creating new user". The four supplied columns are the
-- only tolerable exceptions — anything else the report lists is the
-- suspect, and its name is the answer.
-- ------------------------------------------------------------
DO $report$
DECLARE
    blockers text;
BEGIN
    SELECT string_agg(
             format('%s (%s)', c.column_name, c.data_type),
             ', ' ORDER BY c.ordinal_position)
      INTO blockers
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = 'profiles'
       AND c.is_nullable  = 'NO'
       AND c.column_default IS NULL
       AND c.column_name NOT IN ('id', 'email', 'full_name', 'avatar_url');

    IF blockers IS NOT NULL THEN
        RAISE WARNING 'profiles columns that break EVERY signup insert: %', blockers;
        RAISE NOTICE 'Fix: give the reported column(s) a DEFAULT, make them nullable, or supply them inside handle_new_user — then re-run this migration.';
    ELSE
        RAISE NOTICE 'profiles shape OK — no NOT NULL/without-default columns besides the four the trigger supplies.';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace) THEN
        RAISE NOTICE 'handle_new_user is installed (020 canonical body).';
    ELSE
        RAISE WARNING 'handle_new_user is MISSING — the CREATE above must have failed; scroll up for its error.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_trigger t
          JOIN pg_class  tbl ON tbl.oid = t.tgrelid
         WHERE t.tgname  = 'on_auth_user_created'
           AND NOT t.tgisinternal
           AND tbl.oid  = 'auth.users'::regclass
    ) THEN
        RAISE NOTICE 'Trigger on_auth_user_created is bound to auth.users.';
    ELSE
        RAISE WARNING 'Trigger on_auth_user_created is MISSING on auth.users — the CREATE above should have restored it.';
    END IF;
END;
$report$;

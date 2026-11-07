-- ============================================================
-- 021: handle_new_user — the field reference was never a column
--      (NEW.app_metadata → NEW.raw_app_meta_data) + a runtime
--      probe that would have caught it on day one
--
-- Run in the Supabase SQL editor (service role context).
-- Idempotent — safe to re-run. No table changes.
--
-- WHY
--   GoTrue answered EVERY ?action=create with its blanket
--   "Database error creating new user" even after migration 020
--   reinstalled the canonical handler: the handler's runtime was
--   still fatal. 020's own checks (function installed, trigger
--   bound, profiles shape OK) all pass while the handle is broken,
--   because a plpgsql record-field reference is only resolved at
--   EXECUTION time (42703): the closed-registration gate reads
--
--       NEW.app_metadata->>'provider'
--
--   and auth.users has never had an app_metadata column — the
--   column GoTrue stores it in is raw_app_meta_data (checked
--   against information_schema). The seeding insert three lines
--   below always used the correct raw_user_meta_data; only the
--   017 gate line was wrong, and 020's "exact 017 copy" reused
--   the mistake, as did supabase-schema.sql.
--
--   Effects observed live: GoTrue 500 on every fresh create, and no
--   other symptom anywhere — the gate line is the FIRST statement in
--   the handler, so every insert dies on it before the seeding runs.
--
--   The fix: the same handler with raw_app_meta_data, the same
--   trigger rebind as 020, and — new — a runtime probe: it fires
--   on_auth_user_created against a template row from a temp
--   function, reports INSERT_OK or the genuine Postgres error,
--   and cleans up after itself (RETURNING id → DELETE). A failed
--   probe names its SQLSTATE right in the results, instead of
--   hiding behind GoTrue's blanket wording.
--
--   017/020/supabase-schema.sql carry the same corrected line and
--   an in-place note; 021 is the single source of the heal.
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
    -- (The field is raw_app_meta_data — app_metadata never existed on
    -- auth.users; reading it raised 42703 on every insert since 017.)
    IF NEW.raw_app_meta_data->>'provider' = 'google'
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

-- Same re-bind 020 ships: a CREATE OR REPLACE alone heals nothing
-- when the event binding itself is stale.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- Runtime probe — the verify CREATE-only checks cannot give.
-- The INSERT lives inside a pg_temp function so a failing trigger
-- is CAUGHT (its text returned) rather than aborting the run; a
-- succeeding insert removes itself via the returned id.
-- Expect exactly one line: INSERT_OK … or PGERROR: [state] msg.
-- (SQL Editor note: run the whole file — the probe's temp objects
-- are session-scoped and vanish with it.)
-- ------------------------------------------------------------
DO $probe$
DECLARE
    verdict text;
    col record;
    colList text := '';
    vals text := '';
    tgtId uuid;
BEGIN
    FOR col IN
        SELECT c.column_name, c.data_type
        FROM information_schema.columns c
        WHERE c.table_schema = 'auth' AND c.table_name = 'users'
          AND c.is_generated = 'NEVER'
    LOOP
        IF colList <> '' THEN
            colList := colList || ', ';
            vals := vals || ', ';
        END IF;
        colList := colList || chr(34) || col.column_name || chr(34);
        IF col.column_name = 'id' THEN
            vals := vals || 'gen_random_uuid()';
        ELSIF col.column_name = 'email' THEN
            vals := vals || chr(39) || 'diag-trigger-probe@opencode.test' || chr(39);
        ELSIF col.column_name LIKE '%_token'
             OR col.column_name IN ('email_change', 'phone_change') THEN
            vals := vals || chr(39) || chr(39);
        ELSE
            vals := vals || 'src_probe.' || chr(34) || col.column_name || chr(34);
        END IF;
    END LOOP;

    EXECUTE 'CREATE TEMP TABLE src_probe AS SELECT * FROM auth.users WHERE email = ' || chr(39) || 'admin@cqi.test' || chr(39) || ' LIMIT 1';

    BEGIN
        EXECUTE 'INSERT INTO auth.users (' || colList || ') SELECT ' || vals || ' FROM src_probe LIMIT 1 RETURNING id' INTO tgtId;
        -- success: undo immediately (profiles row cascades with it)
        DELETE FROM auth.users WHERE id = tgtId;
        verdict := 'INSERT_OK id=' || tgtId::text;
    EXCEPTION WHEN OTHERS THEN
        -- no ROLLBACK allowed inside a DO block — none needed: the failed
        -- INSERT is already unwound by this handler's own subtransaction
        verdict := 'PGERROR: [' || SQLSTATE || '] ' || SQLERRM;
    END;

    IF verdict LIKE 'INSERT_OK%' THEN
        RAISE NOTICE 'trigger probe: % — handle_new_user fires and completes on a fresh insert. Add User should work. ✔', verdict;
    ELSE
        RAISE WARNING 'trigger probe: % — the handler still fails at runtime; copy this line back.', verdict;
    END IF;
END;
$probe$;

-- ------------------------------------------------------------
-- Static checks (020's set, kept) — run after the probe above so a
-- WARNING names the runtime problem and these name the shape one.
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
        RAISE NOTICE 'handle_new_user is installed (021 corrected body — raw_app_meta_data).';
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

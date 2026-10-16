-- Activity log: details column + writers
-- ============================================================
-- Gives audit entries enough context to be an audit trail rather than a
-- click counter: which record changed, what it was called, and why a
-- sign-in failed.
--
-- SAFE TO RUN: additive only (a new nullable column), no DROP, no data
-- loss. Re-running is a no-op. Do NOT re-run supabase-schema.sql to
-- apply this — that file drops every table.
--
-- WHY YOU MAY NEED THIS
--   log_activity() arrived in a later commit than record_login_event(),
--   which has been there since the first one. If your database was created
--   before it, the function does not exist — and the symptom looks like a UI
--   bug rather than a schema gap:
--
--     * Activity Logs shows ONLY "Signed in" / "Failed sign-in" entries
--     * every other action in the app is invisible
--     * nothing on screen looks broken
--
--   Every addActivityLog() call in the client fails silently against a missing
--   function (it only console.warn()s), so there is no error to notice. If
--   editing a program produces no log entry, run this file.
--
-- AFTER RUNNING
--   Sign out and back in so the session picks up the new grant, then edit and
--   save any program as admin. Activity Logs should then show an
--   "Updated program" entry.
--
-- p_details has a DEFAULT NULL so existing single-argument callers of
-- log_activity() keep working without change.

-- ============================================================
-- 1. Schema
-- ============================================================

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS details JSONB;

COMMENT ON COLUMN public.activity_logs.details IS
  'Optional context: {entity, entity_id, label, reason}. Actor is NOT stored here — user_email is stamped server-side from the caller''s JWT.';

-- The log is always read newest-first and filtered by action/date, so an
-- index on created_at keeps that from degrading into a sequential scan
-- once the table grows past a few thousand rows.
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_action_idx
  ON public.activity_logs (action);

-- ============================================================
-- 2. Writer: log_activity(action, details)
-- ============================================================
-- SECURITY DEFINER, unchanged in spirit: stamps the caller's real email
-- from their JWT, so the client never supplies (or spoofs) user_email.

CREATE OR REPLACE FUNCTION public.log_activity(p_action TEXT, p_details JSONB DEFAULT NULL)
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

    -- Store details verbatim so future fields need no function change.
    -- An empty object is normalised to NULL so the UI can treat "no
    -- context" as a single falsy case.
    INSERT INTO public.activity_logs (user_email, action, details)
    VALUES (
        v_email,
        btrim(p_action),
        CASE
            WHEN p_details IS NULL OR p_details = '{}'::jsonb THEN NULL
            ELSE p_details
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.log_activity(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_activity(TEXT, JSONB) TO authenticated;

-- ============================================================
-- 3. Login audit: keep the failure reason
-- ============================================================
-- p_reason was accepted and silently discarded, so every failed sign-in
-- looked identical. It is now stored in details.reason.
--
-- NOTE (not addressed here — see README "Known limitations"): p_email is
-- supplied by the client and this function is callable by `anon`, so an
-- unauthenticated caller can still write arbitrary failure rows for any
-- address. Closing that means capturing the address server-side or
-- rate-limiting this function; both are follow-up work.

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
    INSERT INTO public.activity_logs (user_email, action, details)
    VALUES (
        p_email,
        CASE WHEN p_success THEN 'auth.login' ELSE 'auth.login_failed' END,
        CASE
            WHEN NOT p_success AND p_reason IS NOT NULL AND btrim(p_reason) <> ''
                THEN jsonb_build_object('reason', btrim(p_reason))
            ELSE NULL
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_event(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_event(TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================================
-- 4. Verification — each of these should report one row / one
--    value. "function exists" returning 0 means it was already
--    there is NOT possible here; CREATE OR REPLACE guarantees it,
--    so 1 is the only correct answer.
-- ============================================================

-- SELECT 'log_activity present' AS check, count(*) AS expected_1 FROM pg_proc
--   WHERE proname = 'log_activity';
--
-- SELECT 'anon cannot forge entries' AS check,
--        has_function_privilege('anon', 'log_activity(text, jsonb)', 'EXECUTE')
--        AS expected_false;
--
-- SELECT 'signed-in users can log' AS check,
--        has_function_privilege('authenticated', 'log_activity(text, jsonb)', 'EXECUTE')
--        AS expected_true;
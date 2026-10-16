-- Activity log detail capture
-- ============================================================
-- Gives audit entries enough context to be an audit trail rather
-- than a click counter: which record changed, what it was called,
-- and why a sign-in failed.
--
-- SAFE TO RUN: additive only (a new nullable column), no DROP, no data
-- loss. Re-running is a no-op. Do NOT re-run supabase-schema.sql to
-- apply this — that file drops every table.
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
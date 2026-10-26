-- ============================================================
-- 005: Profile picture + nickname
--
-- Everything the profile UI needs in one file (it consolidates the
-- earlier 005/006/007 trio: the public-facing username handle was
-- retired, so profiles end up with just avatar_url + nickname).
--
-- avatar_url is a URL into the public 'avatars' storage bucket;
-- the bucket is created here with row level security: everyone may
-- look at pictures, but only the owner may write inside their own
-- <uid>/ folder.
--
-- Idempotent — safe to re-run. Projects that already applied the
-- original 005/006/007 trio are already in this end state; running
-- this file makes no further change.
--
-- Run in the Supabase SQL editor (service role context).
-- ============================================================

-- ---------- New profile columns ----------

-- Public URL of the current picture (avatars/<uid>/avatar). Nullable:
-- users without a picture render as initials.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Casual name shown quoted (e.g. Maria "Bebot" dela Cruz) on the
-- Profile page. Optional; reports and audit labels keep using
-- full_name.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS nickname TEXT;

-- ---------- Storage: the 'avatars' bucket ----------

-- Public bucket: profile pictures are meant to be visible next to
-- names in reports and logs, so anon reads are intended.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Re-runnable policies: drop-then-create keeps the migration idempotent.
DROP POLICY IF EXISTS "Avatar pictures are publicly readable" ON storage.objects;
CREATE POLICY "Avatar pictures are publicly readable" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars');

-- Writes are scoped to the caller's own first folder segment: the app
-- always uploads to <auth.uid()>/avatar, so a user can never replace
-- somebody else's picture, and the folder name doubles as the key.
DROP POLICY IF EXISTS "Users manage their own avatar folder" ON storage.objects;
CREATE POLICY "Users manage their own avatar folder" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users update their own avatar files" ON storage.objects;
CREATE POLICY "Users update their own avatar files" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users delete their own avatar files" ON storage.objects;
CREATE POLICY "Users delete their own avatar files" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ============================================================
-- 007: Remove the profile username
--
-- The public-facing handle idea is dropped: the full name (with an
-- optional nickname) is enough identity for the system. The column
-- is dropped cleanly; the 'avatars' bucket and avatar_url stay —
-- see migrations/005-profile-username-avatar.sql for those parts.
--
-- Run in the Supabase SQL editor (service role context).
-- ============================================================

ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS username;

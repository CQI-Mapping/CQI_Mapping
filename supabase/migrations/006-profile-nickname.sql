-- ============================================================
-- 006: Profile nickname
--
-- Adds a casual, optional nickname to profiles, shown quoted
-- (e.g. Maria "Bebot" dela Cruz) in the Profile page. It never
-- replaces full_name in reports or logs.
--
-- Run in the Supabase SQL editor (service role context).
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS nickname TEXT;

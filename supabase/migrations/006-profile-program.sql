-- ============================================================
-- 006: Profile program assignment
--
-- Lets admins tie manager/faculty accounts to a program at
-- creation — the Admin Add User form shows a Program dropdown
-- whenever the chosen role is Manager or Faculty. Admins stay
-- unassigned: they work across every program.
--
-- Deleting a program nulls its members' assignment rather than
-- deleting their rows.
--
-- Run in the Supabase SQL editor (service role context).
-- Redeploy the admin-users Edge Function afterward so account
-- creation carries the program through:
--   npx supabase functions deploy admin-users
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL;

-- Program-filtered account lists read by the Users pages.
CREATE INDEX IF NOT EXISTS profiles_program_id_idx ON public.profiles (program_id);

-- CQI actions: the recommendations the Overall Report's monitoring panel
-- lists -- and records: the panel doubles as the ledger, so nothing can be
-- on file until this table exists. Applied by hand in the Supabase SQL
-- editor; it is the same block as supabase-schema.sql, kept here in one
-- place to paste.

CREATE TABLE IF NOT EXISTS public.cqi_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    recommendation TEXT NOT NULL,
    responsible TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    target_date DATE,
    program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cqi_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cqi_actions" ON public.cqi_actions FOR SELECT
    TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage cqi_actions" ON public.cqi_actions FOR ALL
    TO authenticated USING (true) WITH CHECK (true);

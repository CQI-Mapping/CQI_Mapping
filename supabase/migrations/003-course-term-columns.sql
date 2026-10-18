-- Term placement for the Curriculum Mapping Summary in the Overall Report.
-- The academic year is stored as its starting year ("2026" displays as
-- "2026 - 2027"), so both values stay plain integers. Nullable: a course
-- without a recorded term shows a dash, and editing is off until these
-- columns exist -- the report page probes for them.

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS year_level INTEGER;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS semester INTEGER;

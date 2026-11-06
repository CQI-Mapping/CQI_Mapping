-- Curriculum records carry a structured school year
-- ============================================================
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- WHY
--   The map's curriculum picker is going program-year based: it will list
--   every active record and open on the current school year's one. The year
--   previously lived only inside the free-text name ("BSIT 2026-2027"), so
--   nothing could compare a record to today's date without fragile parsing.
--
-- WHAT IT CHANGES
--   1. resources.sy_start — the school year's OPENING year (2026 for
--      "BSIT 2026-2027"); the closing year is always start + 1. NULL stays
--      legal: older records keep working and the app falls back to reading
--      the year out of the label text.
--   2. Backfill from the label: the first clean year pair in code or title
--      ("2026-2027" or "2019-20") sets the field; anything ambiguous stays
--      NULL and can be set by hand on the Curriculum page.
--   3. No RLS changes — the column rides the table's own grants.
--
-- AFTER RUNNING
--   No re-sign-in needed. The Curriculum page's form maintains the field
--   going forward; the map and its dashboard block use it for the current-
--   school-year pick.

ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS sy_start SMALLINT;

-- Backfill: the first clean pair wins — opening year from group 1, and the
-- pair valid only when the second year is the first year + one (four-digit
-- "2019-2020" or two-digit "2019-20"), inside a sane range.
WITH matched AS (
    SELECT id,
           regexp_match(
               coalesce(code, '') || ' ' || coalesce(title, ''),
               '(1[0-9]{3}|2[0-9]{3})[-–—/ .]((1[0-9]{3}|2[0-9]{3})|[0-9]{2})(?![0-9])'
           ) AS m
    FROM public.resources
    WHERE sy_start IS NULL
)
UPDATE public.resources r
SET sy_start = (m[1])::smallint
FROM matched
WHERE r.id = matched.id
  AND (m[1])::int BETWEEN 1990 AND 2099
  AND (
        (m[2])::int = (m[1])::int + 1
        OR (length(m[2]) = 2
            AND ((m[1])::int / 100) * 100 + (m[2])::int = (m[1])::int + 1)
      );

COMMENT ON COLUMN public.resources.sy_start IS
    'School year opening year, e.g. 2026 for SY 2026-2027; NULL = unspecified.';

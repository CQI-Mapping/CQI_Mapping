-- Split the TOS exam's combined "term" into semester and school year,
-- so the Generate TOS form offers them as two separate pickers instead of
-- one "1st Semester, 2026-2027" string.
ALTER TABLE public.tos_exams ADD COLUMN IF NOT EXISTS semester TEXT;
ALTER TABLE public.tos_exams ADD COLUMN IF NOT EXISTS school_year TEXT;

-- Backfill the new columns from existing "term" values, which read like
-- "1st Semester, 2026-2027". Rows whose term is blank stay blank; the picker
-- tolerates an off-list saved value, so nothing is lost.
UPDATE public.tos_exams
SET semester = trim(split_part(term, ',', 1)),
    school_year = trim(split_part(term, ',', 2))
WHERE term IS NOT NULL AND term <> ''
  AND (semester IS NULL OR school_year IS NULL);

-- Re-point the uniqueness guard at the two new columns. term is kept in sync
-- (recomposed on every write) so anything that still reads it keeps working,
-- but the real key is now semester + school year.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tos_exams_user_id_code_exam_type_term_key'
    ) THEN
        ALTER TABLE public.tos_exams DROP CONSTRAINT tos_exams_user_id_code_exam_type_term_key;
    END IF;
END $$;

ALTER TABLE public.tos_exams
    ADD CONSTRAINT tos_exams_user_id_code_exam_type_semester_school_year_unique
    UNIQUE (user_id, code, exam_type, semester, school_year);

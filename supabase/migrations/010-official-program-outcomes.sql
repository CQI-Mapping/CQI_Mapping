-- Official Program Outcomes: the CMO 25 S. 2015 curriculum mapping list
-- ============================================================
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- WHY
--   The Program Outcomes table had drifted: manager-typed rows mixed code
--   formats ("PO-1" beside "PO 2"), duplicated codes across different
--   outcomes (two different PO 2s), and numbered everything as one flat
--   run instead of the two groups of the official document. That one
--   table drives the faculty CLO page's Program Outcomes suggestions, the
--   syllabus's outcome sections, and the report's Curriculum Mapping
--   matrix — so the mess showed everywhere (user report, c4.jpg).
--
-- WHAT IT CHANGES
--   1. Every currently-ACTIVE outcome is archived (status = 'archived').
--      Nothing is deleted — restore any row by flipping its status back.
--   2. The official document is inserted VERBATIM as MANAGER-sourced rows,
--      because the report's Curriculum Mapping matrix is built exactly
--      from manager rows under these two category headers
--      (MANAGER_CM_CATEGORIES in src/utils/report.ts):
--
--        PO-1 … PO-4   Bachelor of Science in Information Technology
--                      Program Outcomes (CMO 25 S. 2015)
--        SD-1 … SD-13  Specific to a sub-discipline and a major
--                      (CMO 25 S. 2015)
--
--      The category header lives in each row's `description` column (the
--      manager page groups by it, and the syllabus renders the two headed
--      sections); the outcome text is the `title`. There is no unique
--      constraint on code (duplicates are permitted by design), so the
--      two numbering runs coexist safely.
--
--   Code style follows the app's own convention ("PO-1", hyphen, as the
--   admin page builds it) — with a distinct SD- prefix for the
--   sub-discipline group so its numbering can restart at 1 without
--   colliding with the program outcomes.
--
-- AFTER RUNNING
--   Reload any open page: the faculty CLO suggestions, the View Syllabus
--   outcome lists, and the report's Curriculum Mapping matrix all read
--   this one table and now show the official list.

-- 1 · Park the drifted rows -------------------------------------------------

UPDATE public.admin_program_outcomes
SET status = 'archived'
WHERE status = 'active';

-- 2 · Insert the official CMO 25 S. 2015 list -------------------------------

INSERT INTO public.admin_program_outcomes (code, title, description, source, status)
SELECT v.code, v.title, v.grp, 'manager', 'active'
FROM (VALUES
    -- Bachelor of Science in Information Technology Program Outcomes
    ('PO-1', 'Analyze complex problems, and identify and define the computing requirements needed to design an appropriate solution;',
             'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)'),
    ('PO-2', 'Apply computing and other knowledge domains to address real-world problems;',
             'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)'),
    ('PO-3', 'Design and develop computing solutions using a system-level perspective, and;',
             'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)'),
    ('PO-4', 'Utilize modern computing tools',
             'Bachelor of Science in Information Technology Program Outcomes (CMO 25 S. 2015)'),
    -- Specific to a sub-discipline and a major
    ('SD-1',  'Apply knowledge of computing, science, and mathematics appropriate to the discipline;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-2',  'Demonstrate best practices and standards and their applications;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-3',  'Analyze complex problems, and identify and define the computing requirements appropriate to its solution;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-4',  'Design, implement, and evaluate computer-based systems, processes, components, or programs to meet desired needs and requirements under various constraints;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-5',  'Identify and analyze user needs and take them into account in the selection, creation, evaluation and administration of computer-based systems;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-6',  'Integrate IT-based solutions into the user environment effectively;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-7',  'Apply knowledge through the use of current techniques, skills, tools and practices necessary for the IT profession;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-8',  'Demonstrate functions effectively as a member or leader of a development team recognizing the different roles within a team to accomplish a common goal;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-9',  'Assist in the creation of an effective IT project plan;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-10', 'Communicate effectively with the computing community and with society at large about complex computing activities through logical writing, presentations, and clear instructions;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-11', 'Analyze the local and global impact of computing information technology on individuals, organizations, and society;',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-12', 'Uphold professional, ethical, legal, security and social issues and responsibilities in the utilization of information technology; and',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)'),
    ('SD-13', 'Recognize the need and engage in planning self-learning and improving performance as a foundation for continuing professional development',
              'Specific to a sub-discipline and a major (CMO 25 S. 2015)')
) AS v(code, title, grp)
WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_program_outcomes p
    WHERE p.code = v.code
      AND p.description = v.grp
      AND p.status = 'active'
);

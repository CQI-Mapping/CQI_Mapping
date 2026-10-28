-- Official codes for the manager's Program Outcomes
-- ============================================================
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- WHY
--   The 17 ACTIVE manager rows are the official CMO 25 s. 2015 list
--   (4 program outcomes + 13 sub-discipline outcomes) flattened into one
--   "PO n" numbering run. The sub-discipline group restarted its numbering
--   but kept the PO prefix, so four codes collide across two different
--   outcomes and the same code names different rows:
--
--     PO 1 ×2  (Analyze complex problems… / Apply knowledge of computing…)
--     PO 2 ×2  (Apply computing… / Demonstrate best practices…)
--     PO 3 ×2  (Design and develop… / Analyze complex problems…)
--     PO 5 ×2  (Identify and analyze user needs… / Design, implement,
--              and evaluate computer-based systems…)
--
--   The collision surfaced in the faculty CLO page: the closest-PO chips
--   showed two different "PO 5" entries for one draft (r11.jpg / r12.jpg),
--   and any report keyed by code cannot tell the siblings apart.
--
-- WHAT IT CHANGES
--   Active manager rows are renumbered to the official two-family scheme —
--
--     PO-1 … PO-4    Bachelor of Science in Information Technology
--                    Program Outcomes (CMO 25 S. 2015)
--     SD-1 … SD-13   Specific to a sub-discipline and a major
--                    (CMO 25 S. 2015)
--
--   …the same scheme migration 010 documents and the report's Curriculum
--   Mapping matrix, the syllabus outcome sections, and the poOfficial
--   accuracy fixture already assume. Titles and categories are NOT touched;
--   only the `code` column of rows that are BOTH manager-sourced AND active.
--   Rows are matched by normalized TITLE, not by the typed number, because
--   the flat run skipped 4 — official SD-4 was entered as the second "PO 5",
--   so preserving typed numbers would mint two SD-5s and lose SD-4.
--
-- SAFE PATH
--   No row is inserted, deleted, or archived. Only `code` changes, and only
--   on rows already active. Re-running rewrites the same values (no-op).
--
-- AFTER RUNNING
--   Reload any open page. Faculty CLO suggestions collapse to
--   PO-1…PO-4 + SD-1…SD-13 (no more duplicate PO 5), the syllabus outcome
--   sections and the Curriculum Mapping matrix key on unique codes, and the
--   three VERIFY queries at the end confirm the outcome + list the CLO
--   references worth a second look (see VERIFY 3's note).

UPDATE public.admin_program_outcomes AS p
SET code = v.official
FROM (
    VALUES
    -- Bachelor of Science in Information Technology Program Outcomes
    ('PO-1',  'Analyze complex problems, and identify and define the computing requirements needed to design an appropriate solution;'),
    ('PO-2',  'Apply computing and other knowledge domains to address real-world problems;'),
    ('PO-3',  'Design and develop computing solutions using a system-level perspective, and;'),
    ('PO-4',  'Utilize modern computing tools'),
    -- Specific to a sub-discipline and a major
    ('SD-1',  'Apply knowledge of computing, science, and mathematics appropriate to the discipline;'),
    ('SD-2',  'Demonstrate best practices and standards and their applications;'),
    ('SD-3',  'Analyze complex problems, and identify and define the computing requirements appropriate to its solution;'),
    ('SD-4',  'Design, implement, and evaluate computer-based systems, processes, components, or programs to meet desired needs and requirements under various constraints;'),
    ('SD-5',  'Identify and analyze user needs and take them into account in the selection, creation, evaluation and administration of computer-based systems;'),
    ('SD-6',  'Integrate IT-based solutions into the user environment effectively;'),
    ('SD-7',  'Apply knowledge through the use of current techniques, skills, tools and practices necessary for the IT profession;'),
    ('SD-8',  'Demonstrate functions effectively as a member or leader of a development team recognizing the different roles within a team to accomplish a common goal;'),
    ('SD-9',  'Assist in the creation of an effective IT project plan;'),
    ('SD-10', 'Communicate effectively with the computing community and with society at large about complex computing activities through logical writing, presentations, and clear instructions;'),
    ('SD-11', 'Analyze the local and global impact of computing information technology on individuals, organizations, and society;'),
    ('SD-12', 'Uphold professional, ethical, legal, security and social issues and responsibilities in the utilization of information technology; and'),
    ('SD-13', 'Recognize the need and engage in planning self-learning and improving performance as a foundation for continuing professional development')
) AS v(official, official_title)
WHERE p.source = 'manager'
  AND p.status = 'active'
  -- Fold the stored title the way the app folds codes: lowercase, collapse
  -- whitespace, then strip punctuation. The manager's typed titles carry
  -- trailing ", and" / ";" / double-space variants of the official wording,
  -- so exact equality would strand rows; the folded text is identical.
  AND lower(regexp_replace(regexp_replace(p.title, '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g'))
      = lower(regexp_replace(regexp_replace(v.official_title, '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g'));

-- ══ VERIFY ═══════════════════════════════════════════════════════════════
-- Run each after the UPDATE; all should come back EMPTY except VERIFY 3.

-- VERIFY 1 · every active manager row should carry an official code.
-- Anything here did not match an official title (fine — it was never part
-- of the official list) but is worth an eyeball.
SELECT code, title
FROM public.admin_program_outcomes
WHERE source = 'manager'
  AND status = 'active'
  AND code !~ '^(PO-[1-4]|SD-(1[0-3]|[1-9]))$';

-- VERIFY 2 · no duplicate codes among active manager rows.
SELECT code, count(*)
FROM public.admin_program_outcomes
WHERE source = 'manager'
  AND status = 'active'
GROUP BY code
HAVING count(*) > 1;

-- VERIFY 3 · CLO references worth a faculty second look — NOT auto-fixable.
-- The matcher folds punctuation, so a CLO that stores "PO 1" or "PO 3"
-- still resolves to the BSIT-family row — but on the flat run that number
-- named TWO rows, and the pick may have meant the sub-discipline sibling
-- (now SD-1 / SD-3). The correct mapping is recoverable only from the
-- faculty who picked it, so these want a quick review, not a script.
SELECT code, course, status, title
FROM public.admin_course_learning_outcomes
WHERE (status = 'active' OR status IS NULL)
  AND title ~* '(^|[^a-z0-9])PO ?[1-5]([^0-9]|$)';

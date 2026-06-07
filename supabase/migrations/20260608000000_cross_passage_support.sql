-- ============================================================
-- Migration: Cross-Passage Question Support
-- Adds cross_passage_id column to dsemcq_questions so
-- multi-passage questions can reference both passages.
-- Refreshes RPCs to include the new column in JSON output.
-- ============================================================

-- 1. Add cross_passage_id column (nullable FK to passages)
ALTER TABLE dsemcq_questions
  ADD COLUMN IF NOT EXISTS cross_passage_id text
    REFERENCES dsemcq_passages(id) ON DELETE SET NULL;

-- 2. Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_questions_cross_passage
  ON dsemcq_questions(cross_passage_id)
  WHERE cross_passage_id IS NOT NULL;


-- 3. Refresh get_quiz_for_attempt — include cross_passage_id in JSON output
CREATE OR REPLACE FUNCTION get_quiz_for_attempt(p_quiz_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz   dsemcq_quizzes%rowtype;
  v_result jsonb;
BEGIN
  SELECT * INTO v_quiz FROM dsemcq_quizzes WHERE id = p_quiz_id AND is_published = true;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(q_obj ORDER BY q_ord), '[]'::jsonb)
  INTO   v_result
  FROM (
    SELECT
      ordinality AS q_ord,
      jsonb_build_object(
        'id',               q.id,
        'passage_id',       q.passage_id,
        'cross_passage_id', q.cross_passage_id,
        'stem',             q.stem,
        'explanation',      q.explanation,
        'difficulty',       q.difficulty,
        'source',           q.source,
        'is_active',        q.is_active,
        'options', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object(
              'id',          o.id,
              'question_id', o.question_id,
              'label',       o.label,
              'text',        o.text,
              'is_correct',  false,
              'explanation', o.explanation
            ) ORDER BY o.id
          ), '[]'::jsonb)
          FROM dsemcq_question_options o
          WHERE o.question_id = q.id
        )
      ) AS q_obj
    FROM unnest(v_quiz.question_ids) WITH ORDINALITY AS qid_row(qid, ordinality)
    JOIN dsemcq_questions q ON q.id = qid_row.qid
  ) sub;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_for_attempt(text) TO anon, authenticated;


-- 4. Refresh get_quiz_for_result — include cross_passage_id in JSON output
CREATE OR REPLACE FUNCTION get_quiz_for_result(p_quiz_id text, p_attempt_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz    dsemcq_quizzes%rowtype;
  v_attempt dsemcq_attempts%rowtype;
  v_result  jsonb;
BEGIN
  SELECT * INTO v_attempt
  FROM dsemcq_attempts
  WHERE id = p_attempt_id::uuid
    AND quiz_id = p_quiz_id;

  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

  IF v_attempt.status NOT IN ('submitted', 'expired') THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO v_quiz
  FROM dsemcq_quizzes
  WHERE id = p_quiz_id AND is_published = true;

  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(q_obj ORDER BY q_ord), '[]'::jsonb)
  INTO   v_result
  FROM (
    SELECT
      ordinality AS q_ord,
      jsonb_build_object(
        'id',               q.id,
        'passage_id',       q.passage_id,
        'cross_passage_id', q.cross_passage_id,
        'stem',             q.stem,
        'explanation',      q.explanation,
        'difficulty',       q.difficulty,
        'source',           q.source,
        'is_active',        q.is_active,
        'options', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object(
              'id',          o.id,
              'question_id', o.question_id,
              'label',       o.label,
              'text',        o.text,
              'is_correct',  o.is_correct,
              'explanation', o.explanation
            ) ORDER BY o.id
          ), '[]'::jsonb)
          FROM dsemcq_question_options o
          WHERE o.question_id = q.id
        )
      ) AS q_obj
    FROM unnest(v_quiz.question_ids) WITH ORDINALITY AS qid_row(qid, ordinality)
    JOIN dsemcq_questions q ON q.id = qid_row.qid
  ) sub;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_for_result(text, text) TO authenticated;

-- ============================================================
-- Migration: Question Flagging System
-- Admin can flag questions (instant deactivation).
-- Users can report errors (報錯) with a mandatory comment.
-- ============================================================

-- 1. Add flag columns to dsemcq_questions
ALTER TABLE dsemcq_questions
  ADD COLUMN IF NOT EXISTS admin_flag       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_flag_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_flag_comments text    DEFAULT NULL;

-- 2. User-level flag tracking (prevent duplicate flags per user per question)
CREATE TABLE IF NOT EXISTS dsemcq_user_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES dsemcq_questions(id) ON DELETE CASCADE,
  comment     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

-- RLS on dsemcq_user_flags
ALTER TABLE dsemcq_user_flags ENABLE ROW LEVEL SECURITY;

-- Users can read their own flags (to check if already flagged)
CREATE POLICY "user_flags: read own"
  ON dsemcq_user_flags FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own flags
CREATE POLICY "user_flags: insert own"
  ON dsemcq_user_flags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all flags
CREATE POLICY "user_flags: admin read all"
  ON dsemcq_user_flags FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM dsemcq_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

GRANT SELECT, INSERT ON dsemcq_user_flags TO authenticated;

-- 3. RPC: Admin flags a question (sets admin_flag=true, is_active=false)
CREATE OR REPLACE FUNCTION admin_flag_question(p_question_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM dsemcq_profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  UPDATE dsemcq_questions
  SET admin_flag = true,
      is_active  = false
  WHERE id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found: %', p_question_id;
  END IF;
END;
$$;

-- 4. RPC: User flags a question (報錯)
--    Inserts into dsemcq_user_flags, increments count, appends comment.
CREATE OR REPLACE FUNCTION user_flag_question(p_question_id text, p_comment text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate comment length (1-50 characters)
  IF p_comment IS NULL OR char_length(trim(p_comment)) = 0 THEN
    RAISE EXCEPTION 'Comment is required';
  END IF;
  IF char_length(trim(p_comment)) > 50 THEN
    RAISE EXCEPTION 'Comment must be 50 characters or fewer';
  END IF;

  -- Insert flag record (unique constraint prevents duplicates)
  INSERT INTO dsemcq_user_flags (user_id, question_id, comment)
  VALUES (v_uid, p_question_id, trim(p_comment));

  -- Update question counters atomically
  UPDATE dsemcq_questions
  SET user_flag_count    = user_flag_count + 1,
      user_flag_comments = CASE
        WHEN user_flag_comments IS NULL THEN trim(p_comment)
        ELSE user_flag_comments || ' / ' || trim(p_comment)
      END
  WHERE id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found: %', p_question_id;
  END IF;
END;
$$;

-- Grant execute on RPCs
GRANT EXECUTE ON FUNCTION admin_flag_question(text) TO authenticated;
GRANT EXECUTE ON FUNCTION user_flag_question(text, text) TO authenticated;

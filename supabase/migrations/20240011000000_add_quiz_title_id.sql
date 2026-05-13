-- Add title_id column to dsemcq_quizzes.
-- This integer distinguishes multiple quizzes that share the same title
-- (e.g. two "岳陽樓記" exercises assembled in different runs).
-- The MCQ generator assembly agent populates this value; it is NULL when
-- a quiz title is unique (no duplicates exist for that title).

alter table dsemcq_quizzes
  add column if not exists title_id integer;

-- ── Explicit grants for questions + options ───────────────────────────────
-- PostgREST requires the base table privilege even when RLS policies are in
-- place.  These grants ensure the direct-query fallback in getQuestionsForQuiz
-- (and the anti-cheat RPC) work for both anon and authenticated callers.
-- Supabase normally sets these via ALTER DEFAULT PRIVILEGES, but making them
-- explicit is safer when the tables were created before those defaults ran.

-- ── Add missing explanation column to dsemcq_questions ───────────────────
-- The initial schema declared this column, but the live DB was provisioned
-- from an older version that omitted it.  PL/pgSQL functions referencing
-- q.explanation (get_quiz_for_attempt, fix_result_scoring) silently compiled
-- but fail at runtime with "column q.explanation does not exist".
-- This ALTER is safe to re-run; IF NOT EXISTS is a no-op when already present.

alter table dsemcq_questions
  add column if not exists explanation text;

grant select on table dsemcq_questions        to anon, authenticated;
grant select on table dsemcq_question_options to anon, authenticated;

-- ── Recreate get_quiz_for_attempt to refresh %rowtype binding ─────────────
-- ALTER TABLE ADD COLUMN changes the table's rowtype.  Under Supabase's
-- PgBouncer connection pool the compiled plan for functions using
-- dsemcq_quizzes%rowtype can become stale, causing "cached plan must not
-- change result type" errors on the first call after migration.
-- Re-creating the function here forces an immediate recompile.

create or replace function get_quiz_for_attempt(p_quiz_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz   dsemcq_quizzes%rowtype;
  v_result jsonb;
begin
  select * into v_quiz from dsemcq_quizzes where id = p_quiz_id and is_published = true;
  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(q_obj order by q_ord), '[]'::jsonb)
  into   v_result
  from (
    select
      ordinality as q_ord,
      jsonb_build_object(
        'id',          q.id,
        'passage_id',  q.passage_id,
        'stem',        q.stem,
        'explanation', q.explanation,
        'difficulty',  q.difficulty,
        'source',      q.source,
        'is_active',   q.is_active,
        'options',     (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id',          o.id,
              'question_id', o.question_id,
              'label',       o.label,
              'text',        o.text,
              'is_correct',  false,
              'explanation', o.explanation
            ) order by o.id
          ), '[]'::jsonb)
          from dsemcq_question_options o
          where o.question_id = q.id
        )
      ) as q_obj
    from unnest(v_quiz.question_ids) with ordinality as qid_row(qid, ordinality)
    join dsemcq_questions q on q.id = qid_row.qid
  ) sub;

  return v_result;
end;
$$;

grant execute on function get_quiz_for_attempt(text) to anon, authenticated;

-- ── Recreate get_quiz_for_result to fix explanation column reference ───────
-- Migration 20240007 created this function before dsemcq_questions.explanation
-- existed, so it fails at runtime with "column q.explanation does not exist".
-- Also removes the is_active filter (same reason as get_quiz_for_attempt:
-- assembled question_ids were already qualified; filtering post-assembly causes
-- missing questions in the result review if is_active later changed).

create or replace function get_quiz_for_result(p_quiz_id text, p_attempt_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz    dsemcq_quizzes%rowtype;
  v_attempt dsemcq_attempts%rowtype;
  v_result  jsonb;
begin
  -- Verify attempt exists and belongs to the calling user
  select * into v_attempt
  from dsemcq_attempts
  where id = p_attempt_id::uuid
    and quiz_id = p_quiz_id;

  if not found then
    return '[]'::jsonb;
  end if;

  -- Only reveal is_correct once the attempt is submitted/expired
  if v_attempt.status not in ('submitted', 'expired') then
    return '[]'::jsonb;
  end if;

  -- Verify quiz is published
  select * into v_quiz
  from dsemcq_quizzes
  where id = p_quiz_id and is_published = true;

  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(q_obj order by q_ord), '[]'::jsonb)
  into   v_result
  from (
    select
      ordinality as q_ord,
      jsonb_build_object(
        'id',          q.id,
        'passage_id',  q.passage_id,
        'stem',        q.stem,
        'explanation', q.explanation,
        'difficulty',  q.difficulty,
        'source',      q.source,
        'is_active',   q.is_active,
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id',          o.id,
              'question_id', o.question_id,
              'label',       o.label,
              'text',        o.text,
              'is_correct',  o.is_correct,
              'explanation', o.explanation
            ) order by o.id
          ), '[]'::jsonb)
          from dsemcq_question_options o
          where o.question_id = q.id
        )
      ) as q_obj
    from unnest(v_quiz.question_ids) with ordinality as qid_row(qid, ordinality)
    join dsemcq_questions q on q.id = qid_row.qid
    -- No is_active filter: question_ids were qualified at assembly time
  ) sub;

  return v_result;
end;
$$;

grant execute on function get_quiz_for_result(text, text) to anon, authenticated;

-- Signal PostgREST to reload its schema cache so the new column and grants
-- take effect immediately without waiting for the auto-reload interval.
notify pgrst, 'reload schema';

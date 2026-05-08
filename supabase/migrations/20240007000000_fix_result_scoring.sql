-- ────────────────────────────────────────────────────────────
-- Fix: result screen answer display + server-side score calculation
--
-- Problem: get_quiz_for_attempt intentionally returns is_correct = false
-- for all options (anti-cheat). But the result screen was reusing the same
-- RPC, causing every answer to appear wrong and score to always be 0.
--
-- Solution:
--   1. get_quiz_for_result  — reveals real is_correct only for submitted attempts
--   2. calculate_score_for_attempt — server-side score from DB's is_correct
-- ────────────────────────────────────────────────────────────

-- 1. get_quiz_for_result(p_quiz_id, p_attempt_id)
--    Returns questions + options with REAL is_correct values.
--    Only works when the attempt is in 'submitted' or 'expired' status,
--    preventing score-peeking during an in-progress attempt.
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
  -- Verify attempt exists and is completed
  select * into v_attempt
  from dsemcq_attempts
  where id = p_attempt_id
    and quiz_id = p_quiz_id;

  if not found or v_attempt.status not in ('submitted', 'expired') then
    return '[]'::jsonb;
  end if;

  -- Verify quiz is published
  select * into v_quiz
  from dsemcq_quizzes
  where id = p_quiz_id and is_published = true;

  if not found then
    return '[]'::jsonb;
  end if;

  -- Return questions with REAL is_correct (ordered by label A→D)
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
              'is_correct',  o.is_correct   -- real value revealed post-submit
            ) order by o.label
          ), '[]'::jsonb)
          from dsemcq_question_options o
          where o.question_id = q.id
        )
      ) as q_obj
    from unnest(v_quiz.question_ids) with ordinality as qid_row(qid, ordinality)
    join dsemcq_questions q on q.id = qid_row.qid
    where q.is_active = true
  ) sub;

  return v_result;
end;
$$;

grant execute on function get_quiz_for_result(text, text) to authenticated;


-- 2. calculate_score_for_attempt(p_attempt_id, p_answers)
--    Calculates score server-side by looking up is_correct from
--    dsemcq_question_options using the stored option IDs.
--    p_answers: JSON object {question_id: selected_option_id}
create or replace function calculate_score_for_attempt(
  p_attempt_id text,
  p_answers    jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score      integer := 0;
  v_option_id  text;
  v_is_correct boolean;
begin
  -- Iterate over each answered question's selected option
  for v_option_id in
    select value::text from jsonb_each_text(p_answers)
  loop
    select is_correct into v_is_correct
    from dsemcq_question_options
    where id = v_option_id;

    if found and v_is_correct then
      v_score := v_score + 1;
    end if;
  end loop;

  return v_score;
end;
$$;

grant execute on function calculate_score_for_attempt(text, jsonb) to authenticated;

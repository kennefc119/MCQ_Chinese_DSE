-- Fix get_quiz_for_attempt:
-- 1. Remove is_active filter so assembled quizzes always load their questions
--    (the assembler already qualified them; is_active may have changed post-assembly)
-- 2. Return per-option explanation column (added in migration 009)
-- 3. Add option ORDER BY id so options appear in consistent order

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
              'is_correct',  false,        -- hidden until result (anti-cheat)
              'explanation', o.explanation -- per-option explanation for result screen
            ) order by o.id
          ), '[]'::jsonb)
          from dsemcq_question_options o
          where o.question_id = q.id
        )
      ) as q_obj
    from unnest(v_quiz.question_ids) with ordinality as qid_row(qid, ordinality)
    join dsemcq_questions q on q.id = qid_row.qid
    -- Removed: where q.is_active = true
    -- Reason: questions in question_ids were already qualified at assembly time;
    --         filtering here causes empty results if is_active changed post-assembly.
  ) sub;

  return v_result;
end;
$$;

grant execute on function get_quiz_for_attempt(text) to authenticated;

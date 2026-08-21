-- Exhaustive free-tier question count for Explore.
-- Counts distinct active questions reachable through published free exercises
-- and configured free passage exemptions, without relying on client pagination.

create or replace function get_public_explore_free_question_count()
returns integer
language sql
security definer
set search_path = public
as $$
with free_exempt_passages as (
  select jsonb_array_elements_text(
    case
      when jsonb_typeof(settings.value) = 'array' then settings.value
      else '[]'::jsonb
    end
  ) as passage_id
  from dsemcq_app_settings settings
  where settings.key = 'exempt_passage_ids'
),
free_quiz_question_ids as (
  select distinct question_ids.question_id
  from dsemcq_quizzes quizzes
  cross join lateral unnest(quizzes.question_ids) as question_ids(question_id)
  where quizzes.is_published = true
    and quizzes.is_active = true
    and quizzes.min_points_required <= 0
    and (
      quizzes.type = 'exercise'
      or quizzes.passage_id in (select passage_id from free_exempt_passages)
    )
)
select count(distinct questions.id)::int
from free_quiz_question_ids ids
join dsemcq_questions questions on questions.id = ids.question_id
where questions.is_active = true;
$$;

revoke all on function get_public_explore_free_question_count() from public;
grant execute on function get_public_explore_free_question_count() to anon, authenticated;
notify pgrst, 'reload schema';

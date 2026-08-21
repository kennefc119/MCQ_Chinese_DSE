-- Distinct active-question skill distribution for the full Explore question bank.
-- Cross-passage questions count once here, unlike passage-specific coverage.

create or replace function get_public_explore_skill_totals()
returns jsonb
language sql
security definer
set search_path = public
as $$
with active_question_skills as (
  select
    questions.id as question_id,
    coalesce(tags.tag_id, 'unclassified') as skill_id
  from dsemcq_questions questions
  left join dsemcq_question_tags tags on tags.question_id = questions.id
  where questions.is_active = true
),
skill_counts as (
  select skill_id, count(distinct question_id)::int as question_count
  from active_question_skills
  group by skill_id
)
select coalesce(
  jsonb_object_agg(skill_id, question_count),
  '{}'::jsonb
)
from skill_counts;
$$;

revoke all on function get_public_explore_skill_totals() from public;
grant execute on function get_public_explore_skill_totals() to anon, authenticated;
notify pgrst, 'reload schema';

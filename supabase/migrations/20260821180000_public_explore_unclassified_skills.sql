-- Make the passage skill breakdown exhaustive by including active questions
-- that do not currently have a skill tag.

create or replace function get_public_explore_skill_breakdown()
returns jsonb
language sql
security definer
set search_path = public
as $$
with active_passage_question_links as (
  select q.id as question_id, q.passage_id
  from dsemcq_questions q
  where q.is_active = true
    and q.passage_id is not null

  union all

  select q.id as question_id, q.cross_passage_id as passage_id
  from dsemcq_questions q
  where q.is_active = true
    and q.cross_passage_id is not null
),
passage_skill_counts as (
  select
    links.passage_id,
    tags.tag_id,
    count(distinct links.question_id)::int as question_count
  from active_passage_question_links links
  join dsemcq_question_tags tags on tags.question_id = links.question_id
  group by links.passage_id, tags.tag_id
),
passage_tagged_breakdown as (
  select
    passage_id,
    jsonb_object_agg(tag_id, question_count) as skill_counts
  from passage_skill_counts
  group by passage_id
),
passage_unclassified_counts as (
  select
    links.passage_id,
    count(distinct links.question_id)::int as question_count
  from active_passage_question_links links
  left join dsemcq_question_tags tags on tags.question_id = links.question_id
  where tags.question_id is null
  group by links.passage_id
),
passage_breakdown as (
  select
    passages.id as passage_id,
    coalesce(tagged.skill_counts, '{}'::jsonb)
      || jsonb_build_object(
        'unclassified', coalesce(unclassified.question_count, 0)
      ) as skill_counts
  from dsemcq_passages passages
  left join passage_tagged_breakdown tagged on tagged.passage_id = passages.id
  left join passage_unclassified_counts unclassified on unclassified.passage_id = passages.id
)
select coalesce(
  jsonb_object_agg(breakdown.passage_id, breakdown.skill_counts),
  '{}'::jsonb
)
from passage_breakdown breakdown;
$$;

revoke all on function get_public_explore_skill_breakdown() from public;
grant execute on function get_public_explore_skill_breakdown() to anon, authenticated;
notify pgrst, 'reload schema';

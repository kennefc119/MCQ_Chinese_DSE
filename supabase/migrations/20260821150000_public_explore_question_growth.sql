-- Add active-question growth data to the public Explore statistics payload.
-- The existing RPC name is preserved so the app needs no second network request.

-- The linked project predates the repository's created_at column on questions.
-- Keep legacy rows NULL because their historical creation dates are unknown;
-- the default timestamps only newly inserted questions going forward.
alter table dsemcq_questions
  add column if not exists created_at timestamptz;

alter table dsemcq_questions
  alter column created_at set default now();

create index if not exists idx_questions_active_created_at
  on dsemcq_questions(created_at)
  where is_active = true and created_at is not null;

create or replace function get_public_explore_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
with active_passage_question_links as (
  select q.id as question_id, q.passage_id, q.created_at
  from dsemcq_questions q
  where q.is_active = true
    and q.passage_id is not null

  union all

  select q.id as question_id, q.cross_passage_id as passage_id, q.created_at
  from dsemcq_questions q
  where q.is_active = true
    and q.cross_passage_id is not null
),
passage_counts as (
  select
    p.id,
    count(distinct links.question_id)::int as active_question_count
  from dsemcq_passages p
  left join active_passage_question_links links on links.passage_id = p.id
  group by p.id
),
recent_passage_counts as (
  select
    p.id,
    count(distinct links.question_id)::int as active_question_count_added
  from dsemcq_passages p
  left join active_passage_question_links links
    on links.passage_id = p.id
    and links.created_at >= now() - interval '14 days'
  group by p.id
),
active_quizzes as (
  select q.id, q.order_no
  from dsemcq_quizzes q
  where q.is_published = true
    and q.is_active = true
),
submitted_attempts as (
  select
    a.quiz_id,
    a.user_id,
    (a.score::numeric / nullif(a.total, 0)::numeric) * 100 as score_pct
  from dsemcq_attempts a
  join active_quizzes q on q.id = a.quiz_id
  where a.status = 'submitted'
    and a.total > 0
    and a.score is not null
),
quiz_attempt_counts as (
  select
    quiz_id,
    count(*)::int as submitted_attempt_count
  from submitted_attempts
  group by quiz_id
),
best_student_scores as (
  select
    quiz_id,
    user_id,
    max(score_pct) as best_score_pct
  from submitted_attempts
  group by quiz_id, user_id
),
quiz_performance as (
  select
    quiz_id,
    count(*)::int as distinct_participant_count,
    avg(best_score_pct) as average_score_pct
  from best_student_scores
  group by quiz_id
),
eligible_quizzes as (
  select quiz_id
  from quiz_performance
  where distinct_participant_count >= 5
),
global_performance as (
  select avg(scores.best_score_pct) as eligible_global_average_pct
  from best_student_scores scores
  join eligible_quizzes eligible on eligible.quiz_id = scores.quiz_id
),
ranked_popularity as (
  select
    counts.quiz_id,
    counts.submitted_attempt_count,
    row_number() over (
      order by counts.submitted_attempt_count desc, counts.quiz_id
    ) as popularity_rank
  from quiz_attempt_counts counts
),
top_cutoff as (
  select ceil(count(*)::numeric * 0.10)::int as cutoff_rank
  from quiz_attempt_counts
),
top_threshold as (
  select min(ranked.submitted_attempt_count) as threshold
  from ranked_popularity ranked
  cross join top_cutoff cutoff
  where ranked.popularity_rank <= cutoff.cutoff_rank
),
quiz_stats as (
  select
    quizzes.id as quiz_id,
    coalesce(attempts.submitted_attempt_count, 0)::int as submitted_attempt_count,
    coalesce(performance.distinct_participant_count, 0)::int as distinct_participant_count,
    case
      when performance.average_score_pct is null then null
      else round(performance.average_score_pct, 1)
    end as average_score_pct,
    case
      when performance.distinct_participant_count >= 5
        then round(baseline.eligible_global_average_pct, 1)
      else null
    end as eligible_global_average_pct,
    (
      coalesce(attempts.submitted_attempt_count, 0) > 0
      and coalesce(attempts.submitted_attempt_count, 0) >= coalesce(cutoff.threshold, -1)
    ) as top_10_percent_hit,
    coalesce((
      performance.distinct_participant_count >= 5
      and performance.average_score_pct < baseline.eligible_global_average_pct
    ), false) as low_performance,
    quizzes.order_no
  from active_quizzes quizzes
  left join quiz_attempt_counts attempts on attempts.quiz_id = quizzes.id
  left join quiz_performance performance on performance.quiz_id = quizzes.id
  cross join global_performance baseline
  cross join top_threshold cutoff
)
select jsonb_build_object(
  'passage_question_counts', (
    select coalesce(
      jsonb_object_agg(counts.id, counts.active_question_count),
      '{}'::jsonb
    )
    from passage_counts counts
  ),
  'passage_question_increases_14d', (
    select coalesce(
      jsonb_object_agg(counts.id, counts.active_question_count_added),
      '{}'::jsonb
    )
    from recent_passage_counts counts
  ),
  'quiz_stats', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'quiz_id', stats.quiz_id,
          'submitted_attempt_count', stats.submitted_attempt_count,
          'distinct_participant_count', stats.distinct_participant_count,
          'average_score_pct', stats.average_score_pct,
          'eligible_global_average_pct', stats.eligible_global_average_pct,
          'top_10_percent_hit', stats.top_10_percent_hit,
          'low_performance', stats.low_performance
        )
        order by stats.order_no, stats.quiz_id
      ),
      '[]'::jsonb
    )
    from quiz_stats stats
  )
);
$$;

revoke all on function get_public_explore_stats() from public;
grant execute on function get_public_explore_stats() to anon, authenticated;
notify pgrst, 'reload schema';

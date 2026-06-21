-- Premium benchmarking RPCs for DiscoverSelf and QuizResult.
--
-- Security model:
-- - Caller must be authenticated and can only request their own user_id.
-- - Premium-only gate is enforced in SQL.
-- - Non-premium callers receive only { allowed: false } with no analysis payload.

create or replace function get_premium_user_comparison(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tier text;
  v_points numeric := 0;
  v_completed_questions numeric := 0;
  v_completed_quizzes numeric := 0;
  v_accuracy numeric := 0;

  v_points_pct numeric := 0;
  v_questions_pct numeric := 0;
  v_quizzes_pct numeric := 0;
  v_accuracy_pct numeric := 0;

  v_points_box jsonb;
  v_questions_box jsonb;
  v_quizzes_box jsonb;
  v_accuracy_box jsonb;

  v_passage_avg jsonb := '{}'::jsonb;
  v_skill_avg jsonb := '{}'::jsonb;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if v_caller <> p_user_id then
    raise exception 'Forbidden';
  end if;

  select p.subscription_tier
    into v_tier
  from dsemcq_profiles p
  where p.id = p_user_id;

  if coalesce(v_tier, 'free') <> 'premium' then
    return jsonb_build_object('allowed', false);
  end if;

  -- User metrics
  select coalesce(p.wenyuan_points, 0)
    into v_points
  from dsemcq_profiles p
  where p.id = p_user_id;

  with user_attempts as (
    select
      coalesce(sum(a.total), 0)::numeric as completed_questions,
      count(*)::numeric as completed_quizzes,
      coalesce(sum(a.score), 0)::numeric as correct_questions,
      coalesce(sum(a.total), 0)::numeric as total_questions
    from dsemcq_attempts a
    where a.user_id = p_user_id
      and a.status = 'submitted'
      and a.total > 0
  )
  select
    ua.completed_questions,
    ua.completed_quizzes,
    case when ua.total_questions > 0 then round((ua.correct_questions / ua.total_questions) * 100.0, 1) else 0 end
  into v_completed_questions, v_completed_quizzes, v_accuracy
  from user_attempts ua;

  -- Points distribution across all users
  with dist as (
    select
      p.id,
      coalesce(p.wenyuan_points, 0)::numeric as v,
      percent_rank() over (order by coalesce(p.wenyuan_points, 0)::numeric asc) as pr
    from dsemcq_profiles p
  )
  select round(coalesce(d.pr, 0) * 100.0, 1)
    into v_points_pct
  from dist d
  where d.id = p_user_id;

  with vals as (
    select coalesce(p.wenyuan_points, 0)::numeric as v
    from dsemcq_profiles p
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round(coalesce(percentile_cont(0.25) within group (order by v), 0), 1),
      'median', round(coalesce(percentile_cont(0.5) within group (order by v), 0), 1),
      'q3', round(coalesce(percentile_cont(0.75) within group (order by v), 0), 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_points_box
  from vals;

  -- Per-user aggregates for non-point metrics (users with submitted attempts only)
  with per_user as (
    select
      a.user_id,
      coalesce(sum(a.total), 0)::numeric as completed_questions,
      count(*)::numeric as completed_quizzes,
      case when coalesce(sum(a.total), 0) > 0
        then (coalesce(sum(a.score), 0)::numeric / sum(a.total)::numeric) * 100.0
        else 0 end as accuracy
    from dsemcq_attempts a
    where a.status = 'submitted'
      and a.total > 0
    group by a.user_id
  ), dist as (
    select
      pu.*,
      percent_rank() over (order by pu.completed_questions asc) as pr_questions,
      percent_rank() over (order by pu.completed_quizzes asc) as pr_quizzes,
      percent_rank() over (order by pu.accuracy asc) as pr_accuracy
    from per_user pu
  )
  select
    round(coalesce(d.pr_questions, 0) * 100.0, 1),
    round(coalesce(d.pr_quizzes, 0) * 100.0, 1),
    round(coalesce(d.pr_accuracy, 0) * 100.0, 1)
  into v_questions_pct, v_quizzes_pct, v_accuracy_pct
  from dist d
  where d.user_id = p_user_id;

  with vals as (
    select coalesce(sum(a.total), 0)::numeric as v
    from dsemcq_attempts a
    where a.status = 'submitted' and a.total > 0
    group by a.user_id
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round(coalesce(percentile_cont(0.25) within group (order by v), 0), 1),
      'median', round(coalesce(percentile_cont(0.5) within group (order by v), 0), 1),
      'q3', round(coalesce(percentile_cont(0.75) within group (order by v), 0), 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_questions_box
  from vals;

  with vals as (
    select count(*)::numeric as v
    from dsemcq_attempts a
    where a.status = 'submitted' and a.total > 0
    group by a.user_id
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round(coalesce(percentile_cont(0.25) within group (order by v), 0), 1),
      'median', round(coalesce(percentile_cont(0.5) within group (order by v), 0), 1),
      'q3', round(coalesce(percentile_cont(0.75) within group (order by v), 0), 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_quizzes_box
  from vals;

  with vals as (
    select
      case when sum(a.total) > 0
        then (coalesce(sum(a.score), 0)::numeric / sum(a.total)::numeric) * 100.0
        else 0 end as v
    from dsemcq_attempts a
    where a.status = 'submitted' and a.total > 0
    group by a.user_id
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round(coalesce(percentile_cont(0.25) within group (order by v), 0), 1),
      'median', round(coalesce(percentile_cont(0.5) within group (order by v), 0), 1),
      'q3', round(coalesce(percentile_cont(0.75) within group (order by v), 0), 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_accuracy_box
  from vals;

  -- Passage average baseline (average of each user's passage accuracy)
  with per_user_passage as (
    select
      q.passage_id,
      a.user_id,
      case when sum(a.total) > 0
        then (coalesce(sum(a.score), 0)::numeric / sum(a.total)::numeric) * 100.0
        else 0 end as acc
    from dsemcq_attempts a
    join dsemcq_quizzes q on q.id = a.quiz_id
    where a.status = 'submitted'
      and a.total > 0
      and q.passage_id is not null
    group by q.passage_id, a.user_id
  )
  select coalesce(jsonb_object_agg(t.passage_id, t.avg_acc), '{}'::jsonb)
    into v_passage_avg
  from (
    select passage_id, round(avg(acc), 1) as avg_acc
    from per_user_passage
    group by passage_id
  ) t;

  -- Skill average baseline (average of each user's skill accuracy)
  with per_user_skill as (
    select
      qt.tag_id,
      a.user_id,
      avg(case when aa.is_correct then 1.0 else 0.0 end) * 100.0 as acc
    from dsemcq_attempts a
    join dsemcq_attempt_answers aa on aa.attempt_id = a.id
    join dsemcq_question_tags qt on qt.question_id = aa.question_id
    where a.status = 'submitted'
      and aa.is_correct is not null
    group by qt.tag_id, a.user_id
  )
  select coalesce(jsonb_object_agg(t.tag_id, t.avg_acc), '{}'::jsonb)
    into v_skill_avg
  from (
    select tag_id, round(avg(acc), 1) as avg_acc
    from per_user_skill
    group by tag_id
  ) t;

  return jsonb_build_object(
    'allowed', true,
    'metrics', jsonb_build_object(
      'points', jsonb_build_object('value', round(v_points, 1), 'percentile', coalesce(v_points_pct, 0), 'box', coalesce(v_points_box, '{}'::jsonb)),
      'accuracy', jsonb_build_object('value', round(v_accuracy, 1), 'percentile', coalesce(v_accuracy_pct, 0), 'box', coalesce(v_accuracy_box, '{}'::jsonb)),
      'completed_questions', jsonb_build_object('value', round(v_completed_questions, 1), 'percentile', coalesce(v_questions_pct, 0), 'box', coalesce(v_questions_box, '{}'::jsonb)),
      'completed_quizzes', jsonb_build_object('value', round(v_completed_quizzes, 1), 'percentile', coalesce(v_quizzes_pct, 0), 'box', coalesce(v_quizzes_box, '{}'::jsonb))
    ),
    'passage_avg_by_id', coalesce(v_passage_avg, '{}'::jsonb),
    'skill_avg_by_tag', coalesce(v_skill_avg, '{}'::jsonb)
  );
end;
$$;

grant execute on function get_premium_user_comparison(uuid) to authenticated;


create or replace function get_quiz_percentile_feedback(p_quiz_id text, p_user_id uuid, p_attempt_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tier text;
  v_participants integer := 0;
  v_user_pct numeric := 0;
  v_percentile numeric := null;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if v_caller <> p_user_id then
    raise exception 'Forbidden';
  end if;

  select p.subscription_tier
    into v_tier
  from dsemcq_profiles p
  where p.id = p_user_id;

  if coalesce(v_tier, 'free') <> 'premium' then
    return jsonb_build_object('allowed', false);
  end if;

  -- Use the user's submitted attempt score for this result view.
  select
    case when a.total > 0 then (a.score::numeric / a.total::numeric) * 100.0 else 0 end
  into v_user_pct
  from dsemcq_attempts a
  where a.id = p_attempt_id::uuid
    and a.user_id = p_user_id
    and a.quiz_id = p_quiz_id
    and a.status = 'submitted'
    and a.total > 0
  limit 1;

  if v_user_pct is null then
    return jsonb_build_object(
      'allowed', true,
      'participant_count', 0,
      'percentile', null
    );
  end if;

  -- Compare against best submitted performance per user on same quiz_id.
  with per_user as (
    select
      a.user_id,
      max((a.score::numeric / nullif(a.total, 0)::numeric) * 100.0) as best_pct
    from dsemcq_attempts a
    where a.quiz_id = p_quiz_id
      and a.status = 'submitted'
      and a.total > 0
    group by a.user_id
  )
  select count(*)::int into v_participants from per_user;

  if coalesce(v_participants, 0) <= 10 then
    return jsonb_build_object(
      'allowed', true,
      'participant_count', coalesce(v_participants, 0),
      'percentile', null
    );
  end if;

  with per_user as (
    select
      a.user_id,
      max((a.score::numeric / nullif(a.total, 0)::numeric) * 100.0) as best_pct
    from dsemcq_attempts a
    where a.quiz_id = p_quiz_id
      and a.status = 'submitted'
      and a.total > 0
    group by a.user_id
  )
  select round((sum(case when pu.best_pct <= v_user_pct then 1 else 0 end)::numeric / count(*)::numeric) * 100.0, 1)
    into v_percentile
  from per_user pu;

  return jsonb_build_object(
    'allowed', true,
    'participant_count', coalesce(v_participants, 0),
    'percentile', v_percentile
  );
end;
$$;

grant execute on function get_quiz_percentile_feedback(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

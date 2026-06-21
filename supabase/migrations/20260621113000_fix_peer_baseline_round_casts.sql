-- Fix: admin_refresh_peer_baselines failed with
--   function round(double precision, integer) does not exist
-- in percentile/avg expressions.

create or replace function admin_refresh_peer_baselines()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_snapshot_id uuid;
  v_users_counted integer := 0;
  v_attempts_counted integer := 0;

  v_points_box jsonb := '{}'::jsonb;
  v_questions_box jsonb := '{}'::jsonb;
  v_quizzes_box jsonb := '{}'::jsonb;
  v_accuracy_box jsonb := '{}'::jsonb;

  v_passage_avg jsonb := '{}'::jsonb;
  v_skill_avg jsonb := '{}'::jsonb;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from dsemcq_profiles p
    where p.id = v_caller
      and p.role = 'admin'
  ) then
    raise exception 'Forbidden';
  end if;

  select count(*)::int into v_users_counted from dsemcq_profiles;

  select count(*)::int into v_attempts_counted
  from dsemcq_attempts a
  where a.status = 'submitted'
    and a.total > 0;

  with vals as (
    select coalesce(p.wenyuan_points, 0)::numeric as v
    from dsemcq_profiles p
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round((coalesce(percentile_cont(0.25) within group (order by v), 0))::numeric, 1),
      'median', round((coalesce(percentile_cont(0.5) within group (order by v), 0))::numeric, 1),
      'q3', round((coalesce(percentile_cont(0.75) within group (order by v), 0))::numeric, 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_points_box
  from vals;

  with vals as (
    select coalesce(sum(a.total), 0)::numeric as v
    from dsemcq_attempts a
    where a.status = 'submitted'
      and a.total > 0
    group by a.user_id
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round((coalesce(percentile_cont(0.25) within group (order by v), 0))::numeric, 1),
      'median', round((coalesce(percentile_cont(0.5) within group (order by v), 0))::numeric, 1),
      'q3', round((coalesce(percentile_cont(0.75) within group (order by v), 0))::numeric, 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_questions_box
  from vals;

  with vals as (
    select count(*)::numeric as v
    from dsemcq_attempts a
    where a.status = 'submitted'
      and a.total > 0
    group by a.user_id
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round((coalesce(percentile_cont(0.25) within group (order by v), 0))::numeric, 1),
      'median', round((coalesce(percentile_cont(0.5) within group (order by v), 0))::numeric, 1),
      'q3', round((coalesce(percentile_cont(0.75) within group (order by v), 0))::numeric, 1),
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
    where a.status = 'submitted'
      and a.total > 0
    group by a.user_id
  )
  select jsonb_build_object(
      'min', round(coalesce(min(v), 0), 1),
      'q1', round((coalesce(percentile_cont(0.25) within group (order by v), 0))::numeric, 1),
      'median', round((coalesce(percentile_cont(0.5) within group (order by v), 0))::numeric, 1),
      'q3', round((coalesce(percentile_cont(0.75) within group (order by v), 0))::numeric, 1),
      'max', round(coalesce(max(v), 0), 1)
    )
    into v_accuracy_box
  from vals;

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
    select passage_id, round(avg(acc)::numeric, 1) as avg_acc
    from per_user_passage
    group by passage_id
  ) t;

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
    select tag_id, round(avg(acc)::numeric, 1) as avg_acc
    from per_user_skill
    group by tag_id
  ) t;

  delete from dsemcq_peer_baseline_snapshot where true;

  insert into dsemcq_peer_baseline_snapshot (
    generated_by,
    users_counted,
    attempts_counted,
    metrics,
    passage_avg_by_id,
    skill_avg_by_tag
  ) values (
    v_caller,
    coalesce(v_users_counted, 0),
    coalesce(v_attempts_counted, 0),
    jsonb_build_object(
      'points_box', coalesce(v_points_box, '{}'::jsonb),
      'questions_box', coalesce(v_questions_box, '{}'::jsonb),
      'quizzes_box', coalesce(v_quizzes_box, '{}'::jsonb),
      'accuracy_box', coalesce(v_accuracy_box, '{}'::jsonb)
    ),
    coalesce(v_passage_avg, '{}'::jsonb),
    coalesce(v_skill_avg, '{}'::jsonb)
  )
  returning id into v_snapshot_id;

  with attempts_by_user as (
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
  ),
  base as (
    select
      p.id as user_id,
      coalesce(p.wenyuan_points, 0)::numeric as points,
      coalesce(abu.completed_questions, 0)::numeric as completed_questions,
      coalesce(abu.completed_quizzes, 0)::numeric as completed_quizzes,
      coalesce(abu.accuracy, 0)::numeric as accuracy
    from dsemcq_profiles p
    left join attempts_by_user abu on abu.user_id = p.id
  ),
  ranks as (
    select
      b.*,
      percent_rank() over (order by b.points asc) as pr_points,
      percent_rank() over (order by b.completed_questions asc) as pr_questions,
      percent_rank() over (order by b.completed_quizzes asc) as pr_quizzes,
      percent_rank() over (order by b.accuracy asc) as pr_accuracy
    from base b
  )
  insert into dsemcq_user_peer_percentiles (snapshot_id, user_id, metrics)
  select
    v_snapshot_id,
    r.user_id,
    jsonb_build_object(
      'points', jsonb_build_object(
        'value', round(r.points, 1),
        'percentile', round(coalesce(r.pr_points, 0) * 100.0, 1)
      ),
      'accuracy', jsonb_build_object(
        'value', round(r.accuracy, 1),
        'percentile', round(coalesce(r.pr_accuracy, 0) * 100.0, 1)
      ),
      'completed_questions', jsonb_build_object(
        'value', round(r.completed_questions, 1),
        'percentile', round(coalesce(r.pr_questions, 0) * 100.0, 1)
      ),
      'completed_quizzes', jsonb_build_object(
        'value', round(r.completed_quizzes, 1),
        'percentile', round(coalesce(r.pr_quizzes, 0) * 100.0, 1)
      )
    )
  from ranks r;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'users_counted', coalesce(v_users_counted, 0),
    'attempts_counted', coalesce(v_attempts_counted, 0)
  );
end;
$$;

grant execute on function admin_refresh_peer_baselines() to authenticated;

notify pgrst, 'reload schema';

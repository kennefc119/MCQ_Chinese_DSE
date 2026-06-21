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

  if coalesce(v_participants, 0) <= 3 then
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

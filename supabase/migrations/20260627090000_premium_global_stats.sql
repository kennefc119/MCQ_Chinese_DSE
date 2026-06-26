-- Premium global anonymized stats for DiscoverSelf premium users.
--
-- Returns:
-- 1) Passage accuracy rates as percentages only.
-- 2) Anonymous distribution + top ranking for cards answered and ManYuen points.

create or replace function get_premium_global_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tier text;

  v_passage_rates jsonb := '[]'::jsonb;

  v_cards_user_value numeric := 0;
  v_cards_percentile numeric := 0;
  v_cards_rank integer := null;
  v_cards_top10 jsonb := '[]'::jsonb;
  v_cards_top30 jsonb := '[]'::jsonb;

  v_points_user_value numeric := 0;
  v_points_percentile numeric := 0;
  v_points_rank integer := null;
  v_points_top10 jsonb := '[]'::jsonb;
  v_points_top30 jsonb := '[]'::jsonb;
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

  -- Passage accuracy rate (percentage only, no raw counts returned).
  with rates as (
    select
      p.id as passage_id,
      p.title as passage_title,
      round((avg(case when aa.is_correct then 1.0 else 0.0 end) * 100.0)::numeric, 1) as rate_pct
    from dsemcq_passages p
    join dsemcq_questions q
      on q.passage_id = p.id
    join dsemcq_attempt_answers aa
      on aa.question_id = q.id
     and aa.is_correct is not null
    group by p.id, p.title
    order by rate_pct asc, p.order_no asc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'passage_id', r.passage_id,
        'passage_title', r.passage_title,
        'rate_pct', r.rate_pct
      )
      order by r.rate_pct asc, r.passage_title asc
    ),
    '[]'::jsonb
  )
  into v_passage_rates
  from rates r;

  -- Anonymous distribution for completed ManYuen cards (submitted attempts).
  with per_user as (
    select
      p.id as user_id,
      coalesce(count(a.id), 0)::numeric as v
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id
  ), ranked as (
    select
      pu.user_id,
      pu.v,
      row_number() over (order by pu.v desc, pu.user_id asc) as rn,
      percent_rank() over (order by pu.v asc, pu.user_id asc) as pr
    from per_user pu
  )
  select
    coalesce(r.v, 0),
    round((coalesce(r.pr, 0) * 100.0)::numeric, 1),
    r.rn
  into v_cards_user_value, v_cards_percentile, v_cards_rank
  from ranked r
  where r.user_id = p_user_id;

  with per_user as (
    select
      p.id as user_id,
      coalesce(count(a.id), 0)::numeric as v
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id
  ), ranked as (
    select
      pu.user_id,
      pu.v,
      row_number() over (order by pu.v desc, pu.user_id asc) as rn
    from per_user pu
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', r.v,
        'is_current_user', (r.user_id = p_user_id)
      )
      order by r.rn asc
    ),
    '[]'::jsonb
  )
  into v_cards_top10
  from ranked r
  where r.rn <= 10;

  with per_user as (
    select
      p.id as user_id,
      coalesce(count(a.id), 0)::numeric as v
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id
  ), ranked as (
    select
      pu.user_id,
      pu.v,
      row_number() over (order by pu.v desc, pu.user_id asc) as rn
    from per_user pu
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', r.v,
        'is_current_user', (r.user_id = p_user_id)
      )
      order by r.rn asc
    ),
    '[]'::jsonb
  )
  into v_cards_top30
  from ranked r
  where r.rn <= 30;

  -- Anonymous distribution for ManYuen points.
  with ranked as (
    select
      p.id as user_id,
      coalesce(p.wenyuan_points, 0)::numeric as v,
      row_number() over (order by coalesce(p.wenyuan_points, 0) desc, p.id asc) as rn,
      percent_rank() over (order by coalesce(p.wenyuan_points, 0) asc, p.id asc) as pr
    from dsemcq_profiles p
  )
  select
    coalesce(r.v, 0),
    round((coalesce(r.pr, 0) * 100.0)::numeric, 1),
    r.rn
  into v_points_user_value, v_points_percentile, v_points_rank
  from ranked r
  where r.user_id = p_user_id;

  with ranked as (
    select
      p.id as user_id,
      coalesce(p.wenyuan_points, 0)::numeric as v,
      row_number() over (order by coalesce(p.wenyuan_points, 0) desc, p.id asc) as rn
    from dsemcq_profiles p
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', r.v,
        'is_current_user', (r.user_id = p_user_id)
      )
      order by r.rn asc
    ),
    '[]'::jsonb
  )
  into v_points_top10
  from ranked r
  where r.rn <= 10;

  with ranked as (
    select
      p.id as user_id,
      coalesce(p.wenyuan_points, 0)::numeric as v,
      row_number() over (order by coalesce(p.wenyuan_points, 0) desc, p.id asc) as rn
    from dsemcq_profiles p
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', r.v,
        'is_current_user', (r.user_id = p_user_id)
      )
      order by r.rn asc
    ),
    '[]'::jsonb
  )
  into v_points_top30
  from ranked r
  where r.rn <= 30;

  return jsonb_build_object(
    'allowed', true,
    'passage_accuracy_rates', coalesce(v_passage_rates, '[]'::jsonb),
    'cards_answered', jsonb_build_object(
      'user_value', round(coalesce(v_cards_user_value, 0), 1),
      'user_percentile', coalesce(v_cards_percentile, 0),
      'user_rank', v_cards_rank,
      'is_user_top10', coalesce(v_cards_rank, 999999) <= 10,
      'top10', coalesce(v_cards_top10, '[]'::jsonb),
      'top30', coalesce(v_cards_top30, '[]'::jsonb)
    ),
    'man_yuen_points', jsonb_build_object(
      'user_value', round(coalesce(v_points_user_value, 0), 1),
      'user_percentile', coalesce(v_points_percentile, 0),
      'user_rank', v_points_rank,
      'is_user_top10', coalesce(v_points_rank, 999999) <= 10,
      'top10', coalesce(v_points_top10, '[]'::jsonb),
      'top30', coalesce(v_points_top30, '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function get_premium_global_stats(uuid) to authenticated;

notify pgrst, 'reload schema';

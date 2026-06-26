-- Extend premium global stats:
-- 1) top10 usernames for cards answered / ManYuen points
-- 2) add a sample-size-aware combined-performance ranking metric (top10 + top30 + percentile)

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

  v_combined_user_value numeric := 0;
  v_combined_percentile numeric := 0;
  v_combined_rank integer := null;
  v_combined_top10 jsonb := '[]'::jsonb;
  v_combined_top30 jsonb := '[]'::jsonb;
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

  -- Cards answered ranking
  with per_user as (
    select
      p.id as user_id,
      p.username,
      coalesce(count(a.id), 0)::numeric as v
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id, p.username
  ), ranked as (
    select
      pu.user_id,
      pu.username,
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
      p.username,
      coalesce(count(a.id), 0)::numeric as v
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id, p.username
  ), ranked as (
    select
      pu.user_id,
      pu.username,
      pu.v,
      row_number() over (order by pu.v desc, pu.user_id asc) as rn
    from per_user pu
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', r.v,
        'is_current_user', (r.user_id = p_user_id),
        'username', r.username
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

  -- ManYuen points ranking
  with ranked as (
    select
      p.id as user_id,
      p.username,
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
      p.username,
      coalesce(p.wenyuan_points, 0)::numeric as v,
      row_number() over (order by coalesce(p.wenyuan_points, 0) desc, p.id asc) as rn
    from dsemcq_profiles p
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', r.v,
        'is_current_user', (r.user_id = p_user_id),
        'username', r.username
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

  -- Combined performance ranking (submitted attempts only)
  with per_user as (
    select
      p.id as user_id,
      p.username,
      coalesce(sum(a.total), 0) as total_questions,
      coalesce(sum(a.score), 0) as correct_answers,
      case
        when coalesce(sum(a.total), 0) > 0 then (coalesce(sum(a.score), 0)::numeric / sum(a.total)::numeric) * 100.0
        else 0
      end as accuracy_pct
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id, p.username
  ), stats as (
    select coalesce(max(total_questions), 0) as max_total_questions
    from per_user
  ), ranked as (
    select
      pu.user_id,
      pu.username,
      pu.total_questions,
      pu.correct_answers,
      pu.accuracy_pct,
      case
        when pu.total_questions > 0 and stats.max_total_questions > 0 then
          round(
            (
              (0.30 * pu.accuracy_pct)
              + (0.70 * sqrt(pu.total_questions::numeric / stats.max_total_questions::numeric) * 100.0)
            )::numeric,
            1
          )
        else 0
      end as v,
      row_number() over (
        order by
          (
            (0.30 * pu.accuracy_pct)
            + (0.70 * case
                when stats.max_total_questions > 0 then sqrt(pu.total_questions::numeric / stats.max_total_questions::numeric) * 100.0
                else 0
              end)
          ) desc,
          pu.total_questions desc,
          pu.user_id asc
      ) as rn,
      percent_rank() over (
        order by
          (
            (0.30 * pu.accuracy_pct)
            + (0.70 * case
                when stats.max_total_questions > 0 then sqrt(pu.total_questions::numeric / stats.max_total_questions::numeric) * 100.0
                else 0
              end)
          ) asc,
          pu.total_questions asc,
          pu.user_id asc
      ) as pr
    from per_user pu
    cross join stats
  )
  select
    round(coalesce(r.v, 0)::numeric, 1),
    round((coalesce(r.pr, 0) * 100.0)::numeric, 1),
    r.rn
  into v_combined_user_value, v_combined_percentile, v_combined_rank
  from ranked r
  where r.user_id = p_user_id;

  with per_user as (
    select
      p.id as user_id,
      p.username,
      case
        when coalesce(sum(a.total), 0) > 0 then (coalesce(sum(a.score), 0)::numeric / sum(a.total)::numeric) * 100.0
        else 0
      end as v
    from dsemcq_profiles p
    left join dsemcq_attempts a
      on a.user_id = p.id
     and a.status = 'submitted'
     and a.total > 0
    group by p.id, p.username
  ), ranked as (
    select
      pu.user_id,
      pu.username,
      pu.v,
      row_number() over (order by pu.v desc, pu.user_id asc) as rn
    from per_user pu
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.rn,
        'value', round(r.v::numeric, 1),
        'is_current_user', (r.user_id = p_user_id),
        'username', r.username
      )
      order by r.rn asc
    ),
    '[]'::jsonb
  )
  into v_combined_top10
  from ranked r
  where r.rn <= 10;

  with per_user as (
    select
      p.id as user_id,
      case
        when coalesce(sum(a.total), 0) > 0 then (coalesce(sum(a.score), 0)::numeric / sum(a.total)::numeric) * 100.0
        else 0
      end as v
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
        'value', round(r.v::numeric, 1),
        'is_current_user', (r.user_id = p_user_id)
      )
      order by r.rn asc
    ),
    '[]'::jsonb
  )
  into v_combined_top30
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
    ),
    'combined_performance', jsonb_build_object(
      'user_value', round(coalesce(v_combined_user_value, 0), 1),
      'user_percentile', coalesce(v_combined_percentile, 0),
      'user_rank', v_combined_rank,
      'is_user_top10', coalesce(v_combined_rank, 999999) <= 10,
      'top10', coalesce(v_combined_top10, '[]'::jsonb),
      'top30', coalesce(v_combined_top30, '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function get_premium_global_stats(uuid) to authenticated;

notify pgrst, 'reload schema';

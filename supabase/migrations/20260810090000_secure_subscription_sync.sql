-- Secure RevenueCat subscription synchronization.
-- Client users cannot grant themselves premium/admin access. RevenueCat
-- events are applied atomically by a service-role-only RPC.

alter table dsemcq_profiles
  add column if not exists subscription_event_at timestamptz,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_will_renew boolean,
  add column if not exists subscription_product_id text;

create table if not exists dsemcq_subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'revenuecat',
  provider_event_id text not null,
  app_user_id uuid,
  event_type text not null,
  event_time timestamptz not null,
  outcome text not null default 'received',
  raw_payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_subscription_events_provider_event_id
  on dsemcq_subscription_events(provider, provider_event_id);

create index if not exists idx_subscription_events_user_time
  on dsemcq_subscription_events(app_user_id, event_time desc);

create index if not exists idx_subscription_events_created
  on dsemcq_subscription_events(created_at desc);

alter table dsemcq_subscription_events enable row level security;

update dsemcq_profiles
set subscription_tier = 'free'
where subscription_status = 'inactive'
  and subscription_tier = 'premium';

alter table dsemcq_profiles
  drop constraint if exists dsemcq_profiles_active_premium_check;
alter table dsemcq_profiles
  add constraint dsemcq_profiles_active_premium_check
  check (subscription_tier <> 'premium' or subscription_status = 'active');

create or replace function dsemcq_protect_profile_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role = 'service_role' or dsemcq_is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.subscription_tier := 'free';
    new.subscription_status := 'active';
    new.subscription_event_at := null;
    new.subscription_expires_at := null;
    new.subscription_will_renew := null;
    new.subscription_product_id := null;
    return new;
  end if;

  if new.role is distinct from old.role
    or new.subscription_tier is distinct from old.subscription_tier
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_event_at is distinct from old.subscription_event_at
    or new.subscription_expires_at is distinct from old.subscription_expires_at
    or new.subscription_will_renew is distinct from old.subscription_will_renew
    or new.subscription_product_id is distinct from old.subscription_product_id
  then
    raise exception 'Protected profile fields may only be changed by the subscription service or an admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists dsemcq_profiles_protect_server_fields on dsemcq_profiles;
create trigger dsemcq_profiles_protect_server_fields
  before insert or update on dsemcq_profiles
  for each row execute function dsemcq_protect_profile_server_fields();

create or replace function apply_revenuecat_subscription_event(
  p_provider_event_id text,
  p_app_user_id uuid,
  p_event_type text,
  p_event_time timestamptz,
  p_expiration_at timestamptz default null,
  p_product_id text default null,
  p_will_renew boolean default null,
  p_raw_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_role text := coalesce(auth.role(), '');
  v_inserted_count integer := 0;
  v_last_event_at timestamptz;
  v_outcome text;
begin
  if v_claim_role <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_provider_event_id is null or btrim(p_provider_event_id) = ''
    or p_event_type is null or btrim(p_event_type) = ''
    or p_event_time is null
  then
    raise exception 'Invalid subscription event';
  end if;

  insert into dsemcq_subscription_events (
    provider,
    provider_event_id,
    app_user_id,
    event_type,
    event_time,
    outcome,
    raw_payload
  ) values (
    'revenuecat',
    p_provider_event_id,
    p_app_user_id,
    p_event_type,
    p_event_time,
    'received',
    coalesce(p_raw_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select subscription_event_at
    into v_last_event_at
  from dsemcq_profiles
  where id = p_app_user_id
  for update;

  if not found then
    v_outcome := 'ignored_profile_not_found';
  elsif v_last_event_at is not null and p_event_time < v_last_event_at then
    v_outcome := 'ignored_stale_event';
  elsif p_event_type in ('INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE') then
    update dsemcq_profiles
    set subscription_tier = 'premium',
        subscription_status = 'active',
        subscription_event_at = p_event_time,
        subscription_expires_at = coalesce(p_expiration_at, subscription_expires_at),
        subscription_will_renew = coalesce(p_will_renew, p_event_type <> 'NON_RENEWING_PURCHASE'),
        subscription_product_id = coalesce(p_product_id, subscription_product_id)
    where id = p_app_user_id;
    v_outcome := 'applied_active';
  elsif p_event_type = 'CANCELLATION' then
    update dsemcq_profiles
    set subscription_event_at = p_event_time,
        subscription_expires_at = coalesce(p_expiration_at, subscription_expires_at),
        subscription_will_renew = false,
        subscription_product_id = coalesce(p_product_id, subscription_product_id)
    where id = p_app_user_id;
    v_outcome := 'applied_cancellation_pending_expiry';
  elsif p_event_type in ('EXPIRATION', 'REFUND', 'SUBSCRIPTION_PAUSED') then
    update dsemcq_profiles
    set subscription_tier = 'free',
        subscription_status = 'inactive',
        subscription_event_at = p_event_time,
        subscription_expires_at = coalesce(p_expiration_at, subscription_expires_at),
        subscription_will_renew = false,
        subscription_product_id = coalesce(p_product_id, subscription_product_id)
    where id = p_app_user_id;
    v_outcome := 'applied_inactive';
  else
    update dsemcq_profiles
    set subscription_event_at = p_event_time,
        subscription_expires_at = coalesce(p_expiration_at, subscription_expires_at),
        subscription_will_renew = coalesce(p_will_renew, subscription_will_renew),
        subscription_product_id = coalesce(p_product_id, subscription_product_id)
    where id = p_app_user_id;
    v_outcome := 'ignored_no_state_change';
  end if;

  update dsemcq_subscription_events
  set outcome = v_outcome,
      processed_at = now()
  where provider = 'revenuecat'
    and provider_event_id = p_provider_event_id;

  return jsonb_build_object('ok', true, 'outcome', v_outcome);
end;
$$;

revoke all on function apply_revenuecat_subscription_event(text, uuid, text, timestamptz, timestamptz, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function apply_revenuecat_subscription_event(text, uuid, text, timestamptz, timestamptz, text, boolean, jsonb) to service_role;

notify pgrst, 'reload schema';
-- RevenueCat webhook sync foundation:
-- 1) Event audit table with idempotency key
-- 2) Ordering guard column on profiles to prevent stale event overwrite

alter table dsemcq_profiles
  add column if not exists subscription_event_at timestamptz;

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

-- No direct client policies for webhook audit table.

notify pgrst, 'reload schema';

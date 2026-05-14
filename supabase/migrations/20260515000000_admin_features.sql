-- ============================================================
-- Admin features: announcements, push tokens, visit/login events,
-- and admin RLS extensions.
-- ============================================================

-- ─── 1. dsemcq_announcements (broadcast messages) ───────────────────────────
do $$ begin create type dsemcq_announcement_type as enum ('info', 'warning', 'success'); exception when duplicate_object then null; end $$;

create table if not exists dsemcq_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  type        dsemcq_announcement_type not null default 'info',
  sent_by     uuid references dsemcq_profiles(id) on delete set null,
  sent_at     timestamptz not null default now(),
  push_sent   boolean not null default false,
  recipients  int not null default 0
);

create index if not exists idx_announcements_sent_at on dsemcq_announcements(sent_at desc);

create table if not exists dsemcq_announcement_reads (
  user_id         uuid not null references dsemcq_profiles(id) on delete cascade,
  announcement_id uuid not null references dsemcq_announcements(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table dsemcq_announcements enable row level security;
drop policy if exists "announcements: auth read"  on dsemcq_announcements;
drop policy if exists "announcements: admin write" on dsemcq_announcements;
create policy "announcements: auth read" on dsemcq_announcements for select
  using (auth.role() = 'authenticated');
create policy "announcements: admin write" on dsemcq_announcements for all
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table dsemcq_announcement_reads enable row level security;
drop policy if exists "announcement_reads: owner all" on dsemcq_announcement_reads;
create policy "announcement_reads: owner all" on dsemcq_announcement_reads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ─── 2. dsemcq_push_tokens (Expo push tokens) ───────────────────────────────
create table if not exists dsemcq_push_tokens (
  user_id          uuid primary key references dsemcq_profiles(id) on delete cascade,
  expo_push_token  text not null,
  platform         text,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_push_tokens_token on dsemcq_push_tokens(expo_push_token);

alter table dsemcq_push_tokens enable row level security;
drop policy if exists "push_tokens: owner all"  on dsemcq_push_tokens;
drop policy if exists "push_tokens: admin read" on dsemcq_push_tokens;
create policy "push_tokens: owner all" on dsemcq_push_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_tokens: admin read" on dsemcq_push_tokens for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ─── 3. dsemcq_visit_events (anonymous visitor tracking) ────────────────────
create table if not exists dsemcq_visit_events (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  user_id     uuid references dsemcq_profiles(id) on delete set null,  -- null = visitor
  event_type  text not null default 'open',                            -- open / view / etc.
  platform    text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_visit_events_occurred_at on dsemcq_visit_events(occurred_at desc);
create index if not exists idx_visit_events_device      on dsemcq_visit_events(device_id, occurred_at desc);

alter table dsemcq_visit_events enable row level security;
drop policy if exists "visit_events: anon insert" on dsemcq_visit_events;
drop policy if exists "visit_events: admin read"  on dsemcq_visit_events;
-- anyone (including anon/guest) may insert their own visit
create policy "visit_events: anon insert" on dsemcq_visit_events for insert
  with check (true);
-- only admins can read aggregated visit data
create policy "visit_events: admin read" on dsemcq_visit_events for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ─── 4. dsemcq_login_events (logged-in session start) ───────────────────────
create table if not exists dsemcq_login_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references dsemcq_profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  platform    text
);

create index if not exists idx_login_events_user        on dsemcq_login_events(user_id, occurred_at desc);
create index if not exists idx_login_events_occurred_at on dsemcq_login_events(occurred_at desc);

alter table dsemcq_login_events enable row level security;
drop policy if exists "login_events: owner insert" on dsemcq_login_events;
drop policy if exists "login_events: admin read"   on dsemcq_login_events;
create policy "login_events: owner insert" on dsemcq_login_events for insert
  with check (auth.uid() = user_id);
create policy "login_events: admin read" on dsemcq_login_events for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ─── 5. Admin RLS extensions on existing tables ─────────────────────────────
-- Admins need to UPDATE other users' profiles (wenyuan_points, subscription_tier)
drop policy if exists "profiles: admin update" on dsemcq_profiles;
create policy "profiles: admin update" on dsemcq_profiles for update
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admins read all attempts (for user-history view)
drop policy if exists "attempts: admin read" on dsemcq_attempts;
create policy "attempts: admin read" on dsemcq_attempts for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "attempt_answers: admin read" on dsemcq_attempt_answers;
create policy "attempt_answers: admin read" on dsemcq_attempt_answers for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admins read all psych results
drop policy if exists "psych_results: admin read" on dsemcq_psych_user_results;
create policy "psych_results: admin read" on dsemcq_psych_user_results for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ============================================================
-- App Settings — key-value store for admin-configurable params
-- ============================================================

create table if not exists dsemcq_app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references dsemcq_profiles(id) on delete set null
);

-- RLS: admin full access, authenticated users can read
alter table dsemcq_app_settings enable row level security;

create policy "admin_full_settings" on dsemcq_app_settings
  for all using (dsemcq_is_admin()) with check (dsemcq_is_admin());

create policy "authenticated_read_settings" on dsemcq_app_settings
  for select using (auth.role() = 'authenticated');

-- Seed defaults
insert into dsemcq_app_settings (key, value) values
  ('max_ai_chat_guest', '10'),
  ('max_ai_chat_basic', '20'),
  ('max_ai_chat_premium', '300'),
  ('exempt_passage_ids', '[]'),
  ('basic_exercise_limit', '9999')
on conflict (key) do nothing;

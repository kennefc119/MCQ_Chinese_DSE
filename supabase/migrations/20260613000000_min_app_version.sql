-- ============================================================
-- Force-update gate: min_app_version setting
--
-- The app reads this on launch and blocks users whose installed
-- binary version is older than the required minimum.
-- Defaults to "1.0.0" so no one is blocked until admin raises it.
-- ============================================================

-- Seed the default value
insert into dsemcq_app_settings (key, value)
values ('min_app_version', '"1.0.0"')
on conflict (key) do nothing;

-- Allow anonymous (unauthenticated) reads so the version check
-- works before the user has logged in.
-- The table holds no sensitive data, only admin-configurable app params.
drop policy if exists "anon_read_settings" on dsemcq_app_settings;
create policy "anon_read_settings" on dsemcq_app_settings
  for select using (true);

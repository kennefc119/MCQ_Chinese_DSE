-- ============================================================
-- Fix: add INSERT RLS policy for dsemcq_profiles
-- Without this, new users cannot create their own profile row.
-- ============================================================

drop policy if exists "profiles: owner insert" on dsemcq_profiles;

create policy "profiles: owner insert" on dsemcq_profiles
  for insert
  with check (auth.uid() = id);

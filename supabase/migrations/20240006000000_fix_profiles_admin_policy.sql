-- Create helper function to check admin role without triggering RLS recursion
-- This function runs as SECURITY DEFINER so it can safely inspect dsemcq_profiles
-- and be used inside RLS policies.

create or replace function dsemcq_is_admin() returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Replace the problematic admin policies to use the helper

-- Profiles: admin read
drop policy if exists "profiles: admin read" on dsemcq_profiles;
create policy "profiles: admin read" on dsemcq_profiles for select using (dsemcq_is_admin());

-- Quizzes: admin all
drop policy if exists "quizzes: admin all" on dsemcq_quizzes;
create policy "quizzes: admin all" on dsemcq_quizzes for all using (dsemcq_is_admin());

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

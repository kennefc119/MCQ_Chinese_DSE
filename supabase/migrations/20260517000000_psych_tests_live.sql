-- ─────────────────────────────────────────────────────────────────────────
-- 20260517000000_psych_tests_live.sql
--
-- Make dsemcq_psych_tests fully queryable by authenticated users and
-- writeable by admins.  Also add mood_image_url support inside results
-- JSONB (no schema change needed — JSONB is schema-less, this migration
-- just documents intent and ensures the GRANT is explicit).
-- ─────────────────────────────────────────────────────────────────────────

-- Ensure PostgREST can serve the table to authenticated (and anon) roles.
-- The existing RLS policy already restricts rows to is_active = true for
-- authenticated users, so anon gets nothing unless we add a policy for it.
grant select on table dsemcq_psych_tests         to authenticated;
grant select on table dsemcq_psych_user_results  to authenticated;
grant insert, update on table dsemcq_psych_user_results to authenticated;

-- Admin users (role = 'admin') can fully manage psych tests from the app.
drop policy if exists "psych_tests: admin all" on dsemcq_psych_tests;
create policy "psych_tests: admin all" on dsemcq_psych_tests for all
  using (exists (
    select 1 from dsemcq_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

-- Signal PostgREST to reload its schema + policy cache immediately.
notify pgrst, 'reload schema';

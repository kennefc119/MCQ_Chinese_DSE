-- Ensure anon and authenticated roles have SELECT on dsemcq_quizzes.
-- RLS policies control row-level visibility, but PostgREST also requires
-- the base table privilege to exist for the role.
-- (Supabase usually auto-grants these via ALTER DEFAULT PRIVILEGES, but
--  this makes it explicit and safe to re-run.)

grant select on table dsemcq_quizzes to anon, authenticated;

-- Signal PostgREST to reload its schema cache so the new policy + grant
-- take effect immediately without waiting for the auto-reload interval.
notify pgrst, 'reload schema';

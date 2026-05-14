-- Allow admins to read ALL advisor messages for usage analytics.
-- Admin check uses the existing dsemcq_is_admin() helper (role = 'admin').

drop policy if exists "advisor: admin read all" on dsemcq_advisor_messages;

create policy "advisor: admin read all"
  on dsemcq_advisor_messages
  for select
  using (dsemcq_is_admin());

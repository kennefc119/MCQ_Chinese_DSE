-- Allow administrators to read V2 advisor messages for usage analytics.
-- The existing owner policy remains in place for normal users.

drop policy if exists "advisor_v2_messages: admin read all" on dsemcq_advisor_v2_messages;

create policy "advisor_v2_messages: admin read all"
  on dsemcq_advisor_v2_messages
  for select
  using (dsemcq_is_admin());

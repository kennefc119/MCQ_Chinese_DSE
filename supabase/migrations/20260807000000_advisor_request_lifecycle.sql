-- Durable lifecycle for advisor requests. Existing completed exchanges remain valid.
alter table dsemcq_advisor_messages
  alter column bot_reply drop not null,
  add column if not exists request_id uuid,
  add column if not exists status text not null default 'completed',
  add column if not exists error_message text,
  add column if not exists processing_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table dsemcq_advisor_messages
  drop constraint if exists dsemcq_advisor_messages_status_check;

alter table dsemcq_advisor_messages
  add constraint dsemcq_advisor_messages_status_check
  check (status in ('pending', 'processing', 'completed', 'failed'));

create unique index if not exists idx_advisor_request_id
  on dsemcq_advisor_messages(request_id)
  where request_id is not null;

create index if not exists idx_advisor_user_request
  on dsemcq_advisor_messages(user_id, request_id);
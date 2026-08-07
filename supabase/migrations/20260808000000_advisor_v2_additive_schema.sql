-- Agentic advisor V2 is additive. Do not alter existing advisor tables here.

create table if not exists dsemcq_advisor_v2_user_preferences (
  user_id                      uuid primary key references dsemcq_profiles(id) on delete cascade,
  v2_opt_in                    boolean not null default false,
  conversation_history_enabled boolean not null default true,
  profile_enabled              boolean not null default true,
  performance_enabled          boolean not null default true,
  question_bank_enabled        boolean not null default true,
  past_paper_enabled           boolean not null default false,
  marking_scheme_enabled       boolean not null default false,
  preference_version           integer not null default 1,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists dsemcq_advisor_v2_pilot_users (
  user_id     uuid primary key references dsemcq_profiles(id) on delete cascade,
  enabled     boolean not null default true,
  cohort      text not null default 'internal',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- V2 owns its messages. V1 advisor messages are never read or written by V2.
create table if not exists dsemcq_advisor_v2_messages (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique,
  user_id       uuid not null references dsemcq_profiles(id) on delete cascade,
  user_text     text not null,
  bot_reply     text,
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  processing_at timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_advisor_v2_messages_user_created
  on dsemcq_advisor_v2_messages(user_id, created_at desc);

create table if not exists dsemcq_advisor_v2_workflow_runs (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null unique,
  advisor_message_id  uuid,
  user_id             uuid not null references dsemcq_profiles(id) on delete cascade,
  status              text not null default 'queued'
                      check (status in ('queued', 'running', 'completed', 'failed')),
  current_stage       text not null default 'queued',
  route               text,
  validated_plan      jsonb not null default '{}'::jsonb,
  workflow_state      jsonb not null default '{}'::jsonb,
  preference_snapshot jsonb not null default '{}'::jsonb,
  source_refs         jsonb not null default '[]'::jsonb,
  source_chips        jsonb not null default '[]'::jsonb,
  personalization_used boolean not null default false,
  prompt_versions     jsonb not null default '{}'::jsonb,
  corpus_versions     jsonb not null default '{}'::jsonb,
  heartbeat_at        timestamptz,
  error_code          text,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists idx_advisor_v2_workflow_user_created
  on dsemcq_advisor_v2_workflow_runs(user_id, created_at desc);
create index if not exists idx_advisor_v2_workflow_status
  on dsemcq_advisor_v2_workflow_runs(status, heartbeat_at);

create table if not exists dsemcq_advisor_v2_agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  workflow_id         uuid not null references dsemcq_advisor_v2_workflow_runs(id) on delete cascade,
  agent_role          text not null,
  status              text not null check (status in ('running', 'completed', 'failed', 'skipped')),
  input_evidence_refs jsonb not null default '[]'::jsonb,
  output_payload      jsonb,
  bot_name            text,
  prompt_version      text,
  duration_ms         integer,
  error_code          text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists idx_advisor_v2_agent_runs_workflow
  on dsemcq_advisor_v2_agent_runs(workflow_id, created_at);

create table if not exists dsemcq_advisor_v2_tool_calls (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid not null references dsemcq_advisor_v2_workflow_runs(id) on delete cascade,
  tool_name       text not null,
  safe_arguments  jsonb not null default '{}'::jsonb,
  evidence_refs   jsonb not null default '[]'::jsonb,
  status          text not null check (status in ('running', 'completed', 'failed', 'skipped')),
  duration_ms     integer,
  error_code      text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_advisor_v2_tool_calls_workflow
  on dsemcq_advisor_v2_tool_calls(workflow_id, created_at);

alter table dsemcq_advisor_v2_user_preferences enable row level security;
alter table dsemcq_advisor_v2_pilot_users enable row level security;
alter table dsemcq_advisor_v2_messages enable row level security;
alter table dsemcq_advisor_v2_workflow_runs enable row level security;
alter table dsemcq_advisor_v2_agent_runs enable row level security;
alter table dsemcq_advisor_v2_tool_calls enable row level security;

create policy "advisor_v2_preferences: owner read"
  on dsemcq_advisor_v2_user_preferences for select using (auth.uid() = user_id);
create policy "advisor_v2_preferences: owner insert"
  on dsemcq_advisor_v2_user_preferences for insert with check (auth.uid() = user_id);
create policy "advisor_v2_preferences: owner update"
  on dsemcq_advisor_v2_user_preferences for update using (auth.uid() = user_id);

create policy "advisor_v2_messages: owner read"
  on dsemcq_advisor_v2_messages for select using (auth.uid() = user_id);
create policy "advisor_v2_messages: owner insert"
  on dsemcq_advisor_v2_messages for insert with check (auth.uid() = user_id);

create policy "advisor_v2_workflows: owner read"
  on dsemcq_advisor_v2_workflow_runs for select using (auth.uid() = user_id);
create policy "advisor_v2_agent_runs: owner read"
  on dsemcq_advisor_v2_agent_runs for select using (
    exists (
      select 1 from dsemcq_advisor_v2_workflow_runs workflow
      where workflow.id = dsemcq_advisor_v2_agent_runs.workflow_id
        and workflow.user_id = auth.uid()
    )
  );
create policy "advisor_v2_tool_calls: owner read"
  on dsemcq_advisor_v2_tool_calls for select using (
    exists (
      select 1 from dsemcq_advisor_v2_workflow_runs workflow
      where workflow.id = dsemcq_advisor_v2_tool_calls.workflow_id
        and workflow.user_id = auth.uid()
    )
  );

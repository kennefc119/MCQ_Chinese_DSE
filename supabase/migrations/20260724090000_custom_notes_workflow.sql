-- AI度身訂造筆記: durable workflow state, immutable generated notes, and eligibility.
-- Workflow writes are service-role only; students can read only their own records.

create table if not exists dsemcq_custom_note_jobs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references dsemcq_profiles(id) on delete cascade,
  passage_id            text not null references dsemcq_passages(id) on delete restrict,
  student_request       text not null default '',
  status                text not null default 'queued'
                        check (status in ('queued', 'running', 'completed', 'completed_unverified', 'failed')),
  current_stage         text not null default 'queued',
  review_round          int not null default 0 check (review_round between 0 and 3),
  input_snapshot        jsonb not null default '{}'::jsonb,
  workflow_state        jsonb not null default '{}'::jsonb,
  error_code            text,
  error_message         text,
  prompt_version        text not null default 'v1',
  corpus_version        text not null default '2023-2025-v1',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create unique index if not exists idx_custom_note_jobs_one_active_per_passage
  on dsemcq_custom_note_jobs(user_id, passage_id)
  where status in ('queued', 'running');
create index if not exists idx_custom_note_jobs_user_created
  on dsemcq_custom_note_jobs(user_id, created_at desc);

create table if not exists dsemcq_custom_note_agent_runs (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references dsemcq_custom_note_jobs(id) on delete cascade,
  agent_role            text not null check (agent_role in (
                          'weakness', 'strength', 'trend', 'generator',
                          'fact_checker', 'pedagogy', 'optimizer', 'formatter'
                        )),
  review_round          int not null default 0 check (review_round between 0 and 3),
  status                text not null check (status in ('running', 'completed', 'failed')),
  input_payload         jsonb not null default '{}'::jsonb,
  output_payload        jsonb,
  error_code            text,
  duration_ms           int,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create index if not exists idx_custom_note_agent_runs_job
  on dsemcq_custom_note_agent_runs(job_id, created_at);

create table if not exists dsemcq_custom_notes (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null unique references dsemcq_custom_note_jobs(id) on delete cascade,
  user_id               uuid not null references dsemcq_profiles(id) on delete cascade,
  passage_id            text not null references dsemcq_passages(id) on delete restrict,
  title                 text not null,
  verification_status   text not null check (verification_status in ('approved', 'unverified')),
  fact_check_score      int not null check (fact_check_score between 0 and 100),
  pedagogy_score        int not null check (pedagogy_score between 0 and 100),
  semantic_content      jsonb not null,
  layout_metadata       jsonb not null default '{}'::jsonb,
  source_refs           jsonb not null default '[]'::jsonb,
  prompt_version        text not null,
  corpus_version        text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_custom_notes_user_created
  on dsemcq_custom_notes(user_id, created_at desc);
create index if not exists idx_custom_notes_user_passage
  on dsemcq_custom_notes(user_id, passage_id, created_at desc);

alter table dsemcq_custom_note_jobs enable row level security;
alter table dsemcq_custom_note_agent_runs enable row level security;
alter table dsemcq_custom_notes enable row level security;

drop policy if exists "custom_note_jobs: owner read" on dsemcq_custom_note_jobs;
create policy "custom_note_jobs: owner read" on dsemcq_custom_note_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "custom_note_agent_runs: owner read via job" on dsemcq_custom_note_agent_runs;
create policy "custom_note_agent_runs: owner read via job" on dsemcq_custom_note_agent_runs
  for select using (
    exists (
      select 1 from dsemcq_custom_note_jobs j
      where j.id = job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "custom_notes: owner read" on dsemcq_custom_notes;
create policy "custom_notes: owner read" on dsemcq_custom_notes
  for select using (auth.uid() = user_id);

create or replace function get_custom_note_eligibility(p_passage_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription_tier text;
  v_subscription_status text;
  v_answered_questions int := 0;
  v_passage_exists boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from dsemcq_passages where id = p_passage_id)
    into v_passage_exists;
  if not v_passage_exists then
    raise exception 'Unknown passage';
  end if;

  select subscription_tier, subscription_status
    into v_subscription_tier, v_subscription_status
  from dsemcq_profiles
  where id = v_user_id;

  select count(distinct aa.question_id)
    into v_answered_questions
  from dsemcq_attempt_answers aa
  join dsemcq_attempts a on a.id = aa.attempt_id
  join dsemcq_questions q on q.id = aa.question_id
  where a.user_id = v_user_id
    and a.status = 'submitted'
    and aa.selected_option_id is not null
    and q.passage_id = p_passage_id;

  return jsonb_build_object(
    'passage_id', p_passage_id,
    'answered_question_count', v_answered_questions,
    'required_question_count', 51,
    'is_premium', coalesce(v_subscription_tier, 'free') = 'premium'
      and coalesce(v_subscription_status, 'inactive') = 'active',
    'eligible', coalesce(v_subscription_tier, 'free') = 'premium'
      and coalesce(v_subscription_status, 'inactive') = 'active'
      and v_answered_questions >= 51,
    'reason', case
      when coalesce(v_subscription_tier, 'free') <> 'premium'
        or coalesce(v_subscription_status, 'inactive') <> 'active'
        then 'PREMIUM_REQUIRED'
      when v_answered_questions < 51 then 'MORE_PASSAGE_QUESTIONS_REQUIRED'
      else null
    end
  );
end;
$$;

grant execute on function get_custom_note_eligibility(text) to authenticated;
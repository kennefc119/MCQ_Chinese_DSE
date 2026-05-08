-- ============================================================
-- DSE MCQ App — Initial Schema
-- Prefix: dsemcq_
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Extensions
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- 1. dsemcq_profiles
--    Mirrors auth.users 1-to-1 (id = auth.uid())
-- ────────────────────────────────────────────────────────────
do $$ begin create type dsemcq_gender as enum ('male', 'female', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type dsemcq_role   as enum ('user', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type dsemcq_sub_tier   as enum ('free', 'premium'); exception when duplicate_object then null; end $$;
do $$ begin create type dsemcq_sub_status as enum ('active', 'inactive'); exception when duplicate_object then null; end $$;

create table if not exists dsemcq_profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  username            text not null,
  gender              dsemcq_gender not null default 'other',
  dse_year            int  not null,
  wenyuan_points      int  not null default 0 check (wenyuan_points >= 0),
  role                dsemcq_role not null default 'user',
  subscription_tier   dsemcq_sub_tier   not null default 'free',
  subscription_status dsemcq_sub_status not null default 'active',
  created_at          timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 2. dsemcq_passages  (文言文指定篇章)
-- ────────────────────────────────────────────────────────────
create table if not exists dsemcq_passages (
  id         text primary key,            -- e.g. "p01"
  slug       text not null unique,
  order_no   int  not null,
  title      text not null,
  dynasty    text,
  author     text,
  body       text not null,
  summary    text,
  genre      text,                        -- 散文/議論文/史傳/詩/詞
  themes     text[] not null default '{}',
  difficulty int  not null default 2 check (difficulty between 1 and 5)
);

-- ────────────────────────────────────────────────────────────
-- 3. dsemcq_tags
-- ────────────────────────────────────────────────────────────
create table if not exists dsemcq_tags (
  id    text primary key,              -- e.g. "t-meaning"
  slug  text not null unique,
  label text not null
);

-- ────────────────────────────────────────────────────────────
-- 4. dsemcq_questions + options
-- ────────────────────────────────────────────────────────────
create table if not exists dsemcq_questions (
  id          text primary key,            -- e.g. "q-p01-1"
  passage_id  text references dsemcq_passages(id) on delete set null,
  stem        text not null,
  explanation text,
  difficulty  int  not null default 1 check (difficulty between 1 and 5),
  source      text,
  is_active   boolean not null default true
);

create table if not exists dsemcq_question_options (
  id          text primary key,            -- e.g. "q-p01-1-a"
  question_id text not null references dsemcq_questions(id) on delete cascade,
  label       text not null,           -- A / B / C / D
  text        text not null,
  is_correct  boolean not null default false
);

-- Many-to-many: question ↔ tag
create table if not exists dsemcq_question_tags (
  question_id text not null references dsemcq_questions(id) on delete cascade,
  tag_id      text not null references dsemcq_tags(id)      on delete cascade,
  primary key (question_id, tag_id)
);

-- ────────────────────────────────────────────────────────────
-- 5. dsemcq_quizzes
-- ────────────────────────────────────────────────────────────
do $$ begin create type dsemcq_quiz_type as enum ('exercise', 'quiz', 'exam'); exception when duplicate_object then null; end $$;

create table if not exists dsemcq_quizzes (
  id                       text primary key,       -- e.g. "quiz-exercise-lunyu"
  type                     dsemcq_quiz_type not null default 'quiz',
  title                    text not null,
  description              text,
  cover_image_url          text,
  passage_id               text references dsemcq_passages(id) on delete set null,
  difficulty               int  not null default 1 check (difficulty between 1 and 5),
  duration_seconds         int,
  max_attempts             int,
  pass_score               int  not null default 60 check (pass_score between 0 and 100),
  points_reward            int  not null default 0  check (points_reward >= 0),
  min_points_required      int  not null default 0  check (min_points_required >= 0),
  scheduled_start          timestamptz,
  scheduled_end            timestamptz,
  is_published             boolean not null default false,
  question_ids             text[] not null default '{}',
  featured                 boolean not null default false,
  order_no                 int  not null default 0,
  color_hex                text,
  estimated_duration_label text,
  subject_area             text,
  prerequisite_quiz_id     text references dsemcq_quizzes(id) on delete set null,
  created_at               timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 6. dsemcq_user_quiz_signups  (calendar)
-- ────────────────────────────────────────────────────────────
create table if not exists dsemcq_user_quiz_signups (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references dsemcq_profiles(id) on delete cascade,
  quiz_id      text not null references dsemcq_quizzes(id)  on delete cascade,
  signed_up_at timestamptz not null default now(),
  unique (user_id, quiz_id)
);

-- ────────────────────────────────────────────────────────────
-- 7. dsemcq_attempts + dsemcq_attempt_answers
-- ────────────────────────────────────────────────────────────
do $$ begin create type dsemcq_attempt_status as enum ('in_progress', 'submitted', 'expired'); exception when duplicate_object then null; end $$;

create table if not exists dsemcq_attempts (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references dsemcq_profiles(id) on delete cascade,
  quiz_id            text not null references dsemcq_quizzes(id)  on delete cascade,
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  score              int,          -- # correct
  total              int not null,
  time_spent_seconds int,
  status             dsemcq_attempt_status not null default 'in_progress',
  -- snapshot of answers: { question_id -> option_id }
  answers            jsonb not null default '{}'
);

create table if not exists dsemcq_attempt_answers (
  id                 uuid primary key default uuid_generate_v4(),
  attempt_id         uuid not null references dsemcq_attempts(id) on delete cascade,
  question_id        text not null references dsemcq_questions(id) on delete cascade,
  selected_option_id text references dsemcq_question_options(id) on delete set null,
  is_correct         boolean,
  answered_at        timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ────────────────────────────────────────────────────────────
-- 8. dsemcq_tip_cards
-- ────────────────────────────────────────────────────────────
do $$ begin create type dsemcq_tip_category as enum ('exam_tip', 'rest', 'study', 'wellness'); exception when duplicate_object then null; end $$;

create table if not exists dsemcq_tip_cards (
  id                  text primary key,       -- e.g. "tip-1"
  title               text not null,
  subtitle            text,
  body                text not null,
  image_url           text,
  category            dsemcq_tip_category not null default 'study',
  position            int  not null default 0,
  is_active           boolean not null default true,
  read_time_minutes   int  not null default 1,
  related_passage_ids text[] not null default '{}',
  author              text,
  cta_label           text
);

-- ────────────────────────────────────────────────────────────
-- 9. dsemcq_psych_tests + dsemcq_psych_user_results
-- ────────────────────────────────────────────────────────────
create table if not exists dsemcq_psych_tests (
  id                 text primary key,       -- e.g. "psy-character-match"
  slug               text not null unique,
  title              text not null,
  description        text not null default '',
  icon_name          text not null default 'help-circle',
  question_count     int  not null default 0,
  estimated_minutes  int  not null default 5,
  questions          jsonb not null default '[]',
  results            jsonb not null default '[]',
  is_active          boolean not null default true,
  position           int  not null default 0,
  cover_image_url    text,
  color_hex          text,
  featured           boolean not null default false
);

create table if not exists dsemcq_psych_user_results (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references dsemcq_profiles(id) on delete cascade,
  test_id      text not null references dsemcq_psych_tests(id) on delete cascade,
  result_code  text not null,
  completed_at timestamptz not null default now(),
  unique (user_id, test_id)   -- one result per user per test (upsert-safe)
);

-- ────────────────────────────────────────────────────────────
-- 10. dsemcq_inbox
-- ────────────────────────────────────────────────────────────
do $$ begin create type dsemcq_inbox_type as enum ('info', 'warning', 'success'); exception when duplicate_object then null; end $$;

create table if not exists dsemcq_inbox (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references dsemcq_profiles(id) on delete cascade,  -- null = broadcast
  title      text not null,
  body       text not null,
  type       dsemcq_inbox_type not null default 'info',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 11. dsemcq_advisor_messages
-- ────────────────────────────────────────────────────────────
create table if not exists dsemcq_advisor_messages (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references dsemcq_profiles(id) on delete cascade,
  user_text  text not null,
  bot_reply  text not null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 12. Indexes
-- ────────────────────────────────────────────────────────────
create index if not exists idx_passages_order          on dsemcq_passages(order_no);
create index if not exists idx_questions_passage       on dsemcq_questions(passage_id);
create index if not exists idx_quizzes_published       on dsemcq_quizzes(is_published) where is_published = true;
create index if not exists idx_quizzes_scheduled       on dsemcq_quizzes(scheduled_start, scheduled_end);
create index if not exists idx_quizzes_order           on dsemcq_quizzes(order_no);
create index if not exists idx_attempts_user           on dsemcq_attempts(user_id, started_at desc);
create index if not exists idx_attempts_quiz           on dsemcq_attempts(quiz_id);
create index if not exists idx_attempt_answers_attempt on dsemcq_attempt_answers(attempt_id);
create index if not exists idx_signups_user            on dsemcq_user_quiz_signups(user_id);
create index if not exists idx_tip_cards_active        on dsemcq_tip_cards(is_active, position) where is_active = true;
create index if not exists idx_psych_tests_active      on dsemcq_psych_tests(is_active, position) where is_active = true;
create index if not exists idx_inbox_user              on dsemcq_inbox(user_id, created_at desc);
create index if not exists idx_advisor_user            on dsemcq_advisor_messages(user_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 13. Row-Level Security
-- ────────────────────────────────────────────────────────────

-- ── Profiles ─────────────────────────────────────────────────
alter table dsemcq_profiles enable row level security;
drop policy if exists "profiles: owner read"   on dsemcq_profiles;
drop policy if exists "profiles: owner update" on dsemcq_profiles;
drop policy if exists "profiles: admin read"   on dsemcq_profiles;
create policy "profiles: owner read"   on dsemcq_profiles for select using (auth.uid() = id);
create policy "profiles: owner update" on dsemcq_profiles for update using (auth.uid() = id);
-- insert is handled by registerProfile via service-role; block direct public inserts
-- Admins can see all profiles
create policy "profiles: admin read" on dsemcq_profiles for select
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── Passages (read-only for all authenticated users) ─────────
alter table dsemcq_passages enable row level security;
drop policy if exists "passages: auth read" on dsemcq_passages;
create policy "passages: auth read" on dsemcq_passages for select using (auth.role() = 'authenticated');

-- ── Tags (read-only) ─────────────────────────────────────────
alter table dsemcq_tags enable row level security;
drop policy if exists "tags: auth read" on dsemcq_tags;
create policy "tags: auth read" on dsemcq_tags for select using (auth.role() = 'authenticated');

-- ── Questions & Options (read-only) ──────────────────────────
alter table dsemcq_questions enable row level security;
drop policy if exists "questions: auth read" on dsemcq_questions;
create policy "questions: auth read" on dsemcq_questions for select using (auth.role() = 'authenticated');

alter table dsemcq_question_options enable row level security;
drop policy if exists "question_options: auth read" on dsemcq_question_options;
create policy "question_options: auth read" on dsemcq_question_options for select using (auth.role() = 'authenticated');

alter table dsemcq_question_tags enable row level security;
drop policy if exists "question_tags: auth read" on dsemcq_question_tags;
create policy "question_tags: auth read" on dsemcq_question_tags for select using (auth.role() = 'authenticated');

-- ── Quizzes (public/auth read-only) ──────────────────────────
alter table dsemcq_quizzes enable row level security;
drop policy if exists "quizzes: auth read published" on dsemcq_quizzes;
drop policy if exists "quizzes: admin all"           on dsemcq_quizzes;
create policy "quizzes: auth read published" on dsemcq_quizzes for select
  using (auth.role() = 'authenticated' and is_published = true);
create policy "quizzes: admin all" on dsemcq_quizzes for all
  using (exists (select 1 from dsemcq_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── Signups ───────────────────────────────────────────────────
alter table dsemcq_user_quiz_signups enable row level security;
drop policy if exists "signups: owner read"   on dsemcq_user_quiz_signups;
drop policy if exists "signups: owner insert" on dsemcq_user_quiz_signups;
drop policy if exists "signups: owner delete" on dsemcq_user_quiz_signups;
create policy "signups: owner read"   on dsemcq_user_quiz_signups for select using (auth.uid() = user_id);
create policy "signups: owner insert" on dsemcq_user_quiz_signups for insert with check (auth.uid() = user_id);
create policy "signups: owner delete" on dsemcq_user_quiz_signups for delete using (auth.uid() = user_id);

-- ── Attempts ─────────────────────────────────────────────────
alter table dsemcq_attempts enable row level security;
drop policy if exists "attempts: owner read"   on dsemcq_attempts;
drop policy if exists "attempts: owner insert" on dsemcq_attempts;
drop policy if exists "attempts: owner update" on dsemcq_attempts;
create policy "attempts: owner read"   on dsemcq_attempts for select using (auth.uid() = user_id);
create policy "attempts: owner insert" on dsemcq_attempts for insert with check (auth.uid() = user_id);
create policy "attempts: owner update" on dsemcq_attempts for update using (auth.uid() = user_id);

alter table dsemcq_attempt_answers enable row level security;
drop policy if exists "attempt_answers: owner via attempt" on dsemcq_attempt_answers;
create policy "attempt_answers: owner via attempt" on dsemcq_attempt_answers for all
  using (exists (select 1 from dsemcq_attempts a where a.id = attempt_id and a.user_id = auth.uid()));

-- ── Tip Cards (auth read-only) ────────────────────────────────
alter table dsemcq_tip_cards enable row level security;
drop policy if exists "tip_cards: auth read" on dsemcq_tip_cards;
create policy "tip_cards: auth read" on dsemcq_tip_cards for select
  using (auth.role() = 'authenticated' and is_active = true);

-- ── Psych Tests (auth read-only) ─────────────────────────────
alter table dsemcq_psych_tests enable row level security;
drop policy if exists "psych_tests: auth read" on dsemcq_psych_tests;
create policy "psych_tests: auth read" on dsemcq_psych_tests for select
  using (auth.role() = 'authenticated' and is_active = true);

alter table dsemcq_psych_user_results enable row level security;
drop policy if exists "psych_results: owner read"   on dsemcq_psych_user_results;
drop policy if exists "psych_results: owner upsert" on dsemcq_psych_user_results;
drop policy if exists "psych_results: owner update" on dsemcq_psych_user_results;
create policy "psych_results: owner read"   on dsemcq_psych_user_results for select using (auth.uid() = user_id);
create policy "psych_results: owner upsert" on dsemcq_psych_user_results for insert with check (auth.uid() = user_id);
create policy "psych_results: owner update" on dsemcq_psych_user_results for update using (auth.uid() = user_id);

-- ── Inbox ─────────────────────────────────────────────────────
alter table dsemcq_inbox enable row level security;
drop policy if exists "inbox: owner read"   on dsemcq_inbox;
drop policy if exists "inbox: owner update" on dsemcq_inbox;
-- user sees their own messages OR broadcast messages (user_id IS NULL)
create policy "inbox: owner read" on dsemcq_inbox for select
  using (user_id is null or auth.uid() = user_id);
create policy "inbox: owner update" on dsemcq_inbox for update
  using (auth.uid() = user_id);  -- mark read (own messages only, not broadcasts)

-- ── Advisor Messages ─────────────────────────────────────────
alter table dsemcq_advisor_messages enable row level security;
drop policy if exists "advisor: owner read"   on dsemcq_advisor_messages;
drop policy if exists "advisor: owner insert" on dsemcq_advisor_messages;
create policy "advisor: owner read"   on dsemcq_advisor_messages for select using (auth.uid() = user_id);
create policy "advisor: owner insert" on dsemcq_advisor_messages for insert with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 14. Helper RPC: get_quiz_for_attempt
--     Returns questions + options for a quiz, excluding is_correct
--     (prevents cheating — correct answer only revealed post-submit)
-- ────────────────────────────────────────────────────────────
create or replace function get_quiz_for_attempt(p_quiz_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz   dsemcq_quizzes%rowtype;
  v_result jsonb;
begin
  select * into v_quiz from dsemcq_quizzes where id = p_quiz_id and is_published = true;
  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(q_obj order by q_ord), '[]'::jsonb)
  into   v_result
  from (
    select
      ordinality as q_ord,
      jsonb_build_object(
        'id',          q.id,
        'passage_id',  q.passage_id,
        'stem',        q.stem,
        'explanation', q.explanation,
        'difficulty',  q.difficulty,
        'source',      q.source,
        'is_active',   q.is_active,
        'options',     (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id',          o.id,
              'question_id', o.question_id,
              'label',       o.label,
              'text',        o.text,
              'is_correct',  false   -- hidden until result
            )
          ), '[]'::jsonb)
          from dsemcq_question_options o
          where o.question_id = q.id
        )
      ) as q_obj
    from unnest(v_quiz.question_ids) with ordinality as qid_row(qid, ordinality)
    join dsemcq_questions q on q.id = qid_row.qid
    where q.is_active = true
  ) sub;

  return v_result;
end;
$$;

-- Grant execute to authenticated users
grant execute on function get_quiz_for_attempt(text) to authenticated;

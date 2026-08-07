-- Unified DSE past exam questions table for source/*.json ingestion.
-- One row per question with normalized retrieval fields plus raw JSON snapshots.

create extension if not exists pg_trgm;

create table if not exists dsemcq_dse_past_exam_questions (
  id uuid primary key default gen_random_uuid(),

  exam_year int not null check (exam_year between 2000 and 2100),
  paper_source text,
  section_type text not null check (section_type in ('designated', 'unseen')),

  passage_bucket text not null,
  passage_title text not null,
  author text,
  passage_text_content text,

  question_number text not null,
  question_text text not null,
  score int not null default 0 check (score >= 0),
  question_type_raw text,
  question_type_norm text not null default 'other',

  official_answer_key text,
  suggested_answer_text text,
  specific_marking_notes text,
  relies_on_general_rubric boolean,

  source_file text not null,
  source_file_year int,

  exam_metadata_json jsonb not null default '{}'::jsonb,
  general_marking_guidelines_json jsonb not null default '{}'::jsonb,
  passage_json jsonb not null default '{}'::jsonb,
  question_json jsonb not null default '{}'::jsonb,
  marking_scheme_data_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (exam_year, section_type, passage_bucket, question_number, source_file)
);

create index if not exists idx_dse_past_exam_questions_filter
  on dsemcq_dse_past_exam_questions(exam_year, section_type, passage_bucket, question_number);

create index if not exists idx_dse_past_exam_questions_passage_author
  on dsemcq_dse_past_exam_questions(exam_year, section_type, passage_title, author);

create index if not exists idx_dse_past_exam_questions_qtype_score
  on dsemcq_dse_past_exam_questions(exam_year, question_type_norm, score);

create index if not exists idx_dse_past_exam_questions_qtext_trgm
  on dsemcq_dse_past_exam_questions using gin (question_text gin_trgm_ops);

create index if not exists idx_dse_past_exam_questions_ptext_trgm
  on dsemcq_dse_past_exam_questions using gin (passage_text_content gin_trgm_ops);

create index if not exists idx_dse_past_exam_questions_ptitle_trgm
  on dsemcq_dse_past_exam_questions using gin (passage_title gin_trgm_ops);

create index if not exists idx_dse_past_exam_questions_search_fts
  on dsemcq_dse_past_exam_questions using gin (
    to_tsvector(
      'simple',
      coalesce(passage_title, '') || ' ' ||
      coalesce(author, '') || ' ' ||
      coalesce(passage_text_content, '') || ' ' ||
      coalesce(question_text, '') || ' ' ||
      coalesce(official_answer_key, '') || ' ' ||
      coalesce(suggested_answer_text, '') || ' ' ||
      coalesce(specific_marking_notes, '')
    )
  );

alter table dsemcq_dse_past_exam_questions enable row level security;

drop policy if exists "dse_past_exam_questions: auth read" on dsemcq_dse_past_exam_questions;
create policy "dse_past_exam_questions: auth read"
  on dsemcq_dse_past_exam_questions
  for select
  using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';

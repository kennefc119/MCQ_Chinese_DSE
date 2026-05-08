-- Migration: add critique_score to dsemcq_questions
-- This stores the quality score (1-10) assigned by the critic agent
-- after the final review round. Used for quiz assembly quality filtering.

alter table dsemcq_questions
  add column if not exists critique_score int
    check (critique_score between 1 and 10);

-- Index for efficient quality-based filtering (e.g. score >= 7)
create index if not exists idx_questions_critique_score
  on dsemcq_questions(critique_score);

comment on column dsemcq_questions.critique_score is
  'Quality score 1-10 assigned by the critic LLM agent. NULL for manually authored questions.';

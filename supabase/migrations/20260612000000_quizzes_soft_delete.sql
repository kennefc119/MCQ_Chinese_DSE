-- ============================================================
-- Add is_active soft-delete flag to dsemcq_quizzes
--
-- Motivation: the assembler previously hard-deleted quiz rows when
-- reshuffling, which cascade-deleted dsemcq_attempts and all user
-- history.  With is_active=false we retire old combinations without
-- touching any FK-dependent rows, keeping all statistics cumulative.
-- ============================================================

alter table dsemcq_quizzes
  add column if not exists is_active boolean not null default true;

-- Backfill: all existing rows are the active generation
update dsemcq_quizzes set is_active = true where is_active is null;

-- Partial index: only active quizzes are listed in the app
create index if not exists idx_quizzes_active
  on dsemcq_quizzes(is_active)
  where is_active = true;

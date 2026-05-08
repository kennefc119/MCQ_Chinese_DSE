-- ============================================================
-- 開發環境重置腳本
-- ⚠️  WARNING: 會刪除所有 dsemcq_* 資料，僅用於開發環境！
-- ============================================================
-- 用法：在 Supabase Dashboard → SQL Editor 貼上並執行此腳本，
--       然後在 terminal 執行：supabase db push
-- ============================================================

-- 1. Drop all dsemcq_* tables (CASCADE removes all dependent objects)
drop table if exists dsemcq_advisor_messages    cascade;
drop table if exists dsemcq_inbox               cascade;
drop table if exists dsemcq_psych_user_results  cascade;
drop table if exists dsemcq_psych_tests         cascade;
drop table if exists dsemcq_tip_cards           cascade;
drop table if exists dsemcq_attempt_answers     cascade;
drop table if exists dsemcq_attempts            cascade;
drop table if exists dsemcq_user_quiz_signups   cascade;
drop table if exists dsemcq_quizzes             cascade;
drop table if exists dsemcq_question_tags       cascade;
drop table if exists dsemcq_question_options    cascade;
drop table if exists dsemcq_questions           cascade;
drop table if exists dsemcq_tags                cascade;
drop table if exists dsemcq_passages            cascade;
drop table if exists dsemcq_profiles            cascade;

-- 2. Drop all dsemcq_* types
drop type if exists dsemcq_gender          cascade;
drop type if exists dsemcq_role            cascade;
drop type if exists dsemcq_sub_tier        cascade;
drop type if exists dsemcq_sub_status      cascade;
drop type if exists dsemcq_quiz_type       cascade;
drop type if exists dsemcq_attempt_status  cascade;
drop type if exists dsemcq_tip_category    cascade;
drop type if exists dsemcq_inbox_type      cascade;

-- 3. Drop helper function
drop function if exists get_quiz_for_attempt(text) cascade;

-- 4. Remove migration tracking so supabase db push can re-apply cleanly
--    (supabase CLI tracks applied migrations in this table)
delete from supabase_migrations.schema_migrations
where version in ('20240001000000');

-- ✅ Done — now run `supabase db push` in your terminal,
--    then paste the contents of supabase/seed.sql in SQL Editor.

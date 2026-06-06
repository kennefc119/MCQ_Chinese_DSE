-- Allow public (anon + authenticated) read access to active questions.
-- This is needed so the quiz difficulty computation (averaging question
-- difficulties client-side) works for ALL users, including guests and
-- users whose JWT session hasn't been restored yet on app launch.
-- Question stems are non-sensitive catalog content; correct answers live
-- in dsemcq_question_options.is_correct which remains auth-only.

drop policy if exists "questions: auth read" on dsemcq_questions;
create policy "questions: public read active" on dsemcq_questions
  for select using (is_active = true);

-- Also grant the base SELECT privilege to anon (PostgREST requires it).
grant select on table dsemcq_questions to anon, authenticated;

notify pgrst, 'reload schema';

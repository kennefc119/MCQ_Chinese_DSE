-- Quiz difficulty is now computed client-side by averaging dsemcq_questions.difficulty
-- for all question_ids in a quiz. The manual difficulty column is no longer needed.
ALTER TABLE dsemcq_quizzes DROP COLUMN IF EXISTS difficulty;

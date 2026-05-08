-- Move explanation from question level to option level.
-- Each option now carries its own explanation (why it is correct or why it is wrong).
ALTER TABLE dsemcq_question_options ADD COLUMN IF NOT EXISTS explanation text;

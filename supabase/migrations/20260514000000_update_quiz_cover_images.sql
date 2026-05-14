-- Update cover_image_url in dsemcq_quizzes
-- Each passage+type combination gets a unique Chinese culture/nature themed image.
-- Image pool (8 verified Unsplash photos):
--   1547981609-4b6bfe67ca0b  Red Chinese lanterns
--   1578301978162-7aae4d755744  Ink calligraphy
--   1591608197523-1bfb24e9a3c1  Classical Chinese garden
--   1558618666-fcd25c85cd64  Lotus pond
--   1540541338578-3e930212cb39  Bamboo forest
--   1601134467661-3d775b999c3d  Autumn forest
--   1464822759023-fed622ff2c3b  Misty mountain landscape
--   1508804185872-d7badad00f7d  Great Wall of China

-- ── Seed quizzes (matched by id) ─────────────────────────────────────────────
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE id = 'quiz-exercise-lunyu';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE id = 'quiz-quiz-mengzi-xunzi';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE id = 'quiz-exam-tang-song';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE id = 'quiz-exercise-poetry';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE id = 'quiz-quiz-zhuangzi';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE id = 'quiz-exam-full-mock';

-- ── Assembler-generated quizzes: by passage_id + type ────────────────────────
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p01' AND type = 'exercise' AND id NOT LIKE 'quiz-exercise-lunyu';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p01' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p01' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p02' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p02' AND type = 'quiz' AND id NOT LIKE 'quiz-quiz-mengzi-xunzi';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p02' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p03' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p03' AND type = 'quiz' AND id NOT LIKE 'quiz-quiz-zhuangzi';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p03' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p04' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p04' AND type = 'quiz' AND id NOT LIKE 'quiz-quiz-mengzi-xunzi';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p04' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p05' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p05' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p05' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p06' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p06' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p06' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p07' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p07' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p07' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p08' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p08' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p08' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p09' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p09' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p09' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p10' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p10' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p10' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p11' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p11' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p11' AND type = 'exam';

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p12' AND type = 'exercise';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p12' AND type = 'quiz';
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id = 'p12' AND type = 'exam';

-- ── Skill-based quizzes (passage_id IS NULL, not seed quizzes) ────────────────
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%字詞%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%字詞%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%字詞%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%內容%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%內容%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%內容%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%主旨%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%主旨%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%主旨%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%修辭%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%修辭%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%修辭%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%人物%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%人物%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%人物%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%句式%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%句式%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1591608197523-1bfb24e9a3c1?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%句式%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1540541338578-3e930212cb39?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%背景%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%背景%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%背景%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1601134467661-3d775b999c3d?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exercise' AND title LIKE '%比較%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'quiz'     AND title LIKE '%比較%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');
UPDATE dsemcq_quizzes SET cover_image_url = 'https://images.unsplash.com/photo-1578301978162-7aae4d755744?w=600&h=400&fit=crop&auto=format' WHERE passage_id IS NULL AND type = 'exam'     AND title LIKE '%比較%' AND id NOT IN ('quiz-exercise-lunyu','quiz-quiz-mengzi-xunzi','quiz-exam-tang-song','quiz-exercise-poetry','quiz-quiz-zhuangzi','quiz-exam-full-mock');

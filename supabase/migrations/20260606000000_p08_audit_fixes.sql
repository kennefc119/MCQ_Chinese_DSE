-- =============================================================================
-- p08 始得西山宴遊記 — 審題報告修復 (2026-06-06)
-- 
-- 修復內容：
--   P4. 修正 q-ai-p08-01b737 標籤 (t-character → t-comprehension)
--   P3. 重寫 q-ai-p08-c182e0 (純記憶→增加分析成分，修復混亂解釋)
--   P3. 重寫 q-ai-p08-da1d6b (純記憶→增加分析成分)
--   P2. 修復 q-ai-p08-a70aa3 弱干擾項 (荒謬選項→高質量干擾)
--   P2. 修復 q-ai-p08-33ff5c 弱干擾項 (否定前提→合理干擾)
--   補充缺失標籤 (c182e0, da1d6b, c7bb1a, a70aa3, 33ff5c)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- P4. 修正 q-ai-p08-01b737 標籤：t-character → t-comprehension
--     審題報告：實際考核心態分析，更適合 t-comprehension
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM dsemcq_question_tags
WHERE question_id = 'q-ai-p08-01b737' AND tag_id = 't-character';

INSERT INTO dsemcq_question_tags (question_id, tag_id)
VALUES ('q-ai-p08-01b737', 't-comprehension')
ON CONFLICT (question_id, tag_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- P3. 重寫 q-ai-p08-c182e0（純記憶→結合篇章分析）
--     原題：「造物者」與哪位思想家有關？（純記憶）
--     新題：結合原文語境，考核「造物者」的思想來源及在文中的意義
--     同時修復混亂的解釋（韓非選項提及佛教、墨子選項提及韓愈）
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE dsemcq_questions
SET stem = '「洋洋乎與造物者遊，而不知其所窮」中「造物者」源自哪家思想？結合文意，作者藉此表達甚麼感悟？',
    difficulty = 2
WHERE id = 'q-ai-p08-c182e0';

-- 正確選項 (opt0)
UPDATE dsemcq_question_options
SET text = '源自道家，表達與自然合一、超脫個人得失',
    is_correct = true,
    explanation = '此選項正確。「造物者」語出莊子《大宗師》「偉哉造物者」，屬道家概念。原文「與造物者遊，而不知其所窮」表達作者在西山頂感悟天地無窮，達到與自然合一、超越個人榮辱得失的境界，與莊子「物我兩忘」的思想相呼應。'
WHERE id = 'q-ai-p08-c182e0-opt0';

-- 錯誤選項 (opt1) — 原為「孔子（儒家）」
UPDATE dsemcq_question_options
SET text = '源自儒家，表達以天下為己任的抱負',
    is_correct = false,
    explanation = '此選項錯誤。「造物者」是道家概念，非儒家。且此段所表達的並非儒家入世濟民的抱負，而是超脫個人得失、與自然冥合的道家境界。'
WHERE id = 'q-ai-p08-c182e0-opt1';

-- 錯誤選項 (opt2) — 原為「韓非（法家）」
UPDATE dsemcq_question_options
SET text = '源自法家，表達以法治國的政治理想',
    is_correct = false,
    explanation = '此選項錯誤。「造物者」是道家概念，與法家無關。原文此段抒發的是精神超脫之感，並非探討法治或政治理想。'
WHERE id = 'q-ai-p08-c182e0-opt2';

-- 錯誤選項 (opt3) — 原為「墨子（墨家）」
UPDATE dsemcq_question_options
SET text = '源自佛家，表達看破塵世的出世態度',
    is_correct = false,
    explanation = '此選項錯誤。「造物者」語出莊子，屬道家而非佛家。雖然柳宗元亦接觸佛學，但此處「與造物者遊」的意象明確承自道家「上與造物者遊」（《莊子．天下》）的思想脈絡。'
WHERE id = 'q-ai-p08-c182e0-opt3';

-- 補充缺失標籤
INSERT INTO dsemcq_question_tags (question_id, tag_id)
VALUES ('q-ai-p08-c182e0', 't-context')
ON CONFLICT (question_id, tag_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- P3. 重寫 q-ai-p08-da1d6b（純記憶→結合篇章分析）
--     原題：在永州八記中處於甚麼位置？（純記憶）
--     新題：結合「始得」主題，考核首篇的文學功能
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE dsemcq_questions
SET stem = '《始得西山宴遊記》居「永州八記」之首，以「始得」為題，這個安排有甚麼意義？',
    difficulty = 2
WHERE id = 'q-ai-p08-da1d6b';

-- opt0 = CORRECT「首篇，為全系列奠定基調」
-- opt1 = WRONG 「末篇，為全系列作出總結」
-- opt2 = WRONG 「獨立篇章，與其餘七篇無關」
-- opt3 = WRONG 「後補之作，地位最不重要」

-- 正確選項 (opt0)
UPDATE dsemcq_question_options
SET text = '以「始」字點出從此領略真遊之趣，為後續遊記奠定心境轉變的基調',
    is_correct = true,
    explanation = '此選項正確。原文末段「然後知吾嚮之未始遊，遊於是乎始」以兩個「始」字點明此次西山之遊是真正遊覽的開始。作為永州八記首篇，本文確立了作者從苦悶走向精神超脫的轉變起點，為後續七篇遊記奠定了情感基調。'
WHERE id = 'q-ai-p08-da1d6b-opt0';

-- 錯誤選項 (opt1) — 原為「末篇，為全系列作出總結」
UPDATE dsemcq_question_options
SET text = '強調西山是永州最高的山，按山勢高低排列各篇遊記',
    is_correct = false,
    explanation = '此選項錯誤。永州八記並非按山勢高低排列。「始得」的意義在於精神上的「始」——從此開始真正的遊覽，並非單純的地理排序。'
WHERE id = 'q-ai-p08-da1d6b-opt1';

-- 錯誤選項 (opt2) — 原為「獨立篇章，與其餘七篇無關」
UPDATE dsemcq_question_options
SET text = '僅按時間先後排列，「始得」只記錄首次出遊，無深層寓意',
    is_correct = false,
    explanation = '此選項錯誤。「始得」並非單純記錄時間先後，而是強調作者此前雖遍遊永州山水，但「未始知西山之怪特」，唯登西山後方領悟「遊於是乎始」，具有深刻的精神轉折意義。'
WHERE id = 'q-ai-p08-da1d6b-opt2';

-- 錯誤選項 (opt3) — 原為「後補之作，地位最不重要」
UPDATE dsemcq_question_options
SET text = '表達對西山地理位置的考察記錄，為後續各篇提供地理參照',
    is_correct = false,
    explanation = '此選項錯誤。本文重點並非地理考察，而是藉西山之遊抒發從「恒惴慄」到「心凝形釋，與萬化冥合」的心境轉變，屬情感與哲理層面的寫作。'
WHERE id = 'q-ai-p08-da1d6b-opt3';

-- 補充缺失標籤
INSERT INTO dsemcq_question_tags (question_id, tag_id)
VALUES ('q-ai-p08-da1d6b', 't-context')
ON CONFLICT (question_id, tag_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- P2. 修復 q-ai-p08-a70aa3 弱干擾項
--     原題：「法華西亭」的「法華」與甚麼有關？
--     問題：干擾項過於荒謬（「法華與佛教無關」「法華是人名」）
--     修復：替換為有誘答力的干擾項（偷換概念型）
-- ─────────────────────────────────────────────────────────────────────────────

-- 重寫題幹，使之更聚焦
UPDATE dsemcq_questions
SET stem = '「因坐法華西亭，望西山，始指異之」中「法華」的性質，以及它反映柳宗元甚麼思想傾向？'
WHERE id = 'q-ai-p08-a70aa3';

-- 正確選項 (opt0)
UPDATE dsemcq_question_options
SET text = '法華寺是佛寺，反映柳宗元融合儒釋道的思想',
    explanation = '此選項正確。「法華」指法華寺，源自佛教《法華經》。柳宗元被貶永州期間常出入佛寺、與僧人交往，其思想融合儒、釋、道三家。工作紙指出他「與僧人交往甚密，探討佛家思想；同時，又鑽研老莊的經典著作」。'
WHERE id = 'q-ai-p08-a70aa3-opt0';

-- 弱干擾項1 (opt1) — 原為「法華與佛教無關」→ 偷換概念
UPDATE dsemcq_question_options
SET text = '法華寺是道觀，反映柳宗元專注道家思想',
    is_correct = false,
    explanation = '此選項錯誤。法華寺是佛寺（源自《法華經》），非道觀。雖然柳宗元確受道家思想影響，但「法華」一詞本身與佛教相關，不可混為一談。'
WHERE id = 'q-ai-p08-a70aa3-opt1';

-- 弱干擾項2 (opt2) — 原為「柳宗元排斥佛教」→ 部分正確型
UPDATE dsemcq_question_options
SET text = '法華寺是佛寺，但柳宗元僅借地休憩，與佛學無關',
    is_correct = false,
    explanation = '此選項屬部分正確。法華寺確為佛寺，但「僅借地休憩」的說法不確。柳宗元在永州期間深入研習佛學，常與僧人交往探討佛家思想，並非單純借地休息。'
WHERE id = 'q-ai-p08-a70aa3-opt2';

-- 弱干擾項3 (opt3) — 原為「法華是一個人名」→ 過度引申型
UPDATE dsemcq_question_options
SET text = '法華寺是儒學書院，反映柳宗元堅守儒家正統',
    is_correct = false,
    explanation = '此選項錯誤。法華寺是佛寺而非儒學書院。雖然柳宗元有儒家濟世抱負，但「法華」明確源自佛教《法華經》，不可誤作儒學機構。'
WHERE id = 'q-ai-p08-a70aa3-opt3';

-- 補充缺失標籤
INSERT INTO dsemcq_question_tags (question_id, tag_id)
VALUES ('q-ai-p08-a70aa3', 't-context')
ON CONFLICT (question_id, tag_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- P2. 修復 q-ai-p08-33ff5c 弱干擾項
--     原題：古文運動的主張與本文有甚麼關係？
--     問題：干擾項為直接否定前提（「古文運動是宋朝才興起」「提倡駢文反對散文」）
--     修復：替換為具備誘答力的干擾項
-- ─────────────────────────────────────────────────────────────────────────────

-- 正確選項 (opt0) — 保持但精煉解釋
UPDATE dsemcq_question_options
SET text = '主張以質樸散文取代駢文，本文正是古文運動的實踐',
    explanation = '此選項正確。古文運動主張以質樸自然的散文取代六朝以來華麗空洞的駢文。本文語言清新流暢，駢散結合，敍事寫景自然不造作，正體現古文運動「文以明道」的精神。'
WHERE id = 'q-ai-p08-33ff5c-opt0';

-- 弱干擾項1 (opt1) — 原為「提倡駢文，反對散文寫作」→ 過度引申型
UPDATE dsemcq_question_options
SET text = '主張復興先秦散文，但本文偏重個人抒情，與運動主旨無直接關係',
    is_correct = false,
    explanation = '此選項屬過度引申。古文運動確有復古傾向，但並非排斥個人抒情。本文寄情山水、託物言志，正是以質樸散文「言之有物」的典範，與古文運動的精神完全契合。'
WHERE id = 'q-ai-p08-33ff5c-opt1';

-- 弱干擾項2 (opt2) — 原為「古文運動是宋朝才興起的」→ 部分正確型
UPDATE dsemcq_question_options
SET text = '注重駢散結合的形式美感，本文的駢句正體現此一主張',
    is_correct = false,
    explanation = '此選項錯誤。古文運動的核心是以散文取代駢文，而非追求駢散結合的形式美。本文雖有駢句（如「悠悠乎……洋洋乎……」），但整體以散文為主，駢句的使用是為內容服務，並非刻意追求駢文形式。'
WHERE id = 'q-ai-p08-33ff5c-opt2';

-- 弱干擾項3 (opt3) — 原為「本文是駢文，違背古文主張」→ 偷換概念型
UPDATE dsemcq_question_options
SET text = '重視文章的實用議論功能，本文的遊記體裁與「文以載道」不符',
    is_correct = false,
    explanation = '此選項錯誤。「文以載道」並不限於議論文體。本文雖為遊記，但藉西山之遊寄託自身志節，抒發物我兩忘的哲理感悟，正是「文以明道」的體現，遊記同樣可以「載道」。'
WHERE id = 'q-ai-p08-33ff5c-opt3';

-- 補充缺失標籤
INSERT INTO dsemcq_question_tags (question_id, tag_id)
VALUES ('q-ai-p08-33ff5c', 't-context')
ON CONFLICT (question_id, tag_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 補充 q-ai-p08-c7bb1a 缺失標籤 (審題報告標記為 t-context)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO dsemcq_question_tags (question_id, tag_id)
VALUES ('q-ai-p08-c7bb1a', 't-context')
ON CONFLICT (question_id, tag_id) DO NOTHING;

COMMIT;

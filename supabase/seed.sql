-- ============================================================
-- DSE MCQ App — Seed Data
-- Run after: supabase db push
-- All INSERTs use ON CONFLICT (id) DO NOTHING for idempotency
-- ============================================================

-- ── 1. Tags ──────────────────────────────────────────────────
INSERT INTO dsemcq_tags (id, slug, label) VALUES
  ('t-meaning',       '字詞解釋',  '字詞解釋'),
  ('t-comprehension', '句意理解',  '句意理解'),
  ('t-theme',         '主旨',      '主旨'),
  ('t-rhetoric',      '修辭',      '修辭'),
  ('t-character',     '人物分析',  '人物分析'),
  ('t-comparison',    '比較閱讀',  '比較閱讀'),
  ('t-grammar',       '句式語法',  '句式語法'),
  ('t-context',       '背景知識',  '背景知識')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Passages ───────────────────────────────────────────────
INSERT INTO dsemcq_passages (id, slug, order_no, title, dynasty, author, summary, body, genre, themes, difficulty) VALUES
(
  'p01', 'lun-yu', 1, '論仁、論孝、論君子', '春秋', '孔子（《論語》）',
  '輯錄《論語》中論「仁」、「孝」、「君子」的章節，闡述儒家修身之道。',
  '【論仁】子曰：「不仁者，不可以久處約，不可以長處樂。仁者安仁，知者利仁。」
子曰：「君子無終食之間違仁，造次必於是，顛沛必於是。」
顏淵問仁。子曰：「克己復禮為仁……非禮勿視，非禮勿聽，非禮勿言，非禮勿動。」
【論孝】子曰：「事父母幾諫，見志不從，又敬不違，勞而不怨。」
子曰：「父母之年，不可不知也。一則以喜，一則以懼。」
【論君子】子曰：「君子坦蕩蕩，小人長戚戚。」
子曰：「君子成人之美，不成人之惡。小人反是。」
子曰：「君子求諸己，小人求諸人。」',
  '語錄體', ARRAY['仁義','孝道','修身','君子人格'], 2
),
(
  'p02', 'yu-wo-suo-yu', 2, '魚我所欲也', '戰國', '孟子',
  '以魚與熊掌、生與義作比喻，闡述「捨生取義」的思想，論證人皆有羞惡之心。',
  '孟子曰：「魚，我所欲也，熊掌，亦我所欲也；二者不可得兼，舍魚而取熊掌者也。生亦我所欲也，義亦我所欲也；二者不可得兼，舍生而取義者也……非獨賢者有是心也，人皆有之，賢者能勿喪耳。」',
  '議論文', ARRAY['捨生取義','人性本善','羞惡之心'], 2
),
(
  'p03', 'xiao-yao-you', 3, '逍遙遊（節錄）', '戰國', '莊子',
  '藉惠子與莊子的對話，論「無用之用」與精神自由，倡逍遙之境界。',
  '惠子謂莊子曰：「魏王貽我大瓠之種……吾為其無用而掊之。」莊子曰：「夫子固拙於用大矣！……今子有五石之瓠，何不慮以為大樽而浮於江湖？」莊子又以樗樹喻無用之用：「樹之於無何有之鄉，廣莫之野，彷徨乎無為其側，逍遙乎寢臥其下。」',
  '議論文', ARRAY['無用之用','逍遙','自由','寓言'], 3
),
(
  'p04', 'quan-xue', 4, '勸學（節錄）', '戰國', '荀子',
  '勸勉學者博學日省、善假於物、積累不舍，方能成德成業。',
  '君子曰：學不可以已。青，取之於藍，而青於藍；冰，水為之，而寒於水……故木受繩則直，金就礪則利，君子博學而日參省乎己，則知明而行無過矣。積土成山，風雨興焉；積水成淵，蛟龍生焉；積善成德，而神明自得，聖心備焉……鍥而舍之，朽木不折；鍥而不舍，金石可鏤。',
  '議論文', ARRAY['勸學','積累','持之以恆','善假於物'], 2
),
(
  'p05', 'lian-po-lin-xiang-ru', 5, '廉頗藺相如列傳（節錄）', '西漢', '司馬遷',
  '記述完璧歸趙、澠池之會、負荊請罪三事，彰顯藺相如智勇與廉頗知過能改。',
  '廉頗者，趙之良將也……藺相如者，趙人也……完璧歸趙：相如奉璧入秦，怒髮衝冠，終令璧歸趙。澠池之會：相如以頸血濺秦王相脅，逼秦王為趙王擊缻。負荊請罪：相如以「先國家之急而後私讎」自勵，廉頗肉袒負荊，遂為刎頸之交。',
  '史傳', ARRAY['智勇','先公後私','知錯能改','刎頸之交'], 3
),
(
  'p06', 'chu-shi-biao', 6, '出師表', '三國', '諸葛亮',
  '諸葛亮上書後主劉禪，勸開張聖聽、親賢遠佞、賞罰嚴明，並表明北伐興漢之志。',
  '先帝創業未半，而中道崩殂；今天下三分，益州疲弊，此誠危急存亡之秋也！誠宜開張聖聽，以光先帝遺德……親賢臣，遠小人，此先漢所以興隆也；親小人，遠賢臣，此後漢所以傾頹也……臣本布衣，躬耕於南陽……先帝不以臣卑鄙，猥自枉屈，三顧臣於草廬之中。',
  '表文', ARRAY['忠君報國','鞠躬盡瘁','親賢遠佞','北伐'], 2
),
(
  'p07', 'shi-shuo', 7, '師說', '唐', '韓愈',
  '論「師者，所以傳道、受業、解惑」，批判士大夫恥師之風，倡「道之所存，師之所存」。',
  '古之學者必有師。師者，所以傳道、受業、解惑也……是故無貴無賤，無長無少，道之所存，師之所存也。聖人無常師，孔子師郯子、萇弘、師襄、老聃……是故弟子不必不如師，師不必賢於弟子；聞道有先後，術業有專攻，如是而已。',
  '議論文', ARRAY['尊師重道','傳道','批判恥師之風'], 3
),
(
  'p08', 'shi-de-xi-shan', 8, '始得西山宴遊記', '唐', '柳宗元',
  '貶謫永州時所作，藉登西山所見之奇特，抒發超然物外、與萬化冥合之懷。',
  '自余為僇人，居是州，恒惴慄……今年九月二十八日，因坐法華西亭，望西山，始指異之……悠悠乎與顥氣俱，而莫得其涯；洋洋乎與造物者遊，而不知其所窮……心凝形釋，與萬化冥合。然後知吾嚮之未始遊，遊於是乎始，故為之文以志。',
  '遊記', ARRAY['貶謫','物我兩忘','自然','逍遙','借景抒情'], 3
),
(
  'p09', 'yue-yang-lou-ji', 9, '岳陽樓記', '北宋', '范仲淹',
  '為滕子京重修岳陽樓而作，藉景抒懷，提出「先天下之憂而憂，後天下之樂而樂」之高志。',
  '慶曆四年春，滕子京謫守巴陵郡……若夫霪雨霏霏，連月不開……登斯樓也，則有去國懷鄉……至若春和景明，波瀾不驚……登斯樓也，則有心曠神怡，寵辱皆忘……嗟夫！古仁人之心：不以物喜，不以己悲……先天下之憂而憂，後天下之樂而樂歟！',
  '記', ARRAY['憂國憂民','不以物喜','先憂後樂','借景抒情'], 2
),
(
  'p10', 'liu-guo-lun', 10, '六國論', '北宋', '蘇洵',
  '論六國滅亡之故在「賂秦」，借古諷今，警示北宋勿重蹈覆轍。',
  '六國破滅，非兵不利，戰不善，弊在賂秦。賂秦而力虧，破滅之道也。或曰：六國互喪，率賂秦耶？曰：不賂者以賂者喪。蓋失彊援，不能獨完。苟以天下之大，下而從六國破亡之故事，是又在六國下矣。',
  '議論文', ARRAY['賂秦','借古諷今','六國滅亡','警示'], 3
),
(
  'p11', 'qing-shan-jian-jiu', 11, '唐詩三首', '唐', '李白／杜甫／王維',
  '選讀盛唐三家代表作，體會盛唐氣象與不同詩風。',
  '（包括李白〈月下獨酌〉、杜甫〈登樓〉、王維〈山居秋暝〉等代表詩作。）',
  '詩', ARRAY['詩風','盛唐','意象','詩中有畫'], 2
),
(
  'p12', 'song-ci-three', 12, '宋詞三首', '宋', '蘇軾／李清照／辛棄疾',
  '選讀蘇軾〈念奴嬌・赤壁懷古〉、李清照〈聲聲慢〉、辛棄疾〈青玉案・元夕〉，感受豪放與婉約。',
  '（涵蓋豪放、婉約兩派代表詞作，體會北宋至南宋詞風變化。）',
  '詞', ARRAY['詞風','豪放','婉約','懷古'], 2
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Questions ─────────────────────────────────────────────
INSERT INTO dsemcq_questions (id, passage_id, stem, explanation, difficulty, source, is_active) VALUES
-- p01 論仁論孝論君子
('q-p01-1','p01','「君子坦蕩蕩，小人長戚戚」中，「戚戚」一詞最接近以下哪個意思？','「戚戚」形容心中不安、憂愁恐懼，與「坦蕩蕩」形成對比。',2,'seed',true),
('q-p01-2','p01','孔子說「君子求諸己，小人求諸人」，最能反映以下哪一種處世態度？','君子凡事先反省自己，小人則事事責怪他人；強調自我反省。',2,'seed',true),
('q-p01-3','p01','「克己復禮為仁」，孔子所言之「仁」主要透過什麼途徑實踐？','克制私欲、回復禮的規範，是仁的具體實踐方法。',3,'seed',true),
('q-p01-4','p01','「事父母幾諫」中，「幾諫」最切合的解釋是？','「幾諫」即委婉地勸諫，反映孝子規勸父母時的態度。',3,'seed',true),
-- p02 魚我所欲也
('q-p02-1','p02','孟子以「魚」與「熊掌」作比喻，主要為了說明什麼？','用具體事物的取捨類比「生」與「義」的取捨，引出捨生取義的論點。',2,'seed',true),
('q-p02-2','p02','「鄉為身死而不受，今為宮室之美為之」，「鄉」字最切合的解釋是？','「鄉」通「曏」（向），指從前、過去；與「今」相對。',3,'seed',true),
('q-p02-3','p02','孟子認為「非獨賢者有是心也」，「是心」是指：','指人皆有的羞惡之心、捨生取義之心；孟子論「人性本善」之依據。',2,'seed',true),
('q-p02-4','p02','「萬鍾則不辯禮義而受之」，作者意在批評：','批評為高官厚祿而不問禮義之徒，乃失其本心也。',3,'seed',true),
-- p03 逍遙遊
('q-p03-1','p03','莊子以「不龜手之藥」的故事，主要說明：','同一藥方，所用不同則結果迥異，說明「用大」之妙。',3,'seed',true),
('q-p03-2','p03','「無何有之鄉，廣莫之野」最能反映莊子追求的境界是：','象徵脫離世俗束縛的「無待」逍遙之境。',3,'seed',true),
('q-p03-3','p03','莊子稱惠子有「蓬之心」，意指：','蓬草中空彎曲，喻惠子心思閉塞、不通變。',4,'seed',true),
('q-p03-4','p03','「樗樹」的故事說明「無用之用」，下列何者最能體現此意？','樗樹因「無用」而免於斧斤，反得長壽逍遙；正是莊子「無用之用」之妙。',4,'seed',true),
-- p04 勸學
('q-p04-1','p04','「青，取之於藍，而青於藍」，最切合的說明是：','比喻學習可使人超越本師、超越本性。',1,'seed',true),
('q-p04-2','p04','「君子生非異也，善假於物也」，「假」字之意為：','「假」即借助、憑藉。',2,'seed',true),
('q-p04-3','p04','「鍥而舍之，朽木不折；鍥而不舍，金石可鏤」，最能說明：','強調學習貴在持之以恆。',2,'seed',true),
('q-p04-4','p04','荀子用「螾」與「蟹」作比，是為了說明：','螾無爪牙之利卻成其功，蟹有六跪二螯卻無寄託；對比突顯「用心一」的重要。',3,'seed',true),
-- p05 廉頗藺相如
('q-p05-1','p05','「完璧歸趙」中，藺相如表現出最突出的特質是：','面對秦王，藺相如冷靜果斷、機智勇敢。',2,'seed',true),
('q-p05-2','p05','藺相如「引車避匿」廉頗，主要是因為：','顧念國家安危，先公後私，以避免兩虎相鬥。',2,'seed',true),
('q-p05-3','p05','「肉袒負荊」一語反映廉頗：','廉頗坦誠認錯，謝罪藺相如，反映其知錯能改。',2,'seed',true),
('q-p05-4','p05','「澠池之會」一事中，藺相如以何法令秦王屈服？','他以「五步之內，請得以頸血濺大王」相脅，迫秦王為趙王擊缻。',3,'seed',true),
-- p06 出師表
('q-p06-1','p06','「先帝不以臣卑鄙」中，「卑鄙」一詞意思是：','古義為「身份低微、見識淺陋」，與今義「品格惡劣」不同。',3,'seed',true),
('q-p06-2','p06','諸葛亮以「親賢臣，遠小人」為例，主要是要：','勸諫後主以先漢興隆、後漢傾頹為鑑，勵精圖治。',2,'seed',true),
('q-p06-3','p06','「三顧臣於草廬之中」反映出先帝劉備：','三顧茅廬顯示劉備求賢若渴、禮賢下士。',1,'seed',true),
('q-p06-4','p06','全文最能體現諸葛亮對蜀漢的情感態度是：','「鞠躬盡瘁、忠君報國」一語可貫串全表。',2,'seed',true),
-- p07 師說
('q-p07-1','p07','韓愈所謂「師者，所以傳道、受業、解惑也」，下列哪項最符合此定義？','「傳道」指傳授道理，三者並重，當中「傳道」最為核心。',2,'seed',true),
('q-p07-2','p07','韓愈批評當時士大夫「恥學於師」，反映他主張：','提倡無論貴賤長少，只要懂道便可為師。',2,'seed',true),
('q-p07-3','p07','「弟子不必不如師，師不必賢於弟子」，最能反映：','聞道有先後、術業有專攻，師生關係不應拘於名分。',3,'seed',true),
('q-p07-4','p07','韓愈作《師說》以贈李蟠，主要因為李蟠：','李蟠不拘於時，能行古道，故為韓愈所嘉許。',2,'seed',true),
-- p08 始得西山宴遊記
('q-p08-1','p08','「自余為僇人，居是州，恒惴慄」中，「僇人」意指：','「僇人」即遭受刑辱、被貶之人，柳宗元自指被貶官員。',3,'seed',true),
('q-p08-2','p08','「然後知是山之特出，不與培塿為類」一語，作者借西山表達什麼？','藉西山之高大特出，自喻人格高潔不與庸俗為伍。',4,'seed',true),
('q-p08-3','p08','「心凝形釋，與萬化冥合」最能反映作者：','進入物我兩忘、與萬物合一的境界。',4,'seed',true),
('q-p08-4','p08','本文題曰「始得」，何以見得「始」字之妙？','「始」字反襯前所遊皆未得真趣，唯西山一遊方覺其真。',3,'seed',true),
-- p09 岳陽樓記
('q-p09-1','p09','「不以物喜，不以己悲」最能體現古仁人之心，意思是：','謂內心不為外物得失與一己際遇所動，是修養之高境。',2,'seed',true),
('q-p09-2','p09','「先天下之憂而憂，後天下之樂而樂」表現范仲淹的：','彰顯憂國憂民、以天下為己任的胸襟。',1,'seed',true),
('q-p09-3','p09','作者描寫陰雨景象與春和景象，主要採用什麼寫法？','對比映襯，藉景襯人之情，引出古仁人「不以物喜」之超然。',2,'seed',true),
('q-p09-4','p09','「微斯人，吾誰與歸」一句的「微」字意思是：','「微」即「沒有」之意，常見於文言文。',3,'seed',true),
-- p10 六國論
('q-p10-1','p10','蘇洵認為六國滅亡的根本原因是：','篇首即明確指出「弊在賂秦」。',1,'seed',true),
('q-p10-2','p10','「不賂者以賂者喪」，作者意在說明：','未賂之國因失強援，亦不能獨完，仍受賂秦之累。',3,'seed',true),
('q-p10-3','p10','「苟以天下之大，下而從六國破亡之故事」一語，蘇洵借古諷今，警示誰？','蘇洵借六國事勸誡北宋當權者勿賂遼夏，以免重蹈覆轍。',3,'seed',true),
('q-p10-4','p10','本文主要採取的論證方法是：','立論明確，再以歷史事例論證，並借古諷今。',3,'seed',true),
-- p11 唐詩三首
('q-p11-1','p11','「明月幾時有？把酒問青天」一語出自宋代蘇軾〈水調歌頭〉。下列哪位詩人有名句「舉頭望明月，低頭思故鄉」？','出自李白〈靜夜思〉，表現思鄉之情。',1,'seed',true),
('q-p11-2','p11','杜甫被後世尊稱為：','杜甫詩沉鬱頓挫，反映民生疾苦，故稱「詩聖」。',1,'seed',true),
('q-p11-3','p11','王維詩風主要特色為：','王維詩畫合一，多寫山水田園，意境清遠。',2,'seed',true),
('q-p11-4','p11','「明月松間照，清泉石上流」一句運用何種修辭技巧最為突出？','對偶兼帶聲色描寫，體現「詩中有畫」之風。',2,'seed',true),
-- p12 宋詞三首
('q-p12-1','p12','蘇軾〈念奴嬌．赤壁懷古〉「大江東去，浪淘盡，千古風流人物」屬於下列哪一詞風？','蘇軾為豪放派代表，氣勢雄渾。',1,'seed',true),
('q-p12-2','p12','李清照〈聲聲慢〉「尋尋覓覓，冷冷清清，悽悽慘慘戚戚」運用何種修辭手法最為突出？','連用十四個疊字，渲染孤寂哀愁。',2,'seed',true),
('q-p12-3','p12','辛棄疾〈青玉案．元夕〉「眾裡尋他千百度，驀然回首，那人卻在燈火闌珊處」最能表現：','藉尋人景象寄寓追求理想／知音之情，常被引申為人生境界。',3,'seed',true),
('q-p12-4','p12','李清照詞風通常被歸入：','李清照為婉約派代表，詞風含蓄細膩。',1,'seed',true)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Question Options ───────────────────────────────────────
INSERT INTO dsemcq_question_options (id, question_id, label, text, is_correct) VALUES
-- q-p01-1
('q-p01-1-a','q-p01-1','A','親近愉悅',false),
('q-p01-1-b','q-p01-1','B','憂愁不安',true),
('q-p01-1-c','q-p01-1','C','氣勢磅礡',false),
('q-p01-1-d','q-p01-1','D','感慨萬千',false),
-- q-p01-2
('q-p01-2-a','q-p01-2','A','對人嚴而對己寬',false),
('q-p01-2-b','q-p01-2','B','嚴於律己，反求諸己',true),
('q-p01-2-c','q-p01-2','C','重視外在的名聲',false),
('q-p01-2-d','q-p01-2','D','獨善其身不問世事',false),
-- q-p01-3
('q-p01-3-a','q-p01-3','A','苦行修煉',false),
('q-p01-3-b','q-p01-3','B','克制私欲、依禮而行',true),
('q-p01-3-c','q-p01-3','C','周遊列國',false),
('q-p01-3-d','q-p01-3','D','終日讀書',false),
-- q-p01-4
('q-p01-4-a','q-p01-4','A','多次勸告',false),
('q-p01-4-b','q-p01-4','B','委婉地勸諫',true),
('q-p01-4-c','q-p01-4','C','嚴厲斥責',false),
('q-p01-4-d','q-p01-4','D','暗中告發',false),
-- q-p02-1
('q-p02-1-a','q-p02-1','A','飲食的講究',false),
('q-p02-1-b','q-p02-1','B','生與義的取捨',true),
('q-p02-1-c','q-p02-1','C','貧富的差別',false),
('q-p02-1-d','q-p02-1','D','賢愚的分別',false),
-- q-p02-2
('q-p02-2-a','q-p02-2','A','鄉里',false),
('q-p02-2-b','q-p02-2','B','從前',true),
('q-p02-2-c','q-p02-2','C','向著',false),
('q-p02-2-d','q-p02-2','D','享受',false),
-- q-p02-3
('q-p02-3-a','q-p02-3','A','好勝之心',false),
('q-p02-3-b','q-p02-3','B','羞惡之心',true),
('q-p02-3-c','q-p02-3','C','懷古之心',false),
('q-p02-3-d','q-p02-3','D','憂民之心',false),
-- q-p02-4
('q-p02-4-a','q-p02-4','A','不講禮儀的鄉野之人',false),
('q-p02-4-b','q-p02-4','B','為厚祿而失本心之人',true),
('q-p02-4-c','q-p02-4','C','輕視財富之人',false),
('q-p02-4-d','q-p02-4','D','不孝順父母之人',false),
-- q-p03-1
('q-p03-1-a','q-p03-1','A','藥物的奇效',false),
('q-p03-1-b','q-p03-1','B','事物因用法不同而價值各異',true),
('q-p03-1-c','q-p03-1','C','宋人的愚昧',false),
('q-p03-1-d','q-p03-1','D','戰爭的殘酷',false),
-- q-p03-2
('q-p03-2-a','q-p03-2','A','建功立業',false),
('q-p03-2-b','q-p03-2','B','無拘無束的逍遙',true),
('q-p03-2-c','q-p03-2','C','歸隱田園',false),
('q-p03-2-d','q-p03-2','D','禮儀規範',false),
-- q-p03-3
('q-p03-3-a','q-p03-3','A','心思細密',false),
('q-p03-3-b','q-p03-3','B','心地光明',false),
('q-p03-3-c','q-p03-3','C','心思閉塞、不通變',true),
('q-p03-3-d','q-p03-3','D','心懷大志',false),
-- q-p03-4
('q-p03-4-a','q-p03-4','A','良材必為棟樑',false),
('q-p03-4-b','q-p03-4','B','看似無用反能保全自身',true),
('q-p03-4-c','q-p03-4','C','棄之可惜，取之無用',false),
('q-p03-4-d','q-p03-4','D','用人唯才',false),
-- q-p04-1
('q-p04-1-a','q-p04-1','A','天賦決定一切',false),
('q-p04-1-b','q-p04-1','B','後天學習可超越本師本性',true),
('q-p04-1-c','q-p04-1','C','顏色變化的現象',false),
('q-p04-1-d','q-p04-1','D','畫作技巧',false),
-- q-p04-2
('q-p04-2-a','q-p04-2','A','虛假',false),
('q-p04-2-b','q-p04-2','B','借助',true),
('q-p04-2-c','q-p04-2','C','假設',false),
('q-p04-2-d','q-p04-2','D','暫時',false),
-- q-p04-3
('q-p04-3-a','q-p04-3','A','天分的重要性',false),
('q-p04-3-b','q-p04-3','B','持之以恆的可貴',true),
('q-p04-3-c','q-p04-3','C','工具的重要',false),
('q-p04-3-d','q-p04-3','D','材料的選擇',false),
-- q-p04-4
('q-p04-4-a','q-p04-4','A','動物世界的奇妙',false),
('q-p04-4-b','q-p04-4','B','用心專一勝於外在條件',true),
('q-p04-4-c','q-p04-4','C','強者不必依賴他人',false),
('q-p04-4-d','q-p04-4','D','弱小者必受欺凌',false),
-- q-p05-1
('q-p05-1-a','q-p05-1','A','謙遜溫和',false),
('q-p05-1-b','q-p05-1','B','智勇兼備',true),
('q-p05-1-c','q-p05-1','C','貪財好利',false),
('q-p05-1-d','q-p05-1','D','怯懦退讓',false),
-- q-p05-2
('q-p05-2-a','q-p05-2','A','畏懼廉頗的武力',false),
('q-p05-2-b','q-p05-2','B','先國家之急而後私讎',true),
('q-p05-2-c','q-p05-2','C','想掩飾自己的無能',false),
('q-p05-2-d','q-p05-2','D','等待時機反擊',false),
-- q-p05-3
('q-p05-3-a','q-p05-3','A','驍勇善戰',false),
('q-p05-3-b','q-p05-3','B','知錯能改、勇於認過',true),
('q-p05-3-c','q-p05-3','C','善於辭令',false),
('q-p05-3-d','q-p05-3','D','深謀遠慮',false),
-- q-p05-4
('q-p05-4-a','q-p05-4','A','以重禮賄賂',false),
('q-p05-4-b','q-p05-4','B','聯合他國威脅',false),
('q-p05-4-c','q-p05-4','C','以死相迫，逼擊缻',true),
('q-p05-4-d','q-p05-4','D','遊說羣臣反秦',false),
-- q-p06-1
('q-p06-1-a','q-p06-1','A','品格惡劣',false),
('q-p06-1-b','q-p06-1','B','身份低微，見識淺陋',true),
('q-p06-1-c','q-p06-1','C','陰險狡詐',false),
('q-p06-1-d','q-p06-1','D','粗鄙無禮',false),
-- q-p06-2
('q-p06-2-a','q-p06-2','A','炫耀自己的才能',false),
('q-p06-2-b','q-p06-2','B','勸後主明辨忠奸、勵精圖治',true),
('q-p06-2-c','q-p06-2','C','貶低先帝以樹己威',false),
('q-p06-2-d','q-p06-2','D','推卸北伐責任',false),
-- q-p06-3
('q-p06-3-a','q-p06-3','A','好大喜功',false),
('q-p06-3-b','q-p06-3','B','禮賢下士、求才若渴',true),
('q-p06-3-c','q-p06-3','C','猜忌多疑',false),
('q-p06-3-d','q-p06-3','D','怯於決斷',false),
-- q-p06-4
('q-p06-4-a','q-p06-4','A','勉力支撐，意興闌珊',false),
('q-p06-4-b','q-p06-4','B','鞠躬盡瘁，忠君報國',true),
('q-p06-4-c','q-p06-4','C','急於攬權，獨斷專行',false),
('q-p06-4-d','q-p06-4','D','視富貴為浮雲',false),
-- q-p07-1
('q-p07-1-a','q-p07-1','A','只負責教學生句讀',false),
('q-p07-1-b','q-p07-1','B','傳授道理、講授學業、解答疑惑',true),
('q-p07-1-c','q-p07-1','C','只解答學生疑問',false),
('q-p07-1-d','q-p07-1','D','教授禮儀規範',false),
-- q-p07-2
('q-p07-2-a','q-p07-2','A','唯有官員可為人師',false),
('q-p07-2-b','q-p07-2','B','道之所存，師之所存',true),
('q-p07-2-c','q-p07-2','C','教師地位至高無上',false),
('q-p07-2-d','q-p07-2','D','讀書人應自學成才',false),
-- q-p07-3
('q-p07-3-a','q-p07-3','A','弟子應永遠服從老師',false),
('q-p07-3-b','q-p07-3','B','聞道有先後，術業有專攻',true),
('q-p07-3-c','q-p07-3','C','讀書必須勤能補拙',false),
('q-p07-3-d','q-p07-3','D','教師應廢除考試',false),
-- q-p07-4
('q-p07-4-a','q-p07-4','A','為官清廉',false),
('q-p07-4-b','q-p07-4','B','不拘時俗，能行古道',true),
('q-p07-4-c','q-p07-4','C','出身名門',false),
('q-p07-4-d','q-p07-4','D','工於詩賦',false),
-- q-p08-1
('q-p08-1-a','q-p08-1','A','勞苦之人',false),
('q-p08-1-b','q-p08-1','B','受刑辱、被貶之人',true),
('q-p08-1-c','q-p08-1','C','陸沉之人',false),
('q-p08-1-d','q-p08-1','D','鄉野之人',false),
-- q-p08-2
('q-p08-2-a','q-p08-2','A','對山勢的客觀描寫',false),
('q-p08-2-b','q-p08-2','B','以山自喻，志節高潔不與凡俗為伍',true),
('q-p08-2-c','q-p08-2','C','感歎攀山之難',false),
('q-p08-2-d','q-p08-2','D','羡慕隱士之樂',false),
-- q-p08-3
('q-p08-3-a','q-p08-3','A','悲愁難遣',false),
('q-p08-3-b','q-p08-3','B','物我兩忘的逍遙之境',true),
('q-p08-3-c','q-p08-3','C','酒醉昏睡',false),
('q-p08-3-d','q-p08-3','D','與山談心',false),
-- q-p08-4
('q-p08-4-a','q-p08-4','A','顯示作者是首位登山者',false),
('q-p08-4-b','q-p08-4','B','點出此前所遊皆未得真趣，至此始悟',true),
('q-p08-4-c','q-p08-4','C','強調登山的艱辛',false),
('q-p08-4-d','q-p08-4','D','說明西山新近開發',false),
-- q-p09-1
('q-p09-1-a','q-p09-1','A','對萬物無感、對自我冷漠',false),
('q-p09-1-b','q-p09-1','B','不為外物及一己際遇而喜悲',true),
('q-p09-1-c','q-p09-1','C','盼喜事連連',false),
('q-p09-1-d','q-p09-1','D','悲觀厭世',false),
-- q-p09-2
('q-p09-2-a','q-p09-2','A','獨善其身',false),
('q-p09-2-b','q-p09-2','B','憂國憂民、以天下為己任',true),
('q-p09-2-c','q-p09-2','C','及時行樂',false),
('q-p09-2-d','q-p09-2','D','崇尚自然',false),
-- q-p09-3
('q-p09-3-a','q-p09-3','A','層遞',false),
('q-p09-3-b','q-p09-3','B','對比映襯',true),
('q-p09-3-c','q-p09-3','C','白描',false),
('q-p09-3-d','q-p09-3','D','誇張',false),
-- q-p09-4
('q-p09-4-a','q-p09-4','A','微小',false),
('q-p09-4-b','q-p09-4','B','細微',false),
('q-p09-4-c','q-p09-4','C','沒有',true),
('q-p09-4-d','q-p09-4','D','卑微',false),
-- q-p10-1
('q-p10-1-a','q-p10-1','A','秦兵驍勇',false),
('q-p10-1-b','q-p10-1','B','賂秦致力虧',true),
('q-p10-1-c','q-p10-1','C','百姓不附',false),
('q-p10-1-d','q-p10-1','D','兵器不利',false),
-- q-p10-2
('q-p10-2-a','q-p10-2','A','未賂之國亦因失援而亡',true),
('q-p10-2-b','q-p10-2','B','賂秦之國終必反秦',false),
('q-p10-2-c','q-p10-2','C','賂秦能保六國平安',false),
('q-p10-2-d','q-p10-2','D','六國應獨立稱王',false),
-- q-p10-3
('q-p10-3-a','q-p10-3','A','六國諸侯',false),
('q-p10-3-b','q-p10-3','B','北宋朝廷',true),
('q-p10-3-c','q-p10-3','C','秦國君臣',false),
('q-p10-3-d','q-p10-3','D','唐朝皇帝',false),
-- q-p10-4
('q-p10-4-a','q-p10-4','A','純粹抒情',false),
('q-p10-4-b','q-p10-4','B','立論加例證、借古諷今',true),
('q-p10-4-c','q-p10-4','C','對話體記敘',false),
('q-p10-4-d','q-p10-4','D','詩歌詠嘆',false),
-- q-p11-1
('q-p11-1-a','q-p11-1','A','李白',true),
('q-p11-1-b','q-p11-1','B','杜甫',false),
('q-p11-1-c','q-p11-1','C','王維',false),
('q-p11-1-d','q-p11-1','D','白居易',false),
-- q-p11-2
('q-p11-2-a','q-p11-2','A','詩仙',false),
('q-p11-2-b','q-p11-2','B','詩聖',true),
('q-p11-2-c','q-p11-2','C','詩鬼',false),
('q-p11-2-d','q-p11-2','D','詩佛',false),
-- q-p11-3
('q-p11-3-a','q-p11-3','A','豪放慷慨',false),
('q-p11-3-b','q-p11-3','B','詩中有畫，意境清遠',true),
('q-p11-3-c','q-p11-3','C','沉鬱頓挫',false),
('q-p11-3-d','q-p11-3','D','纏綿悱惻',false),
-- q-p11-4
('q-p11-4-a','q-p11-4','A','誇張',false),
('q-p11-4-b','q-p11-4','B','對偶',true),
('q-p11-4-c','q-p11-4','C','反問',false),
('q-p11-4-d','q-p11-4','D','擬人',false),
-- q-p12-1
('q-p12-1-a','q-p12-1','A','婉約派',false),
('q-p12-1-b','q-p12-1','B','豪放派',true),
('q-p12-1-c','q-p12-1','C','花間派',false),
('q-p12-1-d','q-p12-1','D','格律派',false),
-- q-p12-2
('q-p12-2-a','q-p12-2','A','排比',false),
('q-p12-2-b','q-p12-2','B','疊字',true),
('q-p12-2-c','q-p12-2','C','誇張',false),
('q-p12-2-d','q-p12-2','D','對偶',false),
-- q-p12-3
('q-p12-3-a','q-p12-3','A','燈會的熱鬧',false),
('q-p12-3-b','q-p12-3','B','尋覓理想／知音的悠長心境',true),
('q-p12-3-c','q-p12-3','C','戰爭的殘酷',false),
('q-p12-3-d','q-p12-3','D','節慶的習俗',false),
-- q-p12-4
('q-p12-4-a','q-p12-4','A','豪放派',false),
('q-p12-4-b','q-p12-4','B','婉約派',true),
('q-p12-4-c','q-p12-4','C','邊塞派',false),
('q-p12-4-d','q-p12-4','D','山水田園派',false)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Question-Tag mapping ───────────────────────────────────
INSERT INTO dsemcq_question_tags (question_id, tag_id) VALUES
('q-p01-1','t-meaning'),
('q-p01-2','t-comprehension'),('q-p01-2','t-theme'),
('q-p01-3','t-theme'),
('q-p01-4','t-meaning'),
('q-p02-1','t-rhetoric'),('q-p02-1','t-theme'),
('q-p02-2','t-meaning'),('q-p02-2','t-grammar'),
('q-p02-3','t-theme'),
('q-p02-4','t-comprehension'),
('q-p03-1','t-rhetoric'),('q-p03-1','t-theme'),
('q-p03-2','t-theme'),
('q-p03-3','t-meaning'),('q-p03-3','t-rhetoric'),
('q-p03-4','t-theme'),('q-p03-4','t-rhetoric'),
('q-p04-1','t-rhetoric'),('q-p04-1','t-theme'),
('q-p04-2','t-meaning'),
('q-p04-3','t-theme'),('q-p04-3','t-rhetoric'),
('q-p04-4','t-rhetoric'),
('q-p05-1','t-character'),
('q-p05-2','t-character'),('q-p05-2','t-theme'),
('q-p05-3','t-character'),
('q-p05-4','t-character'),
('q-p06-1','t-meaning'),
('q-p06-2','t-theme'),
('q-p06-3','t-character'),('q-p06-3','t-context'),
('q-p06-4','t-theme'),('q-p06-4','t-character'),
('q-p07-1','t-comprehension'),('q-p07-1','t-theme'),
('q-p07-2','t-theme'),
('q-p07-3','t-theme'),
('q-p07-4','t-context'),
('q-p08-1','t-meaning'),('q-p08-1','t-context'),
('q-p08-2','t-theme'),('q-p08-2','t-rhetoric'),
('q-p08-3','t-theme'),
('q-p08-4','t-comprehension'),('q-p08-4','t-rhetoric'),
('q-p09-1','t-comprehension'),('q-p09-1','t-theme'),
('q-p09-2','t-theme'),
('q-p09-3','t-rhetoric'),
('q-p09-4','t-meaning'),
('q-p10-1','t-theme'),
('q-p10-2','t-comprehension'),
('q-p10-3','t-context'),('q-p10-3','t-theme'),
('q-p10-4','t-rhetoric'),
('q-p11-1','t-context'),
('q-p11-2','t-context'),
('q-p11-3','t-context'),
('q-p11-4','t-rhetoric'),
('q-p12-1','t-context'),
('q-p12-2','t-rhetoric'),
('q-p12-3','t-theme'),
('q-p12-4','t-context')
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- ── 6. Quizzes ────────────────────────────────────────────────
INSERT INTO dsemcq_quizzes (
  id, type, title, description, cover_image_url, passage_id,
  difficulty, duration_seconds, max_attempts, pass_score,
  points_reward, min_points_required, is_published,
  question_ids, featured, order_no, color_hex,
  estimated_duration_label, subject_area
) VALUES
(
  'quiz-exercise-lunyu', 'exercise', '《論語》入門練習',
  '從《論仁、論孝、論君子》入手，溫習儒家修身之道。建議考前必做。',
  'https://picsum.photos/seed/lunyu/600/400', 'p01',
  1, null, null, 60, 5, 0, true,
  ARRAY['q-p01-1','q-p01-2','q-p01-3','q-p01-4'],
  true, 1, '#E8D5B7', '約 5 分鐘', '先秦哲學'
),
(
  'quiz-quiz-mengzi-xunzi', 'quiz', '《孟子》《荀子》小測',
  '綜合〈魚我所欲也〉與〈勸學〉的句意理解測驗。限時 12 分鐘。',
  'https://picsum.photos/seed/mengzi/600/400', null,
  3, 720, 3, 70, 15, 0, true,
  ARRAY['q-p02-1','q-p02-2','q-p02-3','q-p02-4','q-p04-1','q-p04-2','q-p04-3','q-p04-4'],
  false, 2, '#B5D5C5', '12 分鐘', '先秦哲學'
),
(
  'quiz-exam-tang-song', 'exam', '唐宋古文模擬試',
  '綜合考核〈師說〉、〈始得西山宴遊記〉、〈岳陽樓記〉、〈六國論〉，模擬 DSE 試題。30 分鐘，僅限一次。',
  'https://picsum.photos/seed/tangsong/600/400', null,
  4, 1800, 1, 75, 30, 20, true,
  ARRAY['q-p07-1','q-p07-2','q-p07-3','q-p07-4',
        'q-p08-1','q-p08-2','q-p08-3','q-p08-4',
        'q-p09-1','q-p09-2','q-p09-3','q-p09-4',
        'q-p10-1','q-p10-2','q-p10-3','q-p10-4'],
  true, 3, '#C9B1D9', '30 分鐘', '唐宋散文'
),
(
  'quiz-exercise-poetry', 'exercise', '唐詩宋詞綜合練習',
  '鑑賞唐宋詩詞名句，掌握詩風與修辭。',
  'https://picsum.photos/seed/poetry/600/400', null,
  2, null, null, 60, 8, 0, true,
  ARRAY['q-p11-1','q-p11-2','q-p11-3','q-p11-4','q-p12-1','q-p12-2','q-p12-3','q-p12-4'],
  false, 4, '#F4C2C2', '約 8 分鐘', '詩詞'
),
(
  'quiz-quiz-zhuangzi', 'quiz', '《莊子．逍遙遊》專題測驗',
  '深入理解莊子「無用之用」與逍遙之境。',
  'https://picsum.photos/seed/zhuangzi/600/400', 'p03',
  3, 600, 3, 70, 12, 5, true,
  ARRAY['q-p03-1','q-p03-2','q-p03-3','q-p03-4'],
  false, 5, '#A8D8EA', '10 分鐘', '先秦哲學'
),
(
  'quiz-exam-full-mock', 'exam', 'DSE 文言文全卷模擬',
  '覆蓋十二篇指定篇章的綜合模擬試。需累積 50 文淵點解鎖。',
  'https://picsum.photos/seed/fullmock/600/400', null,
  5, 2700, 1, 75, 60, 50, true,
  ARRAY['q-p01-1','q-p01-2','q-p01-3','q-p01-4',
        'q-p02-1','q-p02-2','q-p02-3','q-p02-4',
        'q-p03-1','q-p03-2','q-p03-3','q-p03-4',
        'q-p04-1','q-p04-2','q-p04-3','q-p04-4',
        'q-p05-1','q-p05-2','q-p05-3','q-p05-4',
        'q-p06-1','q-p06-2','q-p06-3','q-p06-4',
        'q-p07-1','q-p07-2','q-p07-3','q-p07-4',
        'q-p08-1','q-p08-2','q-p08-3','q-p08-4',
        'q-p09-1','q-p09-2','q-p09-3','q-p09-4',
        'q-p10-1','q-p10-2','q-p10-3','q-p10-4',
        'q-p11-1','q-p11-2','q-p11-3','q-p11-4',
        'q-p12-1','q-p12-2','q-p12-3','q-p12-4'],
  true, 6, '#FFD700', '45 分鐘', '全卷'
)
ON CONFLICT (id) DO NOTHING;

-- ── 7. Tip Cards ──────────────────────────────────────────────
INSERT INTO dsemcq_tip_cards (
  id, title, subtitle, body, image_url, category,
  position, is_active, read_time_minutes, cta_label
) VALUES
(
  'tip-1', '📝 默書三步法', '記憶鞏固術',
  '1) 先朗讀全文三遍
2) 逐句默寫，遇錯即時查證
3) 隔日重默，鞏固記憶。',
  'https://picsum.photos/seed/dsemcq-tip-1/900/1400',
  'study', 1, true, 2, '立即試試'
),
(
  'tip-2', '🧘 考前焦慮怎麼辦？', '4-7-8 呼吸法',
  '深呼吸 4-7-8：吸 4 秒、屏 7 秒、呼 8 秒。連續做 3 輪，可以快速降低心率。',
  'https://picsum.photos/seed/dsemcq-tip-2/900/1400',
  'wellness', 2, true, 1, '了解更多'
),
(
  'tip-3', '📚 答題策略：先易後難', 'DSE 文言文必讀',
  'DSE 文言文選擇題建議先掃讀篇章，再逐題作答。遇到不懂的字詞，先做下一題，最後回頭重看。',
  'https://picsum.photos/seed/dsemcq-tip-3/900/1400',
  'exam_tip', 3, true, 2, '查看更多技巧'
),
(
  'tip-4', '💤 睡眠勝過熬夜', '考前必讀',
  '考試前一晚睡足 7 小時，比熬夜多看一篇文章更有效。記憶會在睡眠中鞏固。',
  'https://picsum.photos/seed/dsemcq-tip-4/900/1400',
  'rest', 4, true, 1, '了解睡眠科學'
),
(
  'tip-5', '🎯 主旨歸納法', '讀通文言文',
  '讀畢一篇文言文，試用一句話概括其中心思想。若做不到，代表還沒讀通。',
  'https://picsum.photos/seed/dsemcq-tip-5/900/1400',
  'study', 5, true, 2, '開始練習'
),
(
  'tip-6', '⏰ 番茄鐘學習法', '高效溫習',
  '專注 25 分鐘，休息 5 分鐘。每四個番茄鐘長休 15 分鐘。比馬拉松式溫習更有效率。',
  'https://picsum.photos/seed/dsemcq-tip-6/900/1400',
  'study', 6, true, 2, '試試看'
)
ON CONFLICT (id) DO NOTHING;

-- ── 8. Psych Tests ────────────────────────────────────────────
INSERT INTO dsemcq_psych_tests (
  id, slug, title, description, icon_name,
  question_count, estimated_minutes,
  questions, results,
  is_active, position, color_hex, featured
) VALUES
(
  'psy-character-match',
  'character-match',
  '你是哪位文言文人物？',
  '從十二篇指定篇章中，找出與你最相似的歷史／文學人物。',
  'person.fill.questionmark',
  5, 3,
  '[
    {"id":"q1","text":"面對挫折時你會：","options":[{"label":"勇於力爭，據理而為","value":1,"dimension":"linxiangru"},{"label":"退一步思考，以大局為重","value":1,"dimension":"kongzi"},{"label":"順其自然，逍遙處之","value":1,"dimension":"zhuangzi"},{"label":"立志苦讀以圖將來","value":1,"dimension":"xunzi"}]},
    {"id":"q2","text":"你最看重什麼？","options":[{"label":"義氣與正直","value":1,"dimension":"linxiangru"},{"label":"仁愛與禮","value":1,"dimension":"kongzi"},{"label":"自由與心境","value":1,"dimension":"zhuangzi"},{"label":"學問與積累","value":1,"dimension":"xunzi"}]},
    {"id":"q3","text":"閒時你最喜歡：","options":[{"label":"與朋友論天下大事","value":1,"dimension":"linxiangru"},{"label":"與弟子討論修身之道","value":1,"dimension":"kongzi"},{"label":"獨自漫遊山水之間","value":1,"dimension":"zhuangzi"},{"label":"讀書到深夜","value":1,"dimension":"xunzi"}]},
    {"id":"q4","text":"別人冒犯你，你會：","options":[{"label":"據理力爭，但顧大局","value":1,"dimension":"linxiangru"},{"label":"反求諸己，自省自警","value":1,"dimension":"kongzi"},{"label":"笑而不語，不放心上","value":1,"dimension":"zhuangzi"},{"label":"用學識回應對方","value":1,"dimension":"xunzi"}]},
    {"id":"q5","text":"你的夢想是：","options":[{"label":"為國效力，名留青史","value":1,"dimension":"linxiangru"},{"label":"成為一位有德之人","value":1,"dimension":"kongzi"},{"label":"活得自在無拘","value":1,"dimension":"zhuangzi"},{"label":"成為飽學之士","value":1,"dimension":"xunzi"}]}
  ]'::jsonb,
  '[
    {"code":"linxiangru","title":"你是藺相如","description":"智勇兼備，臨危不亂，能屈能伸。先公後私的胸襟令人敬服。","emoji":"⚔️"},
    {"code":"kongzi","title":"你是孔子","description":"重仁守禮，謙恭好學。「克己復禮」、「反求諸己」是你的修身之道。","emoji":"📖"},
    {"code":"zhuangzi","title":"你是莊子","description":"心境逍遙，看透世俗。「無用之用」乃你的智慧。","emoji":"🍃"},
    {"code":"xunzi","title":"你是荀子","description":"勤學不輟，相信「鍥而不舍」。「青出於藍」是你的座右銘。","emoji":"📚"}
  ]'::jsonb,
  true, 1, '#E8D5B7', true
),
(
  'psy-study-style',
  'study-style',
  '你的學習風格',
  '了解最適合你的溫習方式，讓 DSE 備戰事半功倍。',
  'books.vertical.fill',
  4, 2,
  '[
    {"id":"q1","text":"新學一個概念，你最快透過：","options":[{"label":"看圖表／流程圖","value":1,"dimension":"visual"},{"label":"聽老師講解","value":1,"dimension":"auditory"},{"label":"親自做習題","value":1,"dimension":"kinesthetic"},{"label":"閱讀文字解說","value":1,"dimension":"reading"}]},
    {"id":"q2","text":"背書時你會：","options":[{"label":"畫心智圖","value":1,"dimension":"visual"},{"label":"朗讀／錄音重聽","value":1,"dimension":"auditory"},{"label":"邊抄邊背","value":1,"dimension":"kinesthetic"},{"label":"重複默寫","value":1,"dimension":"reading"}]},
    {"id":"q3","text":"課堂上你最專注的時候：","options":[{"label":"看到投影片色彩豐富","value":1,"dimension":"visual"},{"label":"老師講故事","value":1,"dimension":"auditory"},{"label":"做小組活動","value":1,"dimension":"kinesthetic"},{"label":"做筆記時","value":1,"dimension":"reading"}]},
    {"id":"q4","text":"考試前一天，你會：","options":[{"label":"看自己畫的筆記圖","value":1,"dimension":"visual"},{"label":"找同學互問互答","value":1,"dimension":"auditory"},{"label":"做模擬卷","value":1,"dimension":"kinesthetic"},{"label":"重讀整份筆記","value":1,"dimension":"reading"}]}
  ]'::jsonb,
  '[
    {"code":"visual","title":"視覺型學習者","description":"善於從圖像、色彩、空間排列獲得資訊。多用心智圖、流程圖、表格。","emoji":"👁️"},
    {"code":"auditory","title":"聽覺型學習者","description":"從聲音與討論中學最快。試著朗讀、錄音重聽，或找同學互相講解。","emoji":"👂"},
    {"code":"kinesthetic","title":"動手實作型","description":"做才能記得。多做模擬題、抄寫、實作活動。","emoji":"✋"},
    {"code":"reading","title":"閱讀／書寫型","description":"靠閱讀文字最為踏實。多寫讀書筆記、整理重點。","emoji":"📖"}
  ]'::jsonb,
  true, 2, '#B5D5C5', false
),
(
  'psy-career-inclination',
  'career-inclination',
  'DSE 後路向初探',
  '5 分鐘小測，看看你可能適合哪類大學科目／職業方向。',
  'graduationcap.fill',
  5, 3,
  '[
    {"id":"q1","text":"你最享受的活動是：","options":[{"label":"解難題、思考邏輯","value":1,"dimension":"stem"},{"label":"創作、寫作、藝術","value":1,"dimension":"arts"},{"label":"幫助他人、做義工","value":1,"dimension":"social"},{"label":"規劃、做計算","value":1,"dimension":"business"}]},
    {"id":"q2","text":"你最常被人稱讚：","options":[{"label":"聰明、解題快","value":1,"dimension":"stem"},{"label":"有想像力、有藝術細胞","value":1,"dimension":"arts"},{"label":"細心、有同理心","value":1,"dimension":"social"},{"label":"務實、有領導力","value":1,"dimension":"business"}]},
    {"id":"q3","text":"你看新聞最關注：","options":[{"label":"科技、太空、AI","value":1,"dimension":"stem"},{"label":"電影、音樂、文化","value":1,"dimension":"arts"},{"label":"教育、社福、心理健康","value":1,"dimension":"social"},{"label":"經濟、創業、投資","value":1,"dimension":"business"}]},
    {"id":"q4","text":"你的理想工作環境：","options":[{"label":"實驗室／研究所","value":1,"dimension":"stem"},{"label":"工作室／劇場","value":1,"dimension":"arts"},{"label":"學校／醫院／社福機構","value":1,"dimension":"social"},{"label":"辦公室／企業","value":1,"dimension":"business"}]},
    {"id":"q5","text":"你選科時最看重：","options":[{"label":"邏輯與技術挑戰","value":1,"dimension":"stem"},{"label":"創意空間","value":1,"dimension":"arts"},{"label":"對人與社會的影響","value":1,"dimension":"social"},{"label":"前途與收入","value":1,"dimension":"business"}]}
  ]'::jsonb,
  '[
    {"code":"stem","title":"理工探索者","description":"邏輯思維強，適合科學、工程、電腦、數學等領域。","emoji":"🔬"},
    {"code":"arts","title":"創作藝術派","description":"想像力豐富，適合文學、藝術、設計、傳媒。","emoji":"🎨"},
    {"code":"social","title":"助人服務型","description":"同理心強，適合教育、社工、心理、醫護等職業。","emoji":"🤝"},
    {"code":"business","title":"務實謀略派","description":"目標清晰，適合商科、經濟、管理、法律。","emoji":"💼"}
  ]'::jsonb,
  true, 3, '#C9B1D9', false
)
ON CONFLICT (id) DO NOTHING;

-- ── 8b. Psych Tests v2 (enriched with historical context, strengths, study tips) ──
INSERT INTO dsemcq_psych_tests (
  id, slug, title, description, icon_name,
  question_count, estimated_minutes,
  questions, results,
  is_active, position, color_hex, featured
) VALUES
(
  'psy-character-match-v2',
  'character-match-v2',
  '你最像哪位指定篇章人物？（深度版）',
  '十道問題找出你與哪位古典人物最為神似，發掘你的學習性格與人生強項。',
  'person.fill.checkmark',
  10, 5,
  '[{"id": "q1", "text": "面對強大對手，你通常會：", "options": [{"label": "以智謀化解，迂迴取勝", "value": 1, "dimension": "linxiangru"}, {"label": "以德服人，耐心溝通", "value": 1, "dimension": "kongzi"}, {"label": "一笑而過，不必計較", "value": 1, "dimension": "zhuangzi"}, {"label": "加倍用功，以實力回應", "value": 1, "dimension": "xunzi"}, {"label": "堅守立場，毫不退讓", "value": 1, "dimension": "suwu"}, {"label": "直接迎戰，正面較量", "value": 1, "dimension": "lianpo"}]}, {"id": "q2", "text": "你最看重的個人品格是：", "options": [{"label": "智慧與大局觀", "value": 1, "dimension": "linxiangru"}, {"label": "仁愛與禮節", "value": 1, "dimension": "kongzi"}, {"label": "自由與超脫", "value": 1, "dimension": "zhuangzi"}, {"label": "學識與積累", "value": 1, "dimension": "xunzi"}, {"label": "忠誠與氣節", "value": 1, "dimension": "suwu"}, {"label": "勇氣與知錯能改", "value": 1, "dimension": "lianpo"}]}, {"id": "q3", "text": "遭人誤解或冤枉，你會：", "options": [{"label": "智慧化解，顧全大局", "value": 1, "dimension": "linxiangru"}, {"label": "自我反省，是否有不足", "value": 1, "dimension": "kongzi"}, {"label": "笑而不語，不放心上", "value": 1, "dimension": "zhuangzi"}, {"label": "以事實與知識說話", "value": 1, "dimension": "xunzi"}, {"label": "默默等待，相信時間證明", "value": 1, "dimension": "suwu"}, {"label": "立即反駁，維護名聲", "value": 1, "dimension": "lianpo"}]}, {"id": "q4", "text": "你的人生夢想是：", "options": [{"label": "為集體出謀獻策，共渡難關", "value": 1, "dimension": "linxiangru"}, {"label": "成為有德有仁之人", "value": 1, "dimension": "kongzi"}, {"label": "活得自在，無拘無束", "value": 1, "dimension": "zhuangzi"}, {"label": "學識淵博，通曉古今", "value": 1, "dimension": "xunzi"}, {"label": "問心無愧，守住本心", "value": 1, "dimension": "suwu"}, {"label": "建立功業，贏得認可", "value": 1, "dimension": "lianpo"}]}, {"id": "q5", "text": "朋友之間發生衝突，你通常：", "options": [{"label": "居中調解，維護大局", "value": 1, "dimension": "linxiangru"}, {"label": "以道理開導，促進和諧", "value": 1, "dimension": "kongzi"}, {"label": "看開點，何必太認真", "value": 1, "dimension": "zhuangzi"}, {"label": "引用事例分析，理性解決", "value": 1, "dimension": "xunzi"}, {"label": "默默等待，讓各方冷靜", "value": 1, "dimension": "suwu"}, {"label": "直接表態，站在正確一邊", "value": 1, "dimension": "lianpo"}]}, {"id": "q6", "text": "遭遇重大失敗或挫折，你的反應是：", "options": [{"label": "分析原因，調整策略重新出發", "value": 1, "dimension": "linxiangru"}, {"label": "深自反省，從內找出不足", "value": 1, "dimension": "kongzi"}, {"label": "放下執著，順其自然", "value": 1, "dimension": "zhuangzi"}, {"label": "研究失敗原因，補充弱點", "value": 1, "dimension": "xunzi"}, {"label": "繼續堅持，不輕言放棄", "value": 1, "dimension": "suwu"}, {"label": "發憤圖強，誓要翻身", "value": 1, "dimension": "lianpo"}]}, {"id": "q7", "text": "你最認同的人生態度是：", "options": [{"label": "先公後私，以大局為重", "value": 1, "dimension": "linxiangru"}, {"label": "克己復禮，從自身做起", "value": 1, "dimension": "kongzi"}, {"label": "順應自然，心境超脫", "value": 1, "dimension": "zhuangzi"}, {"label": "積學儲寶，厚積薄發", "value": 1, "dimension": "xunzi"}, {"label": "威武不屈，守節至終", "value": 1, "dimension": "suwu"}, {"label": "知錯能改，善莫大焉", "value": 1, "dimension": "lianpo"}]}, {"id": "q8", "text": "你在群體中通常擔任什麼角色？", "options": [{"label": "協調者，維持群體和諧", "value": 1, "dimension": "linxiangru"}, {"label": "引導者，分享智慧與道理", "value": 1, "dimension": "kongzi"}, {"label": "獨行俠，不受群體約束", "value": 1, "dimension": "zhuangzi"}, {"label": "顧問，提供豐富知識支援", "value": 1, "dimension": "xunzi"}, {"label": "守護者，堅定護衛原則", "value": 1, "dimension": "suwu"}, {"label": "先鋒者，帶頭衝鋒陷陣", "value": 1, "dimension": "lianpo"}]}, {"id": "q9", "text": "溫習時，你最常出現的狀態是：", "options": [{"label": "靈活應對，因應難度調整策略", "value": 1, "dimension": "linxiangru"}, {"label": "認真反思，弄明白才罷休", "value": 1, "dimension": "kongzi"}, {"label": "心情好才溫習，不強迫自己", "value": 1, "dimension": "zhuangzi"}, {"label": "系統全面，每個篇章詳細筆記", "value": 1, "dimension": "xunzi"}, {"label": "即使疲憊，也要完成當日計劃", "value": 1, "dimension": "suwu"}, {"label": "全力以赴，要做就做到最好", "value": 1, "dimension": "lianpo"}]}, {"id": "q10", "text": "哪句話最能形容你的處世之道？", "options": [{"label": "審時度勢，隨機應變", "value": 1, "dimension": "linxiangru"}, {"label": "溫故知新，舉一反三", "value": 1, "dimension": "kongzi"}, {"label": "知足者常樂，自在逍遙", "value": 1, "dimension": "zhuangzi"}, {"label": "鍥而不捨，金石可鏤", "value": 1, "dimension": "xunzi"}, {"label": "富貴不淫，貧賤不移", "value": 1, "dimension": "suwu"}, {"label": "百尺竿頭，更進一步", "value": 1, "dimension": "lianpo"}]}]'::jsonb,
  '[{"code": "linxiangru", "title": "你是藺相如", "description": "智勇兼備，臨危不亂，能屈能伸。先公後私的胸襟令人敬服，以大局化解一切困境。", "emoji": "sword", "historical_figure": "藺相如（約公元前3世紀，趙國謀臣）", "historical_background": "藺相如是趙惠文王的著名謀臣，以完璧歸趙和澠池之會聞名於世，憑藉超凡智慧與膽識維護了趙國的尊嚴。面對廉頗的無理挑釁，他選擇以大局為重，主動退讓，其先公後私的精神令廉頗深感佩服，最終負荊請罪，成就了千古佳話。", "strengths": ["冷靜分析情勢，不輕易慌亂", "具備說服力和出色的外交手腕", "以大局為重，不計個人恩怨"], "weaknesses": ["有時可能被誤解為軟弱退讓", "在持續高壓情況下較難放鬆"], "famous_quote": "吾所以為此者，以先國家之急而後私仇也。", "study_tips": ["面對複雜題目，先分析整體結構再處理細節", "培養退一步海闊天空的解題思維", "多理解人物的深層動機，有助分析主旨題"]}, {"code": "kongzi", "title": "你是孔子", "description": "重仁守禮，謙恭好學。克己復禮是你的修身之道，以德感人，以學育人。", "emoji": "books", "historical_figure": "孔子（公元前551年—前479年，魯國，儒家創始人）", "historical_background": "孔子名丘，字仲尼，儒家學派的創始人，被尊為至聖先師。他一生致力於推行仁義之道，主張克己復禮，強調自我修身與社會和諧。雖然政治抱負未能完全實現，但他編訂六經，培育三千弟子，對中華文化產生了深遠影響。", "strengths": ["有耐心，善於反思自己的行為", "謙遜好學，重視人際關係", "具備強大的道德自律能力"], "weaknesses": ["有時過於守禮，面對革新較保守", "容易對自己要求過高而感到壓力"], "famous_quote": "克己復禮為仁。一日克己復禮，天下歸仁焉。", "study_tips": ["建立固定溫習時間表，培養自律習慣", "每日溫習後作反思記錄，吾日三省吾身", "以理解帶動記憶，不要死背原文"]}, {"code": "zhuangzi", "title": "你是莊子", "description": "心境逍遙，看透世俗。善以寓言闡發哲理，相信無用之用是為大用。", "emoji": "leaf", "historical_figure": "莊子（約公元前369年—前286年，宋國，道家代表）", "historical_background": "莊子名周，道家學派代表人物。著莊子三十三篇，以寓言說理，影響深遠。他主張順應自然、心境超脫，提倡無為而治的哲學。逍遙遊中的大鵬，正是他心靈自由境界的寫照。", "strengths": ["思維靈活，不受定式束縛", "面對壓力時能保持心理平衡", "創意豐富，角度獨特"], "weaknesses": ["有時缺乏系統性紀律", "難以長期配合高度規律化的學習"], "famous_quote": "至人無己，神人無功，聖人無名。", "study_tips": ["嘗試創意筆記法，以圖像或比喻幫助記憶", "以興趣帶動學習，找出語文中你最喜愛的篇章", "閱讀莊子文章時，多想想作者的深層寓意"]}, {"code": "xunzi", "title": "你是荀子", "description": "勤學不輟，相信積學儲寶。鍥而不捨金石可鏤是你的信念，踏實厚積，必有所成。", "emoji": "backpack", "historical_figure": "荀子（約公元前313年—前238年，趙國，儒家後期代表）", "historical_background": "荀子名況，儒家後期代表人物，主張人性本惡，強調後天教育與學習的重要性。著有荀子三十二篇，其中勸學篇以大量比喻說明學習的必要，影響後世深遠。他認為只要持之以恆，任何人都能通過學習達到君子境界。", "strengths": ["勤奮踏實，善於積累知識", "學習方法系統有序", "能長期堅持有計劃的溫習"], "weaknesses": ["有時過於刻板，難以接受彈性安排", "創意發揮方面相對保守"], "famous_quote": "鍥而不捨，金石可鏤；鍥而舍之，朽木不折。", "study_tips": ["制定詳細溫習計劃，每天按計劃執行", "系統整理每個篇章要點，勤做筆記", "相信積累的力量，不要急於求成"]}, {"code": "suwu", "title": "你是蘇武", "description": "意志堅定，百折不撓。即使身處逆境也能守住信念，是少見的毅力型人格。", "emoji": "mountain", "historical_figure": "蘇武（公元前140年—前60年，西漢使節）", "historical_background": "蘇武是西漢著名使節，奉命出使匈奴，被扣留漠北牧羊長達十九年。身處極端惡劣的環境，他始終堅持持漢節，不肯降服，成為中國歷史上忠貞氣節的典型。節旄盡落的蘇武，最終被接回漢朝，傳頌千年。", "strengths": ["意志力超強，能長期堅持目標", "對信念的忠誠度極高", "在逆境中仍能保持穩定心態"], "weaknesses": ["可能過於固執，難以接受妥協", "過分自我要求，忽略了適時休息"], "famous_quote": "屈節辱命，雖生，何面目以歸漢！", "study_tips": ["設定長遠學習目標，不因短期成效不明顯而放棄", "把考試視為展現毅力的機會", "遇到難關時，相信堅持的力量，不輕易放棄"]}, {"code": "lianpo", "title": "你是廉頗", "description": "勇於認錯，從善如流。英勇善戰，坦蕩磊落，知錯必改是你最可貴的品格。", "emoji": "shield", "historical_figure": "廉頗（約公元前327年—前243年，趙國名將）", "historical_background": "廉頗是趙國著名將領，英勇善戰，屢立戰功。初時因藺相如得寵而心生不滿，一度揚言羞辱對方。後得知藺相如先公後私的用意，深感慚愧，親負荊棘前往藺相如府上謝罪，成就了負荊請罪這一流傳千古的美談。", "strengths": ["行動力強，敢作敢為", "能自我反省，主動承擔責任", "坦蕩直接，不拐彎抹角"], "weaknesses": ["容易衝動，有時感情用事", "初時自尊心過強，難以接受比較"], "famous_quote": "相如素賤人，吾羞，不忍為之下！後乃負荊請罪。", "study_tips": ["遇到答錯的題目，要積極研究錯誤原因", "勇於承認不懂，主動向老師提問", "把每次測驗的失誤當作成長機會，不要逃避"]}]'::jsonb,
  true, 4, '#C4975A', false
),
(
  'psy-study-style-v2',
  'study-style-v2',
  '你的學習風格是哪種？（深度版）',
  '十道問題揭示你最有效的學習方式，以及如何善用強項備考DSE。',
  'brain.head.profile',
  10, 5,
  '[{"id": "q1", "text": "學習新概念時，你最快透過哪種方式吸收？", "options": [{"label": "看圖表或視覺化呈現", "value": 1, "dimension": "visual"}, {"label": "聽老師講解或重複聆聽", "value": 1, "dimension": "auditory"}, {"label": "親自動手試驗或操作", "value": 1, "dimension": "kinesthetic"}, {"label": "仔細閱讀文字說明", "value": 1, "dimension": "reading"}, {"label": "與同學討論並相互解釋", "value": 1, "dimension": "social"}]}, {"id": "q2", "text": "考試前一週，你的主要溫習方式是：", "options": [{"label": "畫心智圖或彩色圖表", "value": 1, "dimension": "visual"}, {"label": "大聲朗讀重點、自問自答", "value": 1, "dimension": "auditory"}, {"label": "大量練習模擬試題", "value": 1, "dimension": "kinesthetic"}, {"label": "重讀筆記，整理重點清單", "value": 1, "dimension": "reading"}, {"label": "組溫習小組互相提問", "value": 1, "dimension": "social"}]}, {"id": "q3", "text": "上課時最能讓你集中的情況是：", "options": [{"label": "老師用投影片和圖片說明", "value": 1, "dimension": "visual"}, {"label": "老師講故事或生動例子", "value": 1, "dimension": "auditory"}, {"label": "做課堂活動或角色扮演", "value": 1, "dimension": "kinesthetic"}, {"label": "老師讓同學安靜自行閱讀", "value": 1, "dimension": "reading"}, {"label": "分組討論，互相分享意見", "value": 1, "dimension": "social"}]}, {"id": "q4", "text": "背誦文言詞語時，你的方法是：", "options": [{"label": "製作圖像配對卡", "value": 1, "dimension": "visual"}, {"label": "大聲朗讀，反覆聆聽", "value": 1, "dimension": "auditory"}, {"label": "反覆抄寫直至熟練", "value": 1, "dimension": "kinesthetic"}, {"label": "默寫後逐字核對原文", "value": 1, "dimension": "reading"}, {"label": "與朋友互相考問", "value": 1, "dimension": "social"}]}, {"id": "q5", "text": "你的課堂筆記通常是：", "options": [{"label": "顏色豐富，圖文並茂", "value": 1, "dimension": "visual"}, {"label": "簡短關鍵詞，靠記憶補充", "value": 1, "dimension": "auditory"}, {"label": "書寫詳盡，幾乎抄下每句話", "value": 1, "dimension": "kinesthetic"}, {"label": "條理清晰的文字重點摘要", "value": 1, "dimension": "reading"}, {"label": "靠朋友借筆記，加入自己補充", "value": 1, "dimension": "social"}]}, {"id": "q6", "text": "遇到難懂的問題，你首先會：", "options": [{"label": "畫圖或流程圖來分析", "value": 1, "dimension": "visual"}, {"label": "在腦海中模擬老師解題過程", "value": 1, "dimension": "auditory"}, {"label": "直接嘗試解答，從錯誤中學習", "value": 1, "dimension": "kinesthetic"}, {"label": "翻書找相關原文或解釋", "value": 1, "dimension": "reading"}, {"label": "立刻問同學或老師", "value": 1, "dimension": "social"}]}, {"id": "q7", "text": "最能幫助你記住新知識的方式是：", "options": [{"label": "配合圖像或短片", "value": 1, "dimension": "visual"}, {"label": "反覆聆聽相關講解或朗讀", "value": 1, "dimension": "auditory"}, {"label": "親身體驗或情景模擬", "value": 1, "dimension": "kinesthetic"}, {"label": "重複閱讀並寫下重點", "value": 1, "dimension": "reading"}, {"label": "向他人解釋這個知識", "value": 1, "dimension": "social"}]}, {"id": "q8", "text": "語文科你最喜歡的課堂形式是：", "options": [{"label": "圖文並茂的投影片教學", "value": 1, "dimension": "visual"}, {"label": "老師精彩講解並錄音重聽", "value": 1, "dimension": "auditory"}, {"label": "角色扮演或寫作工作坊", "value": 1, "dimension": "kinesthetic"}, {"label": "安靜閱讀及分析文章", "value": 1, "dimension": "reading"}, {"label": "同學互教或分組討論", "value": 1, "dimension": "social"}]}, {"id": "q9", "text": "考試結束後，你覺得哪種準備最有幫助？", "options": [{"label": "靠記憶圖表和佈局作答", "value": 1, "dimension": "visual"}, {"label": "靠在心中複誦重點", "value": 1, "dimension": "auditory"}, {"label": "靠大量練習題應付自如", "value": 1, "dimension": "kinesthetic"}, {"label": "靠充足閱讀掌握答題要點", "value": 1, "dimension": "reading"}, {"label": "靠與同學練問答增強信心", "value": 1, "dimension": "social"}]}, {"id": "q10", "text": "當你完全不明白一個知識點時，你通常：", "options": [{"label": "先尋找視覺化資料（圖解或影片）", "value": 1, "dimension": "visual"}, {"label": "找相關講解音頻或影片", "value": 1, "dimension": "auditory"}, {"label": "直接找題目嘗試邊做邊理解", "value": 1, "dimension": "kinesthetic"}, {"label": "查書本或網上文字資料", "value": 1, "dimension": "reading"}, {"label": "找人解釋直到明白為止", "value": 1, "dimension": "social"}]}]'::jsonb,
  '[{"code": "visual", "title": "視覺型學習者", "description": "透過圖表、顏色和視覺佈局最有效地吸收知識，空間記憶力強，善於整體把握結構。", "emoji": "eye", "historical_figure": "視覺學習理論（VARK模型，Neil Fleming，1987）", "historical_background": "研究顯示視覺型學習者佔學生人口約65%，在記憶圖形佈局和顏色分類方面特別出色。DSE中古典文學充滿生動意象描寫，視覺型學習者在分析文章意象和篇章結構時往往能快速理解。", "strengths": ["快速掌握圖表和圖像資訊", "記憶力強，尤其對視覺材料", "擅長整體佈局和結構分析"], "weaknesses": ["面對大量純文字題目較吃力", "聆聽長篇講解時容易分心"], "famous_quote": "一圖勝千言。", "study_tips": ["善用心智圖整理文言文篇章結構", "用顏色區分不同考核能力的筆記", "為每個篇章繪製人物關係圖或時序圖"]}, {"code": "auditory", "title": "聽覺型學習者", "description": "透過聲音、節奏和語言韻律最有效地吸收知識，擅長在對話中深化理解。", "emoji": "ear", "historical_figure": "VARK學習模型（Neil Fleming，1987）聽覺維度", "historical_background": "聽覺型學習者透過朗讀和討論最有效地吸收知識。研究表明，大聲朗讀文言文有助記憶整句句式，對DSE文言文閱讀理解及句式分析題目特別有效。", "strengths": ["能準確記住聽過的例子和故事", "口頭表達和討論能力強", "透過對話加深理解"], "weaknesses": ["在安靜環境中獨自溫習容易走神", "視覺圖表的幫助相對有限"], "famous_quote": "讀書百遍，而義自見。", "study_tips": ["錄製重要文言詞語和句式的朗讀音頻", "與同學互相朗讀文章並討論語境", "考試前在心中默唸關鍵句子鞏固記憶"]}, {"code": "kinesthetic", "title": "動手實作型學習者", "description": "透過直接體驗和反覆練習最有效地鞏固知識，實戰能力強，從錯誤中快速學習。", "emoji": "hand", "historical_figure": "杜威做中學教育哲學（John Dewey，1938）", "historical_background": "教育家杜威的做中學理論指出，真正的理解來自親身參與。在備考DSE時，持續做練習題是動手型學習者最有效的溫習策略，每次做完卷後認真核對，學習效果遠高於單純閱讀。", "strengths": ["實際操練能力強，做完題目後記憶深刻", "在考試壓力下反應快", "能從錯誤中快速調整"], "weaknesses": ["靠閱讀理論而缺乏練習時，吸收較慢", "容易急於做題而忽略深入理解"], "famous_quote": "紙上得來終覺淺，絕知此事要躬行。", "study_tips": ["多做歷年試題，重視實戰練習", "為每個答錯的題目親自找對應原文核對", "嘗試把複雜概念以情景模擬幫助記憶"]}, {"code": "reading", "title": "閱讀書寫型學習者", "description": "在文字分析和組織資訊方面具天然優勢，筆記詳盡，善於歸納總結。", "emoji": "pencil", "historical_figure": "閱讀理解研究（Adams，2001，學習科學）", "historical_background": "閱讀書寫型學習者在語文科的表現尤為突出，因為他們擅長從文字中提取資訊、系統整理並構建知識框架。研究顯示此類學習者在撰寫詳細筆記後，知識留存率比單純閱讀高出40%以上。", "strengths": ["文字閱讀快速，理解準確", "筆記詳盡，條理清晰", "善於歸納總結和概念整理"], "weaknesses": ["有時花過多時間閱讀而減少練習", "圖像類資訊的吸收相對較弱"], "famous_quote": "學而不思則罔，思而不學則殆。", "study_tips": ["為每個指定篇章撰寫詳細主旨分析筆記", "整理答題框架時用文字清楚列出各步驟", "閱讀完後立即寫下個人總結以鞏固記憶"]}, {"code": "social", "title": "社交協作型學習者", "description": "在互動和討論中最有效地建構知識，善於從他人角度豐富自己的理解。", "emoji": "handshake", "historical_figure": "維高斯基社會建構主義理論（Vygotsky，1978）", "historical_background": "維高斯基的社會建構主義理論指出，知識在社交互動中最有效地建構。研究顯示，向他人解釋某個知識點，是最能鞏固自身理解的方法之一。組成溫習小組互相提問，往往比獨自溫習效果更佳。", "strengths": ["在討論中能快速理解複雜概念", "能從他人角度豐富自己的答題思路", "組織溝通能力強"], "weaknesses": ["缺乏同伴時學習動力明顯下降", "容易在自修時分心或拖延"], "famous_quote": "三人行，必有我師焉。擇其善者而從之，其不善者而改之。", "study_tips": ["組織定期溫習小組，互相出題考問", "試著向同學講解自己不確定的知識點", "參與課外討論或答題班以增加互動機會"]}]'::jsonb,
  true, 5, '#4A90D9', false
),
(
  'psy-career-inclination-v2',
  'career-inclination-v2',
  '你的未來出路在哪裡？（深度版）',
  '十道問題探索你最適合的職業方向，了解自己的天賓與潛力。',
  'briefcase.fill',
  10, 5,
  '[{"id": "q1", "text": "你最享受的課外活動是：", "options": [{"label": "研究科技、編程或數學謎題", "value": 1, "dimension": "stem"}, {"label": "創作故事、繪畫或音樂", "value": 1, "dimension": "arts"}, {"label": "擔任義工或幫助有需要的人", "value": 1, "dimension": "social"}, {"label": "籌辦活動或管理班級事務", "value": 1, "dimension": "business"}, {"label": "當小老師或參與辯論比賽", "value": 1, "dimension": "education"}]}, {"id": "q2", "text": "你最常被同學或老師稱讚：", "options": [{"label": "解題快，邏輯清晰", "value": 1, "dimension": "stem"}, {"label": "有創意，想法獨特", "value": 1, "dimension": "arts"}, {"label": "細心體貼，有同理心", "value": 1, "dimension": "social"}, {"label": "做事有條理，有領導力", "value": 1, "dimension": "business"}, {"label": "能清楚解釋複雜事物", "value": 1, "dimension": "education"}]}, {"id": "q3", "text": "你最感興趣的新聞或資訊是：", "options": [{"label": "科技、AI或太空探索", "value": 1, "dimension": "stem"}, {"label": "電影、音樂或文化藝術", "value": 1, "dimension": "arts"}, {"label": "教育、社福或心理健康", "value": 1, "dimension": "social"}, {"label": "經濟、創業故事或投資", "value": 1, "dimension": "business"}, {"label": "法律改革、政策分析或社會議題", "value": 1, "dimension": "education"}]}, {"id": "q4", "text": "你最理想的工作環境是：", "options": [{"label": "實驗室、研究所或科技公司", "value": 1, "dimension": "stem"}, {"label": "工作室、劇場或創意機構", "value": 1, "dimension": "arts"}, {"label": "學校、醫院或社福機構", "value": 1, "dimension": "social"}, {"label": "企業辦公室或創業環境", "value": 1, "dimension": "business"}, {"label": "法庭、研究機構或教育部門", "value": 1, "dimension": "education"}]}, {"id": "q5", "text": "在學校你最喜歡的學科是：", "options": [{"label": "數學、物理或電腦", "value": 1, "dimension": "stem"}, {"label": "語文、藝術或音樂", "value": 1, "dimension": "arts"}, {"label": "常識、社教或宗教倫理", "value": 1, "dimension": "social"}, {"label": "經濟、企業或數學應用", "value": 1, "dimension": "business"}, {"label": "歷史、中文或通識", "value": 1, "dimension": "education"}]}, {"id": "q6", "text": "選科或填報大學志願時，你最看重：", "options": [{"label": "技術挑戰和邏輯訓練", "value": 1, "dimension": "stem"}, {"label": "創意空間和自我表達", "value": 1, "dimension": "arts"}, {"label": "對人和社會的正面影響", "value": 1, "dimension": "social"}, {"label": "就業前景和收入潛力", "value": 1, "dimension": "business"}, {"label": "思辨能力和社會責任", "value": 1, "dimension": "education"}]}, {"id": "q7", "text": "你覺得社會最需要的是：", "options": [{"label": "更先進的科技解決方案", "value": 1, "dimension": "stem"}, {"label": "更多元化的藝術文化", "value": 1, "dimension": "arts"}, {"label": "更完善的社會支援系統", "value": 1, "dimension": "social"}, {"label": "更多成功的企業家", "value": 1, "dimension": "business"}, {"label": "更公平的教育和司法制度", "value": 1, "dimension": "education"}]}, {"id": "q8", "text": "你最崇拜的人通常是：", "options": [{"label": "科學家或工程師", "value": 1, "dimension": "stem"}, {"label": "藝術家或作家", "value": 1, "dimension": "arts"}, {"label": "社工、醫生或教育家", "value": 1, "dimension": "social"}, {"label": "商業領袖或創業者", "value": 1, "dimension": "business"}, {"label": "法官、學者或政治家", "value": 1, "dimension": "education"}]}, {"id": "q9", "text": "在小組Project中，你通常：", "options": [{"label": "負責數據分析或技術部分", "value": 1, "dimension": "stem"}, {"label": "負責設計或創意呈現", "value": 1, "dimension": "arts"}, {"label": "負責協調組員關係", "value": 1, "dimension": "social"}, {"label": "負責統籌整個項目進度", "value": 1, "dimension": "business"}, {"label": "負責研究和撰寫報告", "value": 1, "dimension": "education"}]}, {"id": "q10", "text": "你對未來最大的期望是：", "options": [{"label": "以技術創新改變世界", "value": 1, "dimension": "stem"}, {"label": "以作品感動和啟發他人", "value": 1, "dimension": "arts"}, {"label": "以行動幫助弱勢群體", "value": 1, "dimension": "social"}, {"label": "以商業模式創造社會價值", "value": 1, "dimension": "business"}, {"label": "以教育或法律推動社會公義", "value": 1, "dimension": "education"}]}]'::jsonb,
  '[{"code": "stem", "title": "理工探索者", "description": "邏輯嚴謹，熱愛科技。以數據和分析思考世界，是未來科技創新的核心力量。", "emoji": "microscope", "historical_figure": "理工科路向 — STEM教育研究", "historical_background": "理工型人才在現代社會需求極高。隨著AI、生物科技和可持續能源的發展，這類人才的就業前景廣闊。香港近年積極發展創科，大學理工學系的競爭力和業界影響力持續增強，DSE成績尤其數學和科學科至關重要。", "strengths": ["邏輯思維強，分析問題有條理", "善於運用數字和數據", "具備系統性解決問題的能力"], "weaknesses": ["有時較難從感性角度思考問題", "文字表達方面可能需要多加練習"], "famous_quote": "科學的本質是疑問，而疑問是進步的起點。", "study_tips": ["DSE數學和物理成績尤為重要", "培養編程或數據分析技能", "參加STEM比賽豐富課外活動記錄"]}, {"code": "arts", "title": "創作藝術派", "description": "想像力豐富，感受細膩。以創作表達對世界的理解，讓藝術成為溝通的橋樑。", "emoji": "palette", "historical_figure": "人文藝術路向 — 創意產業研究", "historical_background": "創意產業在香港持續發展，包括設計、媒體、廣告和文化藝術。具備語文和創意能力的學生，在傳媒、廣告、文學及藝術教育等領域有廣闊發展空間。香港作為亞洲文化中心，對創意人才的需求不斷增長。", "strengths": ["想像力豐富，視角獨特", "語文表達能力強", "能感受他人情緒並以作品回應"], "weaknesses": ["有時過於沉浸創作，忽略計劃時間", "對商業化要求可能感到不適"], "famous_quote": "不落言詮，直指人心。", "study_tips": ["DSE中文和英文成績對申請相關院校尤為重要", "建立個人作品集（文學、藝術等）", "多閱讀不同類型文章，拓展語感和視野"]}, {"code": "social", "title": "助人服務型", "description": "充滿同理心，以行動關懷他人。推動社會進步是你最深層的動力。", "emoji": "heart", "historical_figure": "社會服務路向 — 香港社福人力資源報告", "historical_background": "香港有超過400個社福機構，提供多元化的社會服務。教育、社工、心理諮詢和醫護是社會型人才的主要出路。面對社會老齡化和心理健康議題的挑戰，相關專業人才需求持續增加。", "strengths": ["同理心強，善於理解他人感受", "具備聆聽和溝通技巧", "有強烈的社會責任感"], "weaknesses": ["容易受他人負面情緒影響", "有時把他人需求放在自身之前"], "famous_quote": "老吾老，以及人之老；幼吾幼，以及人之幼。", "study_tips": ["積極參與義工服務，豐富課外活動記錄", "DSE中文和英文溝通能力對申請社福和教育課程非常重要", "留意社工、護士等專業的收生要求和入學條件"]}, {"code": "business", "title": "務實謀略派", "description": "目標清晰，善於組織。以策略思維創造價值，是天生的領袖人才。", "emoji": "briefcase", "historical_figure": "商業管理路向 — 香港商業教育研究", "historical_background": "香港作為國際金融中心，商業管理、金融和法律人才的需求穩定。具備策略思維和領導能力的學生，在金融、管理顧問、市場推廣等領域有廣闊發展空間。積極融入大灣區亦為本港商科學生帶來更多機遇。", "strengths": ["目標清晰，做事有計劃", "領導力強，善於組織團隊", "實際思維，注重效益"], "weaknesses": ["有時過於強調效率，忽略人際感受", "在藝術創意方面可能較保守"], "famous_quote": "合抱之木，生於毫末；千里之行，始於足下。", "study_tips": ["關注時事和商業新聞，了解市場動態", "DSE數學和英文成績對申請商學院尤為重要", "積極參與商業比賽或模擬股票，培養實戰思維"]}, {"code": "education", "title": "教育法律型", "description": "熱愛知識，重視公義。以文字和邏輯推動社會進步，是未來的思想領袖。", "emoji": "scales", "historical_figure": "教育法律路向 — 香港人文社科研究", "historical_background": "香港的教育和法律界別在人才需求上保持穩定。教師、律師和政策研究員需要具備強大的語言能力、邏輯思辨和社會分析能力。這類人才往往擅長文字，熱愛鑽研複雜議題，並對推動社會公義有強烈使命感。", "strengths": ["文字表達能力強，邏輯嚴謹", "擅長鑽研複雜問題", "具備強烈的公民意識和使命感"], "weaknesses": ["有時過於理想化", "在純粹商業環境中可能較不適應"], "famous_quote": "有教無類，因材施教。", "study_tips": ["DSE中文和英文是申請法律和教育課程的核心科目", "多閱讀時評文章，培養批判思考能力", "參加辯論隊或模擬法庭活動，鍛鍊說理能力"]}]'::jsonb,
  true, 6, '#8B5CF6', false
);

-- ── Apple Review Account (DO NOT REMOVE) ─────────────────────
-- For App Store review only. Create this account via Supabase Auth Dashboard:
--   Email:    apple.review@dsemcq.app
--   Password: DSEMcq@Review2025
-- Then run the INSERT below to create the matching profile row.
-- NOTE: Replace <UUID_FROM_AUTH_DASHBOARD> with the actual auth user UUID.
--
-- INSERT INTO dsemcq_profiles (id, email, username, gender, dse_year, wenyuan_points, role, subscription_tier, subscription_status, created_at)
-- VALUES (
--   '<UUID_FROM_AUTH_DASHBOARD>',
--   'apple.review@dsemcq.app',
--   'AppleReviewer',
--   'other',
--   2026,
--   999,
--   'user',
--   'free',
--   'active',
--   NOW()
-- )
-- ON CONFLICT (id) DO NOTHING;

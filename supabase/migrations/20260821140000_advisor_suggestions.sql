-- Short Advisor starter prompts shown when a user enters the chat tab.

create table if not exists dsemcq_advisor_suggestions (
  id            text primary key,
  category      text not null check (category in (
    'history_analysis',
    'emotional_control',
    'exam_strategy',
    'study_method',
    'skill',
    'study_hint',
    'stress_relief'
  )),
  prompt_text   text not null,
  display_order integer not null default 0 check (display_order >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint dsemcq_advisor_suggestions_prompt_unique unique (prompt_text),
  constraint dsemcq_advisor_suggestions_prompt_length check (
    char_length(regexp_replace(prompt_text, '[^一-龥]', '', 'g')) between 10 and 20
  )
);

create or replace function set_dsemcq_advisor_suggestions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dsemcq_advisor_suggestions_updated_at on dsemcq_advisor_suggestions;
create trigger trg_dsemcq_advisor_suggestions_updated_at
before update on dsemcq_advisor_suggestions
for each row
execute function set_dsemcq_advisor_suggestions_updated_at();

create index if not exists idx_advisor_suggestions_active_order
  on dsemcq_advisor_suggestions(is_active, display_order, id);
create index if not exists idx_advisor_suggestions_category_active
  on dsemcq_advisor_suggestions(category, is_active, display_order);

alter table dsemcq_advisor_suggestions enable row level security;

revoke all on table dsemcq_advisor_suggestions from public;
grant select on table dsemcq_advisor_suggestions to anon, authenticated;
grant insert, update, delete on table dsemcq_advisor_suggestions to authenticated;

drop policy if exists "advisor_suggestions: active public read" on dsemcq_advisor_suggestions;
create policy "advisor_suggestions: active public read"
  on dsemcq_advisor_suggestions
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "advisor_suggestions: admin all" on dsemcq_advisor_suggestions;
create policy "advisor_suggestions: admin all"
  on dsemcq_advisor_suggestions
  for all
  to authenticated
  using (dsemcq_is_admin())
  with check (dsemcq_is_admin());

insert into dsemcq_advisor_suggestions (id, category, prompt_text, display_order, is_active)
values
  ('advisor-suggestion-001', 'history_analysis', '根據我的錯題分析主要弱項', 1, true),
  ('advisor-suggestion-002', 'history_analysis', '從過往成績找出進步方向', 2, true),
  ('advisor-suggestion-003', 'history_analysis', '分析我最常答錯的題型', 3, true),
  ('advisor-suggestion-004', 'history_analysis', '哪些篇章是我目前的弱項', 4, true),
  ('advisor-suggestion-005', 'history_analysis', '我的答題表現有何規律', 5, true),
  ('advisor-suggestion-006', 'history_analysis', '根據紀錄制定個人溫習計劃', 6, true),
  ('advisor-suggestion-007', 'emotional_control', '考試緊張時如何保持冷靜', 7, true),
  ('advisor-suggestion-008', 'emotional_control', '答題失手後怎樣重拾專注', 8, true),
  ('advisor-suggestion-009', 'emotional_control', '如何減少對中文科的焦慮', 9, true),
  ('advisor-suggestion-010', 'emotional_control', '面對模擬試壓力怎樣調整', 10, true),
  ('advisor-suggestion-011', 'stress_relief', '考前失眠時可以怎樣放鬆', 11, true),
  ('advisor-suggestion-012', 'emotional_control', '成績退步時如何穩定情緒', 12, true),
  ('advisor-suggestion-013', 'exam_strategy', '中文卷一應如何分配時間', 13, true),
  ('advisor-suggestion-014', 'exam_strategy', '指定篇章題應先答哪部分', 14, true),
  ('advisor-suggestion-015', 'exam_strategy', '遇到陌生文言文如何入手', 15, true),
  ('advisor-suggestion-016', 'exam_strategy', '多項選擇題有哪些排除技巧', 16, true),
  ('advisor-suggestion-017', 'exam_strategy', '長答題如何按分數組織答案', 17, true),
  ('advisor-suggestion-018', 'exam_strategy', '考試最後十分鐘應檢查甚麼', 18, true),
  ('advisor-suggestion-019', 'exam_strategy', '如何避免閱讀題常見失分', 19, true),
  ('advisor-suggestion-020', 'exam_strategy', '文言文翻譯題怎樣取分', 20, true),
  ('advisor-suggestion-021', 'study_method', '每天三十分鐘可怎樣溫習中文', 21, true),
  ('advisor-suggestion-022', 'study_method', '如何安排十二篇文言文複習次序', 22, true),
  ('advisor-suggestion-023', 'study_method', '怎樣建立有效的中文錯題簿', 23, true),
  ('advisor-suggestion-024', 'study_method', '背誦文言文有哪些有效方法', 24, true),
  ('advisor-suggestion-025', 'study_method', '如何用間隔重溫鞏固記憶', 25, true),
  ('advisor-suggestion-026', 'study_method', '一星期中文溫習計劃怎樣安排', 26, true),
  ('advisor-suggestion-027', 'study_method', '如何平衡閱讀寫作和文言訓練', 27, true),
  ('advisor-suggestion-028', 'skill', '怎樣提升概括文章主旨能力', 28, true),
  ('advisor-suggestion-029', 'skill', '如何準確分析人物形象', 29, true),
  ('advisor-suggestion-030', 'skill', '修辭手法題應怎樣作答', 30, true),
  ('advisor-suggestion-031', 'skill', '如何找出段落之間的關係', 31, true),
  ('advisor-suggestion-032', 'skill', '怎樣分辨論證方法和作用', 32, true),
  ('advisor-suggestion-033', 'skill', '文言實詞詞義如何準確推斷', 33, true),
  ('advisor-suggestion-034', 'skill', '如何改善比較題的答題結構', 34, true),
  ('advisor-suggestion-035', 'skill', '怎樣引用文本作有效論證', 35, true),
  ('advisor-suggestion-036', 'study_hint', '溫習指定篇章應先掌握甚麼', 36, true),
  ('advisor-suggestion-037', 'study_hint', '如何把課堂筆記整理得更實用', 37, true),
  ('advisor-suggestion-038', 'study_hint', '做閱讀理解前應先看哪些內容', 38, true),
  ('advisor-suggestion-039', 'study_hint', '哪些方法能提高中文閱讀速度', 39, true),
  ('advisor-suggestion-040', 'study_hint', '如何利用零碎時間溫習字詞', 40, true),
  ('advisor-suggestion-041', 'study_hint', '怎樣檢查答案是否切合題意', 41, true),
  ('advisor-suggestion-042', 'study_hint', '如何記住常見文言虛詞用法', 42, true),
  ('advisor-suggestion-043', 'stress_relief', '溫習感到疲倦時應怎樣休息', 43, true),
  ('advisor-suggestion-044', 'stress_relief', '考前一星期如何減輕壓力', 44, true),
  ('advisor-suggestion-045', 'stress_relief', '做題卡住時如何快速放鬆', 45, true),
  ('advisor-suggestion-046', 'stress_relief', '如何建立不過度催迫自己的節奏', 46, true),
  ('advisor-suggestion-047', 'stress_relief', '模擬試前可以做哪些呼吸練習', 47, true),
  ('advisor-suggestion-048', 'emotional_control', '中文科失去信心時怎樣調整', 48, true),
  ('advisor-suggestion-049', 'stress_relief', '如何在休息後快速重回狀態', 49, true),
  ('advisor-suggestion-050', 'stress_relief', '溫習壓力太大時應先做甚麼', 50, true)
on conflict (id) do update set
  category = excluded.category,
  prompt_text = excluded.prompt_text,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

notify pgrst, 'reload schema';

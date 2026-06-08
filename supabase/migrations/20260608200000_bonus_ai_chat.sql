-- ============================================================
-- Bonus AI Chat Quota — per-profile permanent bonus
-- ============================================================

-- Add bonus_ai_chat column to profiles (permanent, not monthly-reset)
alter table dsemcq_profiles
  add column if not exists bonus_ai_chat int not null default 0
  check (bonus_ai_chat >= 0);

-- Add admin-configurable settings for bonus system
insert into dsemcq_app_settings (key, value) values
  ('bonus_ai_chat_cost', '100'),
  ('bonus_ai_chat_max', '20')
on conflict (key) do nothing;

-- bonus_ai_chat_cost = Wenyuan points per 1 extra monthly AI chat
-- bonus_ai_chat_max  = Maximum bonus chats any user can accumulate

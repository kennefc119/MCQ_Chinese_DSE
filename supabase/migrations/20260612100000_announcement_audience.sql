-- ============================================================
-- Add audience targeting to dsemcq_announcements
--
-- audience:
--   'all'     — sent to every registered user (original behaviour)
--   'free'    — sent only to users with subscription_tier = 'free'
--   'premium' — sent only to users with subscription_tier = 'premium'
-- ============================================================

alter table dsemcq_announcements
  add column if not exists audience text not null default 'all'
    check (audience in ('all', 'free', 'premium'));

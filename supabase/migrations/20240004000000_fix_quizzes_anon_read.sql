-- Allow anyone (including unauthenticated / anon) to read published quizzes.
-- Published quizzes are public catalog content — no need to be signed in to browse.
-- This fixes the timing issue where the Supabase client hasn't restored its JWT
-- session yet when ExploreScreen fires its initial load on mount.

drop policy if exists "quizzes: auth read published" on dsemcq_quizzes;

create policy "quizzes: public read published" on dsemcq_quizzes for select
  using (is_published = true);

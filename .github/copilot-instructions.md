# Workspace Instructions

## Task Routing

- Read `.github/repo_structure/repo-map.md` when repository context would help locate the correct subsystem or files. Use it to avoid broad or recursive exploration.
- Start from the smallest relevant entry point and inspect only direct dependencies needed for the task.
- On every run that changes repository files, evaluate whether `.easignore` still matches the files required by the shipped Expo app and excludes local-only or admin resources. Update it when app-boundary changes require it; leave it unchanged for backend-only, authoring-only, test-only, log, or other local changes.
- For Expo/React Native app changes, treat Supabase as the sole runtime source of content and user data through Supabase tables or app-facing Supabase Edge Functions. Do not use local reference/resource files, `src/data/` seed/demo data, or paths excluded by `.easignore` as app runtime data; those remain for local tooling only.
- Keep `.github/repo_structure/repo-map.md` synchronized in the same change whenever files, folders, entry points, runtimes, or subsystem boundaries are added, removed, renamed, or structurally changed.

## Repository Boundaries

- The Expo/React Native app is rooted at `index.ts`, `App.tsx`, and `src/`.
- Everything under `backend/` is local admin, authoring, testing, or maintenance tooling. It is not part of the shipped mobile app and must not be treated as an app runtime dependency.
- `input_knowledge/school_ws/`, `input_knowledge/dse source/`, and `input_knowledge/non-detinated_passages/` are changeable local Chinese-language reference corpora. Use only the relevant files as knowledge sources during local development; they are not app runtime assets.
- `README.md` is a human-maintained command reference. Do not edit it unless the user explicitly approves and the task genuinely requires the change.

## Live Supabase Safety

- Supabase is the live production database and Edge Function platform. Treat all connected data and deployed resources as production.
- Repository code and migration files may be inspected or prepared normally, but obtain explicit user approval immediately before executing any command that changes live Supabase data, schema, functions, configuration, or deployment.
- Never delete, truncate, reset, or destructively replace live database data. Do not run destructive SQL, `supabase db reset`, or equivalent operations against the live project.
- Prefer additive, backward-compatible changes; inspect affected migrations, constraints, and RLS policies before proposing Supabase changes.
- Never expose secrets or read `.env` values unless strictly required and explicitly authorized.

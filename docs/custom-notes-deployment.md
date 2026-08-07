# Deploying AI度身訂造筆記

## 1. Apply the database migration

Apply [20260724090000_custom_notes_workflow.sql](../supabase/migrations/20260724090000_custom_notes_workflow.sql) through the project's Supabase migration process. It creates workflow tables, enables RLS, and exposes `get_custom_note_eligibility(p_passage_id)` to authenticated users.

The function counts distinct answered questions from submitted attempts whose question `passage_id` matches the selected passage. It requires an active Premium subscription and at least 51 questions.

## 2. Configure Poe

Create the eight Poe bots listed in [custom-notes-poe-prompts.md](custom-notes-poe-prompts.md). Paste each role's system prompt into its corresponding Poe bot.

Set these Supabase Edge Function secrets:

```text
POE_API_KEY
DSE_NOTES_WORKER_SECRET
DSE_NOTES_BOT_WEAKNESS
DSE_NOTES_BOT_STRENGTH
DSE_NOTES_BOT_TREND
DSE_NOTES_BOT_GENERATOR
DSE_NOTES_BOT_FACT_CHECKER
DSE_NOTES_BOT_PEDAGOGY
DSE_NOTES_BOT_OPTIMIZER
DSE_NOTES_BOT_FORMATTER
```

Use a long random value for `DSE_NOTES_WORKER_SECRET`. It protects worker-only invocation; never expose it to the Expo app.

## 3. Deploy Edge Functions

Deploy both functions:

```text
dsemcq-custom-notes
dsemcq-custom-notes-worker
```

The API function authenticates the student, rechecks eligibility, snapshots the server-owned answer history, and creates a job. The worker advances one durable stage at a time and triggers its next invocation after it checkpoints. It has eight role-specific Poe bot secrets.

## 4. Source corpus before production

The current worker contract expects a verified 2023-2025 trend and official reference corpus to be injected into its Agent 3 and Agent 5 payloads. Do not publish a production fact-check workflow until these sources have been curated, versioned, and wired into the worker. The supplied app source data covers the 2023-2025 launch window; no 2026 claim should be generated.

## 5. Release checks

1. Verify a free or inactive Premium user receives `PREMIUM_REQUIRED`.
2. Verify a Premium user with 50 distinct answered questions is rejected and 51 is accepted.
3. Verify repeat attempts do not increase the eligibility count.
4. Test a first-round pass, a revision pass, and a three-round unverified publication using test Poe bots.
5. Verify users cannot read another user's jobs, agent runs, or notes.
6. Test the AI筆記 tab on iPhone and iPad layouts, including unverified warning display.
7. Run `npx tsc --noEmit`; resolve existing unrelated project errors separately if they still block your release pipeline.
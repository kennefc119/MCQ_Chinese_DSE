# Advisor V2 Deployment Checklist

## Current state

The isolated V2 schema and V2 Edge Functions are deployed. Advisor V2 remains
inactive in Expo unless the local `EXPO_PUBLIC_ADVISOR_V2_DEV=true` flag is set
and the student opts in through `分析資料設定`.

## Migration history warning

The V2 schema was applied directly to the linked database because the remote
migration history is behind this repository. Do **not** run `supabase db push`
against this project until its historical migration state is deliberately
reconciled; it could replay unrelated old migrations. The V2 tables and V2 Edge
Functions are already deployed independently.

## !!! Live-impact sequence

1. Apply `20260808000000_advisor_v2_additive_schema.sql` to staging first.
2. Compare staging schema before and after. Verify existing tables, existing
   columns, existing RPC signatures, and existing RLS policies are unchanged.
3. Create the Poe bots from the prompt files in this folder.
4. Set staging secrets directly in Supabase:
   - `POE_API_KEY`
   - `DSE_ADVISOR_V2_WORKER_SECRET`
   - `DSE_ADVISOR_BOT_ORCHESTRATOR`
   - `DSE_ADVISOR_BOT_PROFILE`
   - `DSE_ADVISOR_BOT_PERFORMANCE`
   - `DSE_ADVISOR_BOT_QUESTION_BANK`
   - `DSE_ADVISOR_BOT_SYNTHESIZER`
   - `DSE_ADVISOR_BOT_REVIEWER`
5. Deploy only `dsemcq-advisor-v2-start` and `dsemcq-advisor-v2-worker`.
   Do not redeploy or modify `dsemcq-advisor-chat` for the V2 rollout.
6. Set the V2-only Edge Function secrets before testing:
   - `DSE_ADVISOR_V2_WORKER_SECRET`
   - `DSE_ADVISOR_BOT_ORCHESTRATOR`
   - `DSE_ADVISOR_BOT_PROFILE`
   - `DSE_ADVISOR_BOT_PERFORMANCE`
   - `DSE_ADVISOR_BOT_QUESTION_BANK`
   - `DSE_ADVISOR_BOT_SYNTHESIZER`
7. Set `EXPO_PUBLIC_ADVISOR_V2_DEV=true` only in the local Expo environment.
   In Expo dev, enable V2 in `分析資料設定` for the test account. V2 writes only
   to its own tables and functions.

Use the bot names and matching prompt files in `README.md` when creating the
six Poe bots. The existing `POE_API_KEY` is reused; only the six V2 bot-name
secrets are new.
8. Test pending, completed, failed, app resume, source-toggle, and quota flows.
9. Expand the pilot only after the tests pass.

## Rollback

Remove `EXPO_PUBLIC_ADVISOR_V2_DEV=true` and restart Expo. New turns return to
the existing V1 advisor flow. Do not delete V2 tables or change the existing
advisor schema as part of rollback.

## Do not share

Do not place Poe keys, service-role keys, worker secrets, or user passwords in
Git, prompt files, mobile app configuration, or chat messages.
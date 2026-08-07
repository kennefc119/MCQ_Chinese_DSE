# Advisor Agentic V2

These Markdown files are manual deployment artifacts. Copy each agent file into
the matching Poe bot's system prompt. The Edge Functions do not load or send
these files at runtime.

## Active roles

| Role | Secret | Prompt file |
| --- | --- | --- |
| Orchestrator | `DSE_ADVISOR_BOT_ORCHESTRATOR` | `00_orchestrator_mindmap.md` |
| Profile | `DSE_ADVISOR_BOT_PROFILE` | `02_student_profile_agent.md` |
| Performance | `DSE_ADVISOR_BOT_PERFORMANCE` | `03_performance_analyst.md` |
| Question bank | `DSE_ADVISOR_BOT_QUESTION_BANK` | `04_question_bank_researcher.md` |
| Tutor | `DSE_ADVISOR_BOT_SYNTHESIZER` | `07_tutor_synthesizer.md` |
| Reviewer | `DSE_ADVISOR_BOT_REVIEWER` | `08_grounding_reviewer.md` |

All V2 calls contain exactly one JSON `user` message. Do not send a runtime
system message. Do not add Poe API keys to this folder.

## Suggested Poe bot names

Create these bots in Poe using the same Poe API account/key as the current
advisor. Paste the matching Markdown file into each bot's system prompt, then
provide the resulting bot handle for the matching Supabase secret.

| Suggested Poe bot name | Prompt file |
| --- | --- |
| `DSEAdvisorV2Orchestrator` | `00_orchestrator_mindmap.md` |
| `DSEAdvisorV2Profile` | `02_student_profile_agent.md` |
| `DSEAdvisorV2Performance` | `03_performance_analyst.md` |
| `DSEAdvisorV2QuestionBank` | `04_question_bank_researcher.md` |
| `DSEAdvisorV2Tutor` | `07_tutor_synthesizer.md` |
| `DSEAdvisorV2Reviewer` | `08_grounding_reviewer.md` |

Past-paper and marking-scheme agents remain disabled until their authoritative
Supabase datasets and contracts are supplied. V2 starts with an empty V2 chat
history and does not import V1 advisor conversations or maintain a question
mirror.

## Local Expo V2 testing

Set `EXPO_PUBLIC_ADVISOR_V2_DEV=true` only in your local development
environment before starting Expo. This exposes the V2 analysis panel and sends
only opted-in test messages to the separate V2 Edge Functions and tables.
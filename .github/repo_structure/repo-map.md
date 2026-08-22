# MCQ_Chinese_DSE: LLM Routing Map

> Purpose: route an LLM to the smallest relevant part of this repository.
> Reviewed: 2026-08-22
> Authority: this is an index, not a source of implementation truth. Verify the named entry point before editing.

## Read-First Rules

1. Classify the request as mobile, Supabase/DB, local Python, or content/prompt work.
2. Open the named entry point below and only its direct dependencies first.
3. Do not recursively inspect unrelated content, logs, generated files, secrets, or the full question corpus.
4. If a change crosses mobile, Supabase, and local Python boundaries, inspect each boundary explicitly before editing.
5. Verify current code before relying on a summary in this map.

## Architecture At A Glance

```text
Expo React Native mobile client (root TypeScript)
  -> Supabase client / Edge Functions / RevenueCat
  -> Supabase database and storage

Local Python authoring and admin tools (backend/)
  -> Supabase database
  -> Poe/LLM workflows where configured
  -> local dashboards, logs, and reviewer SQLite state

Reference and prompt corpus
  -> input_knowledge/dse source/                 DSE past-exam JSON and designated-passage source
  -> input_knowledge/school_ws/                   designated-passage worksheets and question criteria
  -> input_knowledge/non-detinated_passages/      unseen-passage source material
  -> advisor_agentic/        advisor role prompts, contracts, and retrieval helpers
```

## Mobile Runtime

- Stack: Expo 54, React Native 0.81, React 19, TypeScript 5.9, React Navigation.
- Bootstrap: `index.ts` -> `App.tsx` -> `src/navigation/RootNavigator.tsx`.
- Navigation: auth/app stacks -> `MainLayout.tsx` -> `MainTabs.tsx`; route contracts are in `src/navigation/types.ts`.
- Runtime integrations live in `src/lib/`; `src/services/` is empty.
- DB/domain types live in `src/types/database.ts`; `src/data/` is seed/demo data.
- Expo/native config: `app.config.ts`, `app.json`, `eas.json`.

### Mobile request routing

| Request | Start here | Then inspect |
|---|---|---|
| Startup, navigation, auth gate | `App.tsx` -> `src/navigation/RootNavigator.tsx` | `src/context/AuthContext.tsx`, then the relevant file under `src/navigation/` |
| Login, session, profile, guest/demo | `src/context/AuthContext.tsx` | `src/lib/supabase.ts`, database types, relevant auth screens |
| Navigation or route parameters | `src/navigation/types.ts` | Relevant navigator under `src/navigation/` |
| Quiz behavior or scoring UI | `src/screens/QuizDetailScreen.tsx` or `src/screens/QuizRunnerScreen.tsx` | `src/screens/QuizResultScreen.tsx`, relevant `src/lib/` helper, `src/types/database.ts`, relevant migration |
| Advisor chat | `src/screens/AdvisorChatScreen.tsx` | V1 or V2 Edge Function path selected by that screen; do not inspect both unless the task crosses versions |
| Custom notes | `src/screens/CustomNotesScreen.tsx` | `src/screens/CustomNoteDetailScreen.tsx`, `src/lib/customNotesService.ts`, custom-notes request/worker functions |
| Subscription or entitlement | `src/screens/SubscriptionScreen.tsx` | `src/lib/revenueCat.ts`, `supabase/functions/dsemcq-revenuecat-webhook/`, profile schema |
| Push notifications or inbox | `src/lib/pushNotifications.ts` | `src/screens/InboxScreen.tsx`, messaging/announcement Edge Functions |
| Admin screen | `src/screens/admin/` and `src/screens/AdminHubScreen.tsx` | `src/lib/adminService.ts`, matching backend service, database RLS/migrations |
| Legal or school-partner content | `src/content/` and relevant screen | `backend/content-editor/server.py` if editing through the local content tool |

## Supabase Runtime And Data

- Edge Functions: `supabase/functions/<name>/index.ts`; shared code: `supabase/functions/_shared/`.
- Advisor V1: app-facing `dsemcq-advisor-chat`; its lifecycle/messages remain separate from V2.
- Advisor V2: app-facing `dsemcq-advisor-v2-start` -> internal `dsemcq-advisor-v2-worker`. `dsemcq-advisor-v2-context` is shared/test retrieval.
- Custom notes: app-facing `dsemcq-custom-notes` -> internal `dsemcq-custom-notes-worker`.
- Other boundaries: `dsemcq-mcq-proxy`, `dsemcq-revenuecat-webhook`, `dsemcq-send-direct-message`, `dsemcq-broadcast-announcement`.
- `supabase/migrations/` is authoritative for schema, SQL functions, constraints, and RLS; `seed.sql` and `reset_dev.sql` are local setup.
- Workers are not mobile endpoints. Never merge or casually share V1/V2 advisor state.

## Local Python Services

All local services are independent dashboards/APIs. Despite its name, `backend/start_all.bat` launches only Prompt Editor, MCQ Generator, Tip Card Admin, and DSE Past Exam Admin.

| Service | Entry point | Runtime |
|---|---|---|
| Advisor V2 tester | `backend/advisor-v2-tester/server.py` | Flask |
| Content Editor | `backend/content-editor/server.py` | Flask :5001 |
| Prompt Editor | `backend/prompt-editor/server.py` | Flask :5002 |
| MCQ Generator | `backend/mcq_generator/mcq_gen/server.py` | FastAPI :8765 |
| Psychology Tests | `backend/psy_tests/server.py` | FastAPI :8766 |
| Tip Cards | `backend/tip_cards/server.py` | FastAPI :8767 |
| Unseen Passages | `backend/nd_passages/server.py` | FastAPI :8767 (port conflict) |
| Past Exam Admin | `backend/dse_past_exam_admin/server.py` | FastAPI :8768 |
| Quality Reviewer | `backend/mcq_quality_reviewer/server.py` | FastAPI :8768 (port conflict) |

The reviewer reuses the generator package through `backend/mcq_quality_reviewer/requirements.txt` (`-e ../mcq_generator`). Do not assume the two port-conflicting services can run together without overriding a port.

### MCQ generation routing

For a generation or prompt change, use this narrow path:

1. `backend/mcq_generator/mcq_gen/server.py` or `backend/mcq_generator/mcq_gen/cli.py` for the invocation.
2. `backend/mcq_generator/mcq_gen/graph.py` for the strategist -> drafter -> critic workflow and revision routing.
3. `backend/mcq_generator/mcq_gen/agents/` for agent-specific behavior.
4. `backend/mcq_generator/mcq_gen/prompts/` for prompt templates and injection configuration.
5. `backend/mcq_generator/mcq_gen/db/` and `backend/mcq_generator/mcq_gen/schemas.py` for persistence and contracts.
6. `backend/mcq_generator/MCQ_GENERATION_GUIDELINES.md` and `input_knowledge/school_ws/mc_question_criteria.md` only when content rules are involved.
7. `supabase/migrations/` when database shape, RLS, or write behavior is involved.

Do not read every generated question, audit report, or past-exam file for a code change unless the task specifically concerns corpus quality or duplication.

### MCQ review routing

Start at `backend/mcq_quality_reviewer/server.py`, then follow `backend/mcq_quality_reviewer/workflow.py`, `backend/mcq_quality_reviewer/local_audit.py`, `backend/mcq_quality_reviewer/supabase_repository.py`, and the reviewer LLM modules. The reviewer has two persistence layers: Supabase for questions and local SQLite for audit workflow state.

## Content And Reference Corpus

| Location | Meaning | Read by default? |
|---|---|---|
| `input_knowledge/dse source/2015_DSE_exam_question.json` through `input_knowledge/dse source/2025_DSE_exam_question.json` | Past-exam question data. | Only for exam-data or question-content tasks. |
| `input_knowledge/dse source/文言文指定篇章.md` | Designated-passage source/reference. | Only for designated-passage tasks. |
| `input_knowledge/school_ws/*.md` | School worksheets, passage notes, and MCQ criteria. | Only for the relevant passage or content rule. |
| `input_knowledge/non-detinated_passages/nd_passages.md` | Unseen/non-designated passage corpus. | Only for unseen-passage tasks. |
| `advisor_agentic/*.md` | Advisor roles, orchestration, contracts, deployment notes. | Only for advisor tasks. |
| `docs/custom-notes-prompts/` | Custom-note analysis and formatting prompts. | Only for custom-note tasks. |
| `backend/*/templates/` and `dashboard.html` | Local admin UI assets. | Only for the corresponding local service. |

## Repository Guidance

- Workspace instructions: `.github/copilot-instructions.md`.
- Instruction guardian: `.github/agents/copilot-instructions-guardian.agent.md`; use it when workspace instructions are proposed or need conflict review.
- Map maintainer: `.github/agents/repo-map-maintainer.agent.md`; use it after structural changes to audit the current tree and synchronize this map.

## Maintenance

Update this map when a top-level subsystem, runtime entry point, database boundary, or service launch command changes. Keep it compact and update routing rules rather than copying implementation details from source files. Do not add a duplicate always-read JSON graph: it increases context cost and can drift independently. Add a generated graph only if tooling will query it on demand.

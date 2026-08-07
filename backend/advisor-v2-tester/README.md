# Advisor V2 Tester

Local-only prompt editor and workflow tracer for the Advisor V2 agents. It is
an offline development tool under `backend/`; it is not used by the Expo app
or an EAS build.

## Run

```powershell
cd backend/advisor-v2-tester
python -m pip install -r requirements.txt
python server.py
```

Open `http://localhost:5006`.

Start in **Fixture** mode first. It executes the full data flow without
contacting Poe and shows the exact JSON passed between the orchestrator,
specialists, and synthesizer.

## Live Supabase context + Poe mode

Copy `.env.example` to `.env` and supply:

- Supabase context credentials:
	- `SUPABASE_URL`
	- `SUPABASE_SERVICE_KEY`
	- `DSE_ADVISOR_V2_WORKER_SECRET`
- Poe credentials:
	- `POE_API_KEY`
	- `DSE_ADVISOR_BOT_ORCHESTRATOR`
	- `DSE_ADVISOR_BOT_PROFILE`
	- `DSE_ADVISOR_BOT_PERFORMANCE`
	- `DSE_ADVISOR_BOT_QUESTION_BANK`
	- `DSE_ADVISOR_BOT_SYNTHESIZER`

The tester reads this file only on the local machine. Never commit the
filled-in `.env` file.

`SUPABASE_SERVICE_ROLE_KEY` is still accepted as a legacy fallback, but
`SUPABASE_SERVICE_KEY` is preferred.

For production-parity runs, choose:

- `資料來源模式 = Supabase Live Context`
- `執行模式 = Live Poe`

In this mode the tester calls `dsemcq-advisor-v2-context`, which uses the same
shared retrieval logic as `dsemcq-advisor-v2-worker`. That ensures student
profile, psych results, and performance statistics come from one query path.

Then the tester sends live Poe requests and records exact request payload,
raw response, parsed JSON, validation result, and duration.

Deploy requirements:

```powershell
supabase functions deploy dsemcq-advisor-v2-worker
supabase functions deploy dsemcq-advisor-v2-context
```

## Prompt source of truth

The editor reads and writes these canonical files directly:

- `advisor_agentic/00_orchestrator_mindmap.md`
- `advisor_agentic/02_student_profile_agent.md`
- `advisor_agentic/03_performance_analyst.md`
- `advisor_agentic/04_question_bank_researcher.md`
- `advisor_agentic/07_tutor_synthesizer.md`

Every completed run is saved locally in `logs/` with prompt hashes and the
full request/response trace.
# MCQ Quality Reviewer

Standalone local workflow for auditing every existing MC question once. It reuses the MCQ generator's Critic and Corrector agents while keeping all audit state outside Supabase.

## Behavior

1. Loads the next Supabase question without a local audit record.
2. Runs the existing Critic against the original question.
3. Records a passing question locally without changing Supabase.
4. For a failing question, runs the existing Corrector and Critic revision loop.
5. Stores the proposed correction locally for explicit approval.
6. Updates Supabase only after **Confirm and push** is selected for that row.

Each audit run is stored in `data/audit.sqlite3`. The normal queue blocks questions whose latest run passed or was pushed, while failed runs are eligible to return to the un-audited queue. Back up or export this local record before moving the workflow to another computer.

The dashboard also stores reviewer-specific Critic bot, Corrector bot, and revision-round settings in `data/settings.json`. These overrides do not modify `backend/mcq_generator/.env`.

Every row has a **重新審核** action. It reads the question's current content from Supabase, preserves the old local run, and creates a new numbered audit run. `已審核` counts only latest runs that passed directly or were corrected and pushed.

Pending correction proposals can be edited manually before pushing. The editor shows the original and amended option explanations, and allows editing the stem, four option texts, and four explanations. Correct-answer flags remain from the LLM proposal. The server stores the edited proposal locally and the existing stale-snapshot check still runs at push time.

Each reviewer Critic call now queries all live active Supabase question stems narrowed by passage and skill, excludes the question currently being audited, and injects the exhaustive candidate set for concept/target-idea duplication checking. The query runs again for later Critic calls, so a previously pushed modification can become a candidate in a later audit. Parallel calls observe the database state available when each call begins.

Structured LLM calls automatically retry malformed JSON up to **3 times** after the initial response. Every attempt is retained in the question's local trace record, including the exact input prompt, raw output response, JSON attempt number, parse status, and parse error.

Use **批量並行審核** to choose how many un-audited questions to process and how many parallel workers to use. The batch is capped at 1,000 questions and 100 workers. Questions are claimed and submitted incrementally, so the first LLM workers can start before the full batch has been claimed. Local claims prevent the same question from being selected twice.

The dashboard inventory is loaded through `/api/questions/page` in 40-question chunks. Its table keeps at most 80 question rows in the DOM, replaces older rows with measured spacer height while scrolling downward, and can reload the preceding chunk when scrolling back upward. The `已審核（通過／已推送）` filter combines direct Critic passes with corrections already pushed to Supabase.

Batch auditing is non-blocking: `POST /api/scan-batch` returns a job ID immediately, and the dashboard polls `GET /api/scan-batch/{job_id}?since=...` for completed results. Each result is persisted and rendered as soon as its worker finishes; manual edit, reject, and approve actions remain available for completed rows while other workers continue.

Batch progress reports requested, submitted, completed, LLM-failed, and skipped-claim counts separately. Supabase header/question reads retry up to four times with fresh query builders. If one candidate still cannot be read, it is recorded as a skipped claim and the producer continues to later candidates until it reaches the requested successful claim count or the database is exhausted.

Outbound Poe calls are globally paced across all audit workers, including transport and malformed-JSON retries. The default is a 0.4-second minimum gap between request starts and at most 8 simultaneous Poe requests; this reduces burst-related `Server disconnected` failures while preserving local audit parallelism. Tune `MCQ_REVIEWER_REQUEST_DELAY_SECONDS` and `MCQ_REVIEWER_MAX_CONCURRENT_REQUESTS` in the reviewer process environment when the Poe account has different capacity.

Pending proposals can be selected with row checkboxes or **選取目前頁待推送**. **批量確認並推送** and **批量拒絕** send the selected audit IDs in one request. Selection survives virtual scrolling; the server validates each row independently and reports successful and failed rows separately. A stale or invalid row does not cancel the other selected pushes.

When the `待確認` filter is active, the score quick selector can select every pending proposal with `評分 >= 7`, `>= 8`, `>= 9`, or `>= 10` across the entire local audit set, not just the visible table page. Bulk decisions send this criterion to the server, which resolves and revalidates the matching rows at execution time.

**清除本機審核紀錄** deletes all local audit rows, proposals, traces, statuses, and history after confirmation. It does not modify Supabase or reviewer settings and is blocked while a batch is running, so the full question set can be audited from a fresh local state afterward.

## Supabase impact

No migration, table, or column is required. Approval can update only:

- `dsemcq_questions.stem`
- `dsemcq_questions.critique_score`
- Rows belonging to the question in `dsemcq_question_options`

The workflow preserves activation state, admin flags, user complaints, tags, and quiz relationships. It verifies that question content still matches the audited snapshot before approval. Because no database RPC is added, option replacement is not fully transactional; the service attempts to restore the original snapshot if a write fails.

## Setup

The service reads Poe and Supabase credentials from `backend/mcq_generator/.env`.

```powershell
Set-Location backend/mcq_quality_reviewer
python -m pip install -r requirements.txt
```

Then run `start.bat` and open <http://127.0.0.1:8768>.

## Local files

- `data/audit.sqlite3`: durable scan, proposal, approval, push, trace, and error records
- `dashboard.html`: local review and approval table
- `server.py`: FastAPI routes
- `workflow.py`: Critic and Corrector orchestration
- `reviewer_llm.py`: reviewer-only Poe client, JSON retry, and trace capture
- `reviewer_critic.py`: reviewer-only Critic call using the existing prompt builder
- `live_duplicates.py`: live Supabase duplicate-candidate query
- `supabase_repository.py`: read and approval-only write operations
- `local_audit.py`: SQLite ledger

## Recovery

- A failed audit remains recorded for diagnostics but returns to the normal un-audited queue.
- A rejected proposal never changes Supabase.
- A stale proposal is blocked if the live question changed after its audit.
- Use **Export records** in the dashboard to download a JSON backup.
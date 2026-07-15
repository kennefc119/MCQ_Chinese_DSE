# 非指定篇章 Admin Workflow

Standalone backend workflow for generating, reviewing, editing, and inserting 非指定篇章 drafts into the Supabase table `dsemcq_nd_passages`.

## Current scope

- Prompt-driven batch generation via Poe bot `ChiPassageResearch`
- Preview and edit drafts in a local HTML dashboard
- Confirm-before-insert flow into Supabase
- Dedicated Supabase table separate from `dsemcq_passages`

## Files

- `server.py` — FastAPI service and generation/insert routes
- `dashboard.html` — local admin UI
- `config.py` — settings loaded from `backend/mcq_generator/.env`
- `start.bat` — local Windows launcher

## Endpoints

- `GET /` — dashboard
- `GET /api/health` — connectivity check
- `GET /api/list-passages` — existing non-designated passages
- `POST /api/generate` — generate preview drafts only
- `POST /api/confirm-insert` — validate and insert reviewed drafts

## Run locally

1. Ensure `backend/mcq_generator/.env` contains:
   - `POE_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
2. Apply the Supabase migration for `dsemcq_nd_passages`.
3. Install dependencies from `requirements.txt`.
4. Run `start.bat`.

## Notes

- The service accepts either structured JSON output or the markdown passage block format.
- The dashboard is currently optimized for field-by-field review before insertion.
- Duplicate `slug` and `code` values are rejected on insert.
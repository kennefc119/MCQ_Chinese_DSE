# DSE Past Exam Admin Uploader

Local admin dashboard for uploading yearly DSE past-exam JSON files and upserting question rows into one unified Supabase table.

## What it does

- Accepts one or multiple JSON files in the same format as files in `source/`.
- Flattens data to **one row per question**.
- Upserts rows into `dsemcq_dse_past_exam_questions`.
- Supports future files (for example `2026_DSE_exam_question.json`) without schema changes.
- Keeps normalized query columns and raw JSON snapshots per row.

## Folder files

- `server.py` - FastAPI API for health, preview, and import.
- `dashboard.html` - local upload UI.
- `config.py` - reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `backend/mcq_generator/.env`.
- `start.bat` - Windows launcher.

## API endpoints

- `GET /` - dashboard UI.
- `GET /api/health` - Supabase connectivity check.
- `POST /api/preview` - validate/mapping preview (no writes).
- `POST /api/import` - flatten and upsert rows.
- `POST /api/preview-batch` - validate and preview multiple files (no writes).
- `POST /api/import-batch` - flatten and upsert multiple files in one request.

## Run locally

1. Apply migration `supabase/migrations/20260809000000_dse_past_exam_questions.sql`.
2. Ensure `backend/mcq_generator/.env` has:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
3. Start with:
   - `start.bat`
4. Open `http://localhost:8768`.

## Notes

- Upsert conflict key: `(exam_year, section_type, passage_bucket, question_number, source_file)`.
- Re-importing the same file is idempotent.
- Preview first to inspect row counts and anomalies before import.
- For multiple files, the dashboard uses batch endpoints automatically.

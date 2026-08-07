import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "eligibility" | "create" | "list" | "detail" | "status";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Unauthorised" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const callerSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  const userId = userData.user?.id;
  if (authError || !userId) return json({ error: "Unauthorised" }, 401);

  let body: { action?: Action; passageId?: string; request?: string; jobId?: string; noteId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action;
  if (!action) return json({ error: "action is required" }, 400);

  if (action === "eligibility") {
    if (!body.passageId) return json({ error: "passageId is required" }, 400);
    return eligibilityResponse(callerSupabase, body.passageId);
  }

  if (action === "create") {
    return createJob(supabase, callerSupabase, userId, body.passageId, body.request);
  }

  if (action === "list") {
    const { data, error } = await supabase
      .from("dsemcq_custom_notes")
      .select("id, passage_id, title, verification_status, fact_check_score, pedagogy_score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return json({ error: "Could not load notes" }, 500);
    return json({ notes: data ?? [] });
  }

  if (action === "detail") {
    if (!body.noteId) return json({ error: "noteId is required" }, 400);
    const { data, error } = await supabase
      .from("dsemcq_custom_notes")
      .select("*")
      .eq("id", body.noteId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return json({ error: "Could not load note" }, 500);
    if (!data) return json({ error: "Note not found" }, 404);
    return json({ note: data });
  }

  if (action === "status") {
    if (!body.jobId) return json({ error: "jobId is required" }, 400);
    const { data, error } = await supabase
      .from("dsemcq_custom_note_jobs")
      .select("id, passage_id, status, current_stage, review_round, error_code, error_message, completed_at")
      .eq("id", body.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return json({ error: "Could not load job" }, 500);
    if (!data) return json({ error: "Job not found" }, 404);
    return json({ job: data });
  }

  return json({ error: "Unknown action" }, 400);
});

async function eligibilityResponse(supabase: ReturnType<typeof createClient>, passageId: string) {
  const { data, error } = await supabase.rpc("get_custom_note_eligibility", { p_passage_id: passageId });
  if (error) return json({ error: "Could not check eligibility" }, 500);
  return json({ eligibility: data });
}

async function createJob(
  supabase: ReturnType<typeof createClient>,
  callerSupabase: ReturnType<typeof createClient>,
  userId: string,
  passageId?: string,
  studentRequest?: string,
) {
  const normalizedRequest = (studentRequest ?? "").trim();
  if (!passageId) return json({ error: "passageId is required" }, 400);
  if (normalizedRequest.length > 1_000) return json({ error: "request is too long" }, 400);

  const { data: eligibility, error: eligibilityError } = await callerSupabase.rpc(
    "get_custom_note_eligibility",
    { p_passage_id: passageId },
  );
  if (eligibilityError) return json({ error: "Could not check eligibility" }, 500);
  if (!eligibility?.eligible) {
    return json({ error: "Not eligible", code: eligibility?.reason ?? "NOT_ELIGIBLE", eligibility }, 403);
  }

  const { data: existing } = await supabase
    .from("dsemcq_custom_note_jobs")
    .select("id, status")
    .eq("user_id", userId)
    .eq("passage_id", passageId)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (existing) return json({ job: existing, reused: true }, 202);

  // The snapshot is server-owned. It keeps the latest submitted answer for each question,
  // capped at 100 records, so an app client never supplies answer history to an LLM.
  const { data: answerRows, error: answerError } = await supabase
    .from("dsemcq_attempt_answers")
    .select(`
      question_id, selected_option_id, is_correct, answered_at,
      dsemcq_attempts!inner(user_id, status),
      dsemcq_questions!inner(
        passage_id, stem, difficulty,
        dsemcq_question_options(id, label, text, is_correct, explanation),
        dsemcq_question_tags(tag_id)
      )
    `)
    .eq("dsemcq_attempts.user_id", userId)
    .eq("dsemcq_attempts.status", "submitted")
    .eq("dsemcq_questions.passage_id", passageId)
    .not("selected_option_id", "is", null)
    .order("answered_at", { ascending: false })
    .limit(500);
  if (answerError) return json({ error: "Could not snapshot learning history" }, 500);

  const latestByQuestion = new Map<string, unknown>();
  for (const row of answerRows ?? []) {
    const questionId = (row as { question_id: string }).question_id;
    if (!latestByQuestion.has(questionId)) latestByQuestion.set(questionId, row);
    if (latestByQuestion.size === 100) break;
  }

  const { data: job, error: insertError } = await supabase
    .from("dsemcq_custom_note_jobs")
    .insert({
      user_id: userId,
      passage_id: passageId,
      student_request: normalizedRequest,
      input_snapshot: {
        schema_version: "v1",
        answer_count: latestByQuestion.size,
        answers: [...latestByQuestion.values()],
      },
    })
    .select("id, passage_id, status, current_stage, review_round")
    .single();
  if (insertError) return json({ error: "Could not create notes job" }, 500);

  const queued = await triggerWorker(job.id);
  if (!queued) {
    await supabase.from("dsemcq_custom_note_jobs").update({
      status: "failed",
      current_stage: "failed",
      error_code: "WORKER_UNAVAILABLE",
      error_message: "筆記生成服務暫時未能啟動，請稍後再試。",
    }).eq("id", job.id);
    return json({ error: "Could not start notes job" }, 503);
  }

  return json({ job, reused: false }, 202);
}

async function triggerWorker(jobId: string) {
  const workerSecret = Deno.env.get("DSE_NOTES_WORKER_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!workerSecret || !supabaseUrl || !serviceRoleKey) return false;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dsemcq-custom-notes-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-custom-notes-worker-secret": workerSecret,
      },
      body: JSON.stringify({ jobId }),
    });
    return response.ok || response.status === 202;
  } catch {
    return false;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
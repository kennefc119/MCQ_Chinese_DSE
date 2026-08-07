import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POE_CHAT_URL = "https://api.poe.com/v1/chat/completions";
const MAX_REVIEW_ROUNDS = 3;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-custom-notes-worker-secret",
};

type AgentRole = "weakness" | "strength" | "trend" | "generator" | "fact_checker" | "pedagogy" | "optimizer" | "formatter";
type Job = {
  id: string;
  user_id: string;
  passage_id: string;
  student_request: string;
  status: string;
  current_stage: string;
  review_round: number;
  input_snapshot: Record<string, unknown>;
  workflow_state: Record<string, unknown>;
  prompt_version: string;
  corpus_version: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const workerSecret = Deno.env.get("DSE_NOTES_WORKER_SECRET");
  if (!workerSecret || req.headers.get("x-custom-notes-worker-secret") !== workerSecret) {
    return json({ error: "Unauthorised" }, 401);
  }

  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.jobId) return json({ error: "jobId is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.from("dsemcq_custom_note_jobs").select("*").eq("id", body.jobId).maybeSingle();
  if (error || !data) return json({ error: "Job not found" }, 404);
  const job = data as Job;
  if (["completed", "completed_unverified", "failed"].includes(job.status)) return json({ jobId: job.id, status: job.status });

  try {
    await processStage(supabase, job);
    await triggerNextStage(job.id);
    return json({ jobId: job.id, accepted: true }, 202);
  } catch (error) {
    console.error("Custom notes worker failed", { jobId: job.id, stage: job.current_stage, error: String(error) });
    await supabase.from("dsemcq_custom_note_jobs").update({
      status: "failed",
      current_stage: "failed",
      error_code: "WORKFLOW_FAILED",
      error_message: "筆記生成暫時未能完成，請稍後再試。",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ error: "Workflow failed" }, 500);
  }
});

async function triggerNextStage(jobId: string) {
  const workerSecret = Deno.env.get("DSE_NOTES_WORKER_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!workerSecret || !supabaseUrl || !serviceRoleKey) return;
  await fetch(`${supabaseUrl}/functions/v1/dsemcq-custom-notes-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "x-custom-notes-worker-secret": workerSecret,
    },
    body: JSON.stringify({ jobId }),
  }).catch((error) => console.error("Could not trigger next custom-notes stage", String(error)));
}

async function processStage(supabase: ReturnType<typeof createClient>, job: Job) {
  const stage = job.current_stage === "queued" ? "analyses" : job.current_stage;
  if (stage === "analyses") {
    await updateJob(supabase, job.id, { status: "running", current_stage: "analyses" });
    const { data: passage, error: passageError } = await supabase
      .from("dsemcq_passages")
      .select("id, title, author, dynasty, body, summary")
      .eq("id", job.passage_id)
      .single();
    if (passageError || !passage) throw new Error("Could not load designated passage");
    const shared = { ...baseInput(job), passage };
    const [weakness, strength, trend] = await Promise.all([
      runAgent(supabase, job, "weakness", 0, { ...shared, answer_history: job.input_snapshot }),
      runAgent(supabase, job, "strength", 0, { ...shared, answer_history: job.input_snapshot }),
      runAgent(supabase, job, "trend", 0, { ...shared, trend_window: "2023-2025" }),
    ]);
    await updateJob(supabase, job.id, {
      current_stage: "generator",
      workflow_state: { ...job.workflow_state, passage, weakness, strength, trend },
    });
    return;
  }

  if (stage === "generator") {
    const draft = await runAgent(supabase, job, "generator", 1, {
      ...baseInput(job),
      passage: job.workflow_state.passage,
      weakness_report: job.workflow_state.weakness,
      strength_report: job.workflow_state.strength,
      trend_report: job.workflow_state.trend,
    });
    await updateJob(supabase, job.id, {
      current_stage: "review",
      review_round: 1,
      workflow_state: { ...job.workflow_state, drafts: [draft] },
    });
    return;
  }

  if (stage === "review") {
    const drafts = asArray(job.workflow_state.drafts);
    const currentDraft = drafts.at(-1);
    if (!currentDraft) throw new Error("No draft available for review");
    const round = job.review_round || 1;
    const [factCheck, pedagogy] = await Promise.all([
      runAgent(supabase, job, "fact_checker", round, {
        ...baseInput(job), passage: job.workflow_state.passage, draft: currentDraft,
      }),
      runAgent(supabase, job, "pedagogy", round, {
        ...baseInput(job), draft: currentDraft,
        passage: job.workflow_state.passage,
        weakness_report: job.workflow_state.weakness,
        strength_report: job.workflow_state.strength,
      }),
    ]);
    const reviews = [...asArray(job.workflow_state.reviews), { round, fact_check: factCheck, pedagogy }];
    const passed = reviewPassed(factCheck) && reviewPassed(pedagogy);
    if (passed) {
      await updateJob(supabase, job.id, {
        current_stage: "formatter",
        workflow_state: { ...job.workflow_state, reviews, selected_draft: currentDraft, verification_status: "approved" },
      });
      return;
    }
    if (round >= MAX_REVIEW_ROUNDS) {
      const best = selectBestDraft(drafts, reviews);
      await updateJob(supabase, job.id, {
        current_stage: "formatter",
        workflow_state: { ...job.workflow_state, reviews, selected_draft: best, verification_status: "unverified" },
      });
      return;
    }
    await updateJob(supabase, job.id, {
      current_stage: "optimizer",
      workflow_state: { ...job.workflow_state, reviews },
    });
    return;
  }

  if (stage === "optimizer") {
    const drafts = asArray(job.workflow_state.drafts);
    const reviews = asArray(job.workflow_state.reviews);
    const draft = drafts.at(-1);
    const review = reviews.at(-1) as Record<string, unknown> | undefined;
    if (!draft || !review) throw new Error("No draft or review available for optimization");
    const nextRound = job.review_round + 1;
    const revision = await runAgent(supabase, job, "optimizer", nextRound, {
      ...baseInput(job),
      passage: job.workflow_state.passage,
      current_notes: draft,
      fact_check_report: review.fact_check,
      pedagogy_report: review.pedagogy,
    });
    await updateJob(supabase, job.id, {
      current_stage: "review",
      review_round: nextRound,
      workflow_state: { ...job.workflow_state, drafts: [...drafts, revision] },
    });
    return;
  }

  if (stage === "formatter") {
    const draft = job.workflow_state.selected_draft;
    if (!draft) throw new Error("No selected draft available for formatting");
    const layout = await runAgent(supabase, job, "formatter", job.review_round, {
      ...baseInput(job),
      passage: job.workflow_state.passage,
      immutable_note: draft,
      formatter_rule: "Return layout metadata only. Do not return replacement academic content.",
    });
    const selectedReview = findReviewForDraft(job.workflow_state, job.workflow_state.selected_draft);
    const factScore = scoreOf((selectedReview as Record<string, unknown> | undefined)?.fact_check);
    const pedagogyScore = scoreOf((selectedReview as Record<string, unknown> | undefined)?.pedagogy);
    const verificationStatus = job.workflow_state.verification_status === "approved" ? "approved" : "unverified";
    const note = draft as Record<string, unknown>;
    const { error } = await supabase.from("dsemcq_custom_notes").insert({
      job_id: job.id,
      user_id: job.user_id,
      passage_id: job.passage_id,
      title: typeof note.title === "string" ? note.title : "度身訂造溫習筆記",
      verification_status: verificationStatus,
      fact_check_score: factScore,
      pedagogy_score: pedagogyScore,
      semantic_content: draft,
      layout_metadata: layout,
      source_refs: Array.isArray(note.source_refs) ? note.source_refs : [],
      prompt_version: job.prompt_version,
      corpus_version: job.corpus_version,
    });
    if (error) throw new Error(`Could not publish note: ${error.message}`);
    await updateJob(supabase, job.id, {
      status: verificationStatus === "approved" ? "completed" : "completed_unverified",
      current_stage: "completed",
      completed_at: new Date().toISOString(),
    });
    return;
  }

  throw new Error(`Unknown workflow stage: ${stage}`);
}

async function runAgent(
  supabase: ReturnType<typeof createClient>,
  job: Job,
  role: AgentRole,
  reviewRound: number,
  input: Record<string, unknown>,
) {
  const startedAt = Date.now();
  const { data: run, error: runError } = await supabase.from("dsemcq_custom_note_agent_runs").insert({
    job_id: job.id, agent_role: role, review_round: reviewRound, status: "running", input_payload: input,
  }).select("id").single();
  if (runError || !run) throw new Error(`Could not create ${role} audit record`);

  try {
    const output = await callPoe(role, {
      schema_version: "v1", job_id: job.id, agent_role: role, passage_id: job.passage_id,
      iteration: reviewRound, student_request: job.student_request, inputs: input,
    });
    await supabase.from("dsemcq_custom_note_agent_runs").update({
      status: "completed", output_payload: output, duration_ms: Date.now() - startedAt, completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return output;
  } catch (error) {
    await supabase.from("dsemcq_custom_note_agent_runs").update({
      status: "failed", error_code: "AGENT_FAILED", duration_ms: Date.now() - startedAt, completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

async function callPoe(role: AgentRole, payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("POE_API_KEY");
  const botName = Deno.env.get(botSecretName(role));
  if (!apiKey || !botName) throw new Error(`Poe configuration missing for ${role}`);
  const response = await fetch(POE_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: botName, temperature: role === "fact_checker" || role === "formatter" ? 0 : 0.4, messages: [
      { role: "user", content: "Return one valid JSON object only.\n" + JSON.stringify(payload) },
    ] }),
  });
  if (!response.ok) throw new Error(`Poe ${role} request failed (${response.status})`);
  const responseJson = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = responseJson.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(content);
  validateAgentOutput(role, parsed);
  return parsed;
}

function validateAgentOutput(role: AgentRole, output: Record<string, unknown>) {
  if (output.schema_version !== "v1" || output.agent_role !== role || typeof output.output !== "object") {
    throw new Error(`Invalid structured output from ${role}`);
  }
  if (role === "fact_checker" || role === "pedagogy") {
    const review = output.output as Record<string, unknown>;
    if (!Number.isInteger(review.score) || (review.score as number) < 0 || (review.score as number) > 100) {
      throw new Error(`Invalid review score from ${role}`);
    }
    if (review.verdict !== "PASS" && review.verdict !== "REVISE") throw new Error(`Invalid verdict from ${role}`);
  }
}

function parseJsonObject(content: string): Record<string, unknown> {
  const stripped = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Poe did not return JSON");
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("Poe returned invalid JSON");
  }
}

function reviewPassed(value: unknown) {
  const output = (value as Record<string, unknown>)?.output as Record<string, unknown> | undefined;
  return output?.verdict === "PASS" && typeof output.score === "number" && output.score >= 90;
}

function scoreOf(value: unknown) {
  const output = (value as Record<string, unknown>)?.output as Record<string, unknown> | undefined;
  return typeof output?.score === "number" ? output.score : 0;
}

function selectBestDraft(drafts: unknown[], reviews: unknown[]) {
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < drafts.length; index += 1) {
    const review = reviews[index] as Record<string, unknown> | undefined;
    const fact = scoreOf(review?.fact_check);
    const pedagogy = scoreOf(review?.pedagogy);
    const rank = Math.min(fact, pedagogy) * 1_000 + fact + pedagogy;
    if (rank > bestScore) {
      bestScore = rank;
      bestIndex = index;
    }
  }
  return drafts[bestIndex];
}

function findReviewForDraft(state: Record<string, unknown>, draft: unknown) {
  const drafts = asArray(state.drafts);
  const index = drafts.findIndex((item) => JSON.stringify(item) === JSON.stringify(draft));
  return asArray(state.reviews)[Math.max(0, index)];
}

function botSecretName(role: AgentRole) {
  return `DSE_NOTES_BOT_${role.toUpperCase()}`;
}

function baseInput(job: Job) {
  return { passage_id: job.passage_id, student_request: job.student_request, corpus_version: job.corpus_version };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function updateJob(supabase: ReturnType<typeof createClient>, jobId: string, update: Record<string, unknown>) {
  const { error } = await supabase.from("dsemcq_custom_note_jobs").update({ ...update, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw new Error(`Could not update workflow state: ${error.message}`);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" }, status });
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  retrieveSource,
  normalizePerformanceDetailRequest,
  normalizeQuestionBankDetailRequest,
  normalizeRetrievalHints,
  resolvePassageScope,
  type ResolvedPassageScope,
  type RetrievalHints,
  type Source,
} from "../_shared/advisor_v2_context.ts";

const POE_CHAT_URL = "https://api.poe.com/v1/chat/completions";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-advisor-v2-worker-secret",
};

type Workflow = {
  id: string;
  request_id: string;
  advisor_message_id: string;
  user_id: string;
  status: string;
  preference_snapshot: Record<string, boolean>;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("x-advisor-v2-worker-secret") !== Deno.env.get("DSE_ADVISOR_V2_WORKER_SECRET")) {
    return json({ error: "Unauthorised" }, 401);
  }

  let body: { workflowId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.workflowId) return json({ error: "workflowId is required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await supabase
    .from("dsemcq_advisor_v2_workflow_runs")
    .select("*")
    .eq("id", body.workflowId)
    .maybeSingle();
  if (error || !data) return json({ error: "Workflow not found" }, 404);
  const workflow = data as Workflow;
  if (["completed", "failed"].includes(workflow.status)) return json({ status: workflow.status });

  try {
    await processWorkflow(supabase, workflow);
    return json({ accepted: true }, 202);
  } catch (error) {
    console.error("Advisor V2 worker failed", { workflowId: workflow.id, error: String(error) });
    await failWorkflow(supabase, workflow, "WORKFLOW_FAILED", "顧問服務暫時未能完成，請稍後再試。");
    return json({ error: "Workflow failed" }, 500);
  }
});

async function processWorkflow(supabase: ReturnType<typeof createClient>, workflow: Workflow) {
  const { data: message, error: messageError } = await supabase
    .from("dsemcq_advisor_v2_messages")
    .select("id, user_text")
    .eq("id", workflow.advisor_message_id)
    .eq("user_id", workflow.user_id)
    .single();
  if (messageError || !message) throw new Error("V2 advisor message not found");

  await updateWorkflow(supabase, workflow.id, {
    status: "running",
    current_stage: "planning",
    heartbeat_at: new Date().toISOString(),
  });
  const capabilities = enabledSources(workflow.preference_snapshot);
  const plan = await callPoe("ORCHESTRATOR", {
    schema_version: "v1",
    request_id: workflow.request_id,
    agent_role: "orchestrator",
    student_message: message.user_text,
    capabilities: { enabled_sources: capabilities },
    inputs: {},
  });
  const selectedSources = validatedSources(plan, capabilities);
  const retrievalHints = planRetrievalHints(plan);
  const resolvedPassageScope = await resolvePassageScope(supabase, retrievalHints);

  await updateWorkflow(supabase, workflow.id, {
    current_stage: "parallel_branches",
    validated_plan: plan,
    heartbeat_at: new Date().toISOString(),
  });
  const settled = await Promise.allSettled(
    selectedSources.map((source) => runSource(
      supabase,
      workflow,
      source,
      message.user_text,
      retrievalHints,
      resolvedPassageScope,
    )),
  );
  const reports = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);

  await updateWorkflow(supabase, workflow.id, {
    current_stage: "synthesis",
    heartbeat_at: new Date().toISOString(),
  });
  const synthesisResult = await runSynthesizerWithSingleRetry(
    workflow.request_id,
    message.user_text,
    capabilities,
    reports as Array<Record<string, unknown>>,
  );
  const reply = synthesisResult.reply;
  const sourceChips = synthesisResult.sourceChips;

  const { error: completionError } = await supabase
    .from("dsemcq_advisor_v2_messages")
    .update({ status: "completed", bot_reply: reply, error_message: null, completed_at: new Date().toISOString() })
    .eq("id", workflow.advisor_message_id)
    .eq("user_id", workflow.user_id)
    .eq("status", "processing");
  if (completionError) throw completionError;

  await updateWorkflow(supabase, workflow.id, {
    status: "completed",
    current_stage: "completed",
    source_chips: sourceChips,
    personalization_used: reports.length > 0,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  });
}

async function runSource(
  supabase: ReturnType<typeof createClient>,
  workflow: Workflow,
  source: Source,
  studentMessage: string,
  retrievalHints: RetrievalHints | undefined,
  resolvedPassageScope: ResolvedPassageScope,
) {
  if (source === "performance") {
    return await runPerformanceSource(supabase, workflow, studentMessage, retrievalHints, resolvedPassageScope);
  }
  if (source === "question_bank") {
    return await runQuestionBankSource(supabase, workflow, studentMessage, retrievalHints, resolvedPassageScope);
  }

  const input = await retrieveSource(supabase, workflow.user_id, source, studentMessage, {
    retrievalHints,
    resolvedPassageScope,
  });
  const role = source === "question_bank" ? "QUESTION_BANK" : source.toUpperCase();
  const run = await createAgentRun(supabase, workflow.id, source, input);
  try {
    const output = await callPoe(role, {
      schema_version: "v1",
      request_id: workflow.request_id,
      agent_role: source,
      student_message: studentMessage,
      capabilities: { enabled_sources: [source] },
      inputs: input,
    });
    await supabase.from("dsemcq_advisor_v2_agent_runs").update({
      status: "completed",
      output_payload: output,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return { source, output };
  } catch (error) {
    await supabase.from("dsemcq_advisor_v2_agent_runs").update({
      status: "failed",
      error_code: "AGENT_FAILED",
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

async function runPerformanceSource(
  supabase: ReturnType<typeof createClient>,
  workflow: Workflow,
  studentMessage: string,
  retrievalHints: RetrievalHints | undefined,
  resolvedPassageScope: ResolvedPassageScope,
) {
  const baseInput = await retrieveSource(supabase, workflow.user_id, "performance", studentMessage, {
    retrievalHints,
    resolvedPassageScope,
  });
  const run = await createAgentRun(supabase, workflow.id, "performance", baseInput as Record<string, unknown>);

  const followupEvidence: Array<Record<string, unknown>> = [];
  const priorIterationOutputs: Array<Record<string, unknown>> = [];
  const detailRequestSignatures = new Set<string>();
  let finalOutput: Record<string, unknown> | null = null;

  try {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const iterationInput = {
        ...baseInput,
        iteration,
        max_iterations: 3,
        followup_evidence: followupEvidence,
        prior_iteration_outputs: priorIterationOutputs,
      };

      const output = await callPoe("PERFORMANCE", {
        schema_version: "v1",
        request_id: workflow.request_id,
        agent_role: "performance",
        student_message: studentMessage,
        capabilities: { enabled_sources: ["performance"] },
        inputs: iterationInput,
      });

      finalOutput = output;
      priorIterationOutputs.push({
        iteration,
        output: objectOf(output.output),
      });
      const detailRequest = normalizePerformanceDetailRequest(objectOf(output.output).detail_request);
      if (!detailRequest || iteration >= 3) break;
      const requestSignature = JSON.stringify(detailRequest);
      if (detailRequestSignatures.has(requestSignature)) {
        followupEvidence.push({
          iteration,
          detail_request: detailRequest,
          detail_result: {
            question_diagnostics: [],
            data_gaps: ["Duplicate detail request was not executed. Refine the selectors or finalize the analysis."],
            evidence_ids: [],
          },
        });
        continue;
      }
      detailRequestSignatures.add(requestSignature);

      const toolStart = new Date().toISOString();
      const detail = await retrieveSource(
        supabase,
        workflow.user_id,
        "performance",
        studentMessage,
        {
          performanceDetailRequest: detailRequest,
          retrievalHints,
          resolvedPassageScope,
        },
      );
      const toolEnd = new Date().toISOString();

      await recordToolCall(
        supabase,
        workflow.id,
        "performance_detail_lookup",
        detailRequest as unknown as Record<string, unknown>,
        stringArray((detail as Record<string, unknown>).evidence_ids),
        toolStart,
        toolEnd,
      );

      followupEvidence.push({
        iteration,
        detail_request: detailRequest,
        detail_result: detail,
      });
    }

    await supabase.from("dsemcq_advisor_v2_agent_runs").update({
      status: "completed",
      output_payload: finalOutput,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return { source: "performance", output: finalOutput };
  } catch (error) {
    await supabase.from("dsemcq_advisor_v2_agent_runs").update({
      status: "failed",
      error_code: "AGENT_FAILED",
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

async function runQuestionBankSource(
  supabase: ReturnType<typeof createClient>,
  workflow: Workflow,
  studentMessage: string,
  retrievalHints: RetrievalHints | undefined,
  resolvedPassageScope: ResolvedPassageScope,
) {
  const baseInput = await retrieveSource(supabase, workflow.user_id, "question_bank", studentMessage, {
    retrievalHints,
    resolvedPassageScope,
  });
  const run = await createAgentRun(supabase, workflow.id, "question_bank", baseInput as Record<string, unknown>);
  const followupEvidence: Array<Record<string, unknown>> = [];
  const priorIterationOutputs: Array<Record<string, unknown>> = [];
  const detailRequestSignatures = new Set<string>();
  let finalOutput: Record<string, unknown> | null = null;

  try {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const iterationInput = {
        ...baseInput,
        iteration,
        max_iterations: 3,
        followup_evidence: followupEvidence,
        prior_iteration_outputs: priorIterationOutputs,
      };
      const output = await callPoe("QUESTION_BANK", {
        schema_version: "v1",
        request_id: workflow.request_id,
        agent_role: "question_bank",
        student_message: studentMessage,
        capabilities: { enabled_sources: ["question_bank"] },
        inputs: iterationInput,
      });
      finalOutput = output;
      priorIterationOutputs.push({ iteration, output: objectOf(output.output) });
      const detailRequest = normalizeQuestionBankDetailRequest(objectOf(output.output).detail_request);
      if (!detailRequest || iteration >= 3) break;
      const requestSignature = JSON.stringify(detailRequest);
      if (detailRequestSignatures.has(requestSignature)) {
        followupEvidence.push({
          iteration,
          detail_request: detailRequest,
          detail_result: {
            similar_questions: [],
            trend_signals: [],
            marking_skill_notes: [],
            data_gap_notes: ["Duplicate detail request was not executed. Refine the filters or finalize the analysis."],
            evidence_ids: [],
          },
        });
        continue;
      }
      detailRequestSignatures.add(requestSignature);

      const toolStart = new Date().toISOString();
      const detail = await retrieveSource(supabase, workflow.user_id, "question_bank", studentMessage, {
        questionBankDetailRequest: detailRequest,
        retrievalHints,
        resolvedPassageScope,
      });
      const toolEnd = new Date().toISOString();
      await recordToolCall(
        supabase,
        workflow.id,
        "question_bank_detail_lookup",
        detailRequest as unknown as Record<string, unknown>,
        stringArray((detail as Record<string, unknown>).evidence_ids),
        toolStart,
        toolEnd,
      );
      followupEvidence.push({
        iteration,
        detail_request: detailRequest,
        detail_result: detail,
      });
    }

    await supabase.from("dsemcq_advisor_v2_agent_runs").update({
      status: "completed",
      output_payload: finalOutput,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return { source: "question_bank", output: finalOutput };
  } catch (error) {
    await supabase.from("dsemcq_advisor_v2_agent_runs").update({
      status: "failed",
      error_code: "AGENT_FAILED",
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

async function createAgentRun(
  supabase: ReturnType<typeof createClient>,
  workflowId: string,
  role: string,
  input: Record<string, unknown>,
) {
  const { data, error } = await supabase.from("dsemcq_advisor_v2_agent_runs").insert({
    workflow_id: workflowId,
    agent_role: role,
    status: "running",
    input_evidence_refs: stringArray(input.evidence_ids),
    bot_name: Deno.env.get(`DSE_ADVISOR_BOT_${role === "question_bank" ? "QUESTION_BANK" : role.toUpperCase()}`) ?? null,
  }).select("id").single();
  if (error || !data) throw new Error(`Unable to create ${role} agent run`);
  return data;
}

async function recordToolCall(
  supabase: ReturnType<typeof createClient>,
  workflowId: string,
  toolName: string,
  safeArguments: Record<string, unknown>,
  evidenceRefs: string[],
  startedAtIso: string,
  completedAtIso: string,
) {
  const durationMs = Math.max(0, new Date(completedAtIso).getTime() - new Date(startedAtIso).getTime());
  const { error } = await supabase.from("dsemcq_advisor_v2_tool_calls").insert({
    workflow_id: workflowId,
    tool_name: toolName,
    safe_arguments: safeArguments,
    evidence_refs: evidenceRefs,
    status: "completed",
    duration_ms: durationMs,
    created_at: startedAtIso,
    completed_at: completedAtIso,
  });
  if (error) {
    console.error("Advisor V2 tool call record failed", { workflowId, toolName, error: error.message });
  }
}

function enabledSources(snapshot: Record<string, boolean>): Source[] {
  const sources: Source[] = [];
  if (snapshot.profile_enabled) sources.push("profile");
  if (snapshot.performance_enabled) sources.push("performance");
  if (snapshot.question_bank_enabled) sources.push("question_bank");
  return sources;
}

function validatedSources(plan: Record<string, unknown>, enabled: Source[]): Source[] {
  const requested = stringArray(plan.selected_sources);
  return requested.filter((source): source is Source => (
    (source === "profile" || source === "performance" || source === "question_bank") && enabled.includes(source)
  )).slice(0, 3);
}

function planRetrievalHints(plan: Record<string, unknown>): RetrievalHints | undefined {
  const hinted = normalizeRetrievalHints({
    mentioned_designated_passages: stringArray(plan.mentioned_designated_passages),
    mentionedDesignatedPassages: stringArray(plan.mentionedDesignatedPassages),
    question_bank_focus: stringArray(plan.question_bank_focus),
    questionBankFocus: stringArray(plan.questionBankFocus),
  });
  return hinted ?? undefined;
}

async function runSynthesizerWithSingleRetry(
  requestId: string,
  studentMessage: string,
  capabilities: Source[],
  reports: Array<Record<string, unknown>>,
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const synthesis = await callPoe("SYNTHESIZER", {
        schema_version: "v1",
        request_id: requestId,
        agent_role: "synthesizer",
        student_message: studentMessage,
        capabilities: { enabled_sources: capabilities },
        inputs: { reports },
      });
      const output = objectOf(synthesis.output);
      const reply = typeof output.reply === "string" ? output.reply.trim() : "";
      if (!reply) throw new Error("Synthesizer returned no reply");
      return {
        reply,
        sourceChips: stringArray(output.source_chips),
        retryAttempt: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        console.warn("Synthesizer attempt 1 failed, retrying once", {
          requestId,
          error: String(error),
        });
      }
    }
  }
  throw lastError ?? new Error("Synthesizer failed after one retry");
}

async function callPoe(role: string, payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("POE_API_KEY");
  const bot = Deno.env.get(`DSE_ADVISOR_BOT_${role}`);
  if (!apiKey || !bot) throw new Error(`Poe configuration missing for ${role}`);
  const response = await fetch(POE_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: bot, messages: [{ role: "user", content: JSON.stringify(payload) }] }),
  });
  if (!response.ok) throw new Error(`Poe ${role} failed (${response.status})`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = parseJson(content);
  if (parsed.schema_version !== "v1") throw new Error(`Invalid ${role} schema version`);
  return parsed;
}

function parseJson(content: string): Record<string, unknown> {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Poe did not return JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function updateWorkflow(supabase: ReturnType<typeof createClient>, workflowId: string, update: Record<string, unknown>) {
  const { error } = await supabase.from("dsemcq_advisor_v2_workflow_runs").update({
    ...update,
    updated_at: new Date().toISOString(),
  }).eq("id", workflowId);
  if (error) throw error;
}

async function failWorkflow(
  supabase: ReturnType<typeof createClient>,
  workflow: Workflow,
  errorCode: string,
  errorMessage: string,
) {
  await supabase.from("dsemcq_advisor_v2_workflow_runs").update({
    status: "failed",
    current_stage: "failed",
    error_code: errorCode,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", workflow.id);
  await supabase.from("dsemcq_advisor_v2_messages").update({
    status: "failed",
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  }).eq("id", workflow.advisor_message_id).eq("user_id", workflow.user_id).eq("status", "processing");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

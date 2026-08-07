import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAdvisorMonthlyQuota } from "../_shared/advisor_quota.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Unauthorised" }, 401);

  let body: { requestId?: string; quotaOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Unauthorised" }, 401);

  if (body.quotaOnly) {
    try {
      return json({ quota: await getAdvisorMonthlyQuota(supabase, userId) });
    } catch (error) {
      console.error("Advisor V2 quota lookup failed", { userId, error: String(error) });
      return json({ error: "Unable to load chat quota" }, 500);
    }
  }

  const requestId = (body.requestId ?? "").trim();
  if (!requestId) return json({ error: "requestId is required" }, 400);

  if (!isV2Configured()) {
    return json({ error: "Advisor V2 is not configured", code: "V2_UNCONFIGURED" }, 503);
  }

  let { data: preferences, error: preferencesError } = await supabase
    .from("dsemcq_advisor_v2_user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (preferencesError) return json({ error: "Unable to load Advisor V2 preferences" }, 500);
  if (!preferences) {
    const { data: createdPreferences, error: createPreferencesError } = await supabase
      .from("dsemcq_advisor_v2_user_preferences")
      .insert({
        user_id: userId,
        v2_opt_in: true,
        conversation_history_enabled: true,
        profile_enabled: true,
        performance_enabled: true,
        question_bank_enabled: true,
      })
      .select("*")
      .single();
    if (createPreferencesError || !createdPreferences) {
      return json({ error: "Unable to initialize Advisor V2 preferences" }, 500);
    }
    preferences = createdPreferences;
  }
  if (!preferences?.v2_opt_in) {
    return json({ error: "Advisor V2 is not enabled for this user", code: "V2_NOT_OPTED_IN" }, 409);
  }

  const { data: message } = await supabase
    .from("dsemcq_advisor_v2_messages")
    .select("id, user_id, user_text, status")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (!message) return json({ error: "Advisor request was not prepared" }, 409);
  if (message.status === "completed" || message.status === "failed") {
    return json({ status: message.status, requestId }, 200);
  }

  const { data: existingWorkflow } = await supabase
    .from("dsemcq_advisor_v2_workflow_runs")
    .select("id, status")
    .eq("request_id", requestId)
    .maybeSingle();
  if (existingWorkflow?.status === "completed" || existingWorkflow?.status === "failed") {
    return json({ status: existingWorkflow.status, requestId, workflowId: existingWorkflow.id }, 200);
  }

  let workflow = existingWorkflow;
  if (!workflow) {
    const { data: createdWorkflow, error: workflowError } = await supabase
      .from("dsemcq_advisor_v2_workflow_runs")
      .insert({
      request_id: requestId,
      advisor_message_id: message.id,
      user_id: userId,
      status: "queued",
      current_stage: "queued",
      preference_snapshot: preferenceSnapshot(preferences),
      updated_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();
    if (workflowError || !createdWorkflow) return json({ error: "Unable to prepare Advisor V2 workflow" }, 500);
    workflow = createdWorkflow;
  }

  const { data: claimed } = await supabase
    .from("dsemcq_advisor_v2_messages")
    .update({ status: "processing", processing_at: new Date().toISOString() })
    .eq("id", message.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed && message.status === "pending") return json({ status: "processing", requestId }, 202);

  let quota;
  try {
    quota = await getAdvisorMonthlyQuota(supabase, userId);
  } catch (error) {
    console.error("Advisor V2 quota enforcement failed", { userId, error: String(error) });
    await supabase
      .from("dsemcq_advisor_v2_messages")
      .update({ status: "failed", error_message: "QUOTA_LOOKUP_FAILED", completed_at: new Date().toISOString() })
      .eq("id", message.id)
      .eq("status", "processing");
    await supabase
      .from("dsemcq_advisor_v2_workflow_runs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_code: "QUOTA_LOOKUP_FAILED",
        error_message: "Unable to verify chat quota",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflow.id);
    return json({ error: "Unable to verify chat quota" }, 500);
  }
  // The just-claimed V2 row is included in processing usage, so reject only
  // when the shared V1+V2 total exceeds the user's monthly allowance.
  if (quota.used > quota.limit) {
    await supabase
      .from("dsemcq_advisor_v2_messages")
      .update({ status: "failed", error_message: "MONTHLY_LIMIT", completed_at: new Date().toISOString() })
      .eq("id", message.id)
      .eq("status", "processing");
    await supabase
      .from("dsemcq_advisor_v2_workflow_runs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_code: "MONTHLY_LIMIT",
        error_message: "本月對話已達上限。",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflow.id);
    return json({ error: "本月對話已達上限。", code: "MONTHLY_LIMIT", quota }, 200);
  }

  void triggerWorker(workflow.id);
  return json({ status: "accepted", requestId, workflowId: workflow.id, quota }, 202);
});

function preferenceSnapshot(preferences: Record<string, unknown>) {
  return {
    version: preferences.preference_version ?? 1,
    conversation_history_enabled: preferences.conversation_history_enabled === true,
    profile_enabled: preferences.profile_enabled === true,
    performance_enabled: preferences.performance_enabled === true,
    question_bank_enabled: preferences.question_bank_enabled === true,
    past_paper_enabled: false,
    marking_scheme_enabled: false,
  };
}

async function triggerWorker(workflowId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = Deno.env.get("DSE_ADVISOR_V2_WORKER_SECRET");
  if (!url || !serviceKey || !workerSecret) return;
  await fetch(`${url}/functions/v1/dsemcq-advisor-v2-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      "x-advisor-v2-worker-secret": workerSecret,
    },
    body: JSON.stringify({ workflowId }),
  }).catch((error) => console.error("Advisor V2 worker trigger failed", String(error)));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isV2Configured() {
  const required = [
    "POE_API_KEY",
    "DSE_ADVISOR_V2_WORKER_SECRET",
    "DSE_ADVISOR_BOT_ORCHESTRATOR",
    "DSE_ADVISOR_BOT_PROFILE",
    "DSE_ADVISOR_BOT_PERFORMANCE",
    "DSE_ADVISOR_BOT_QUESTION_BANK",
    "DSE_ADVISOR_BOT_SYNTHESIZER",
  ];
  return required.every((name) => Boolean(Deno.env.get(name)));
}
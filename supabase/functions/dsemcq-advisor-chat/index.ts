// Supabase Edge Function: dsemcq-advisor-chat
// Calls the Poe OpenAI-compatible API and updates an idempotent request row.
// The app reads that row so a reply survives an interrupted HTTP response.
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   POE_API_KEY            — Poe API key (poe.com/api_key)
//   DSE_ADVISOR_BOT_NAME   — Poe bot name to target, e.g. "GPT-4o-Mini" (default)
//   SUPABASE_URL      — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAdvisorMonthlyQuota, type AdvisorQuotaSnapshot } from "../_shared/advisor_quota.ts";

const POE_CHAT_URL  = "https://api.poe.com/v1/chat/completions";
const DEFAULT_BOT   = "DSEChatConsultant";
const MAX_REPLY_CHARS = 1200; // hard-cap to stay within ~200 Chinese chars

// ── CORS headers for Expo / React Native fetch ────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── 1. Auth: identify caller (guests send anon key — that's allowed) ───
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Unauthorised" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lifecycleEnabled = await hasAdvisorLifecycleColumns(supabase);

  // getUser returns null for guests (anon key ≠ user JWT) — that's ok.
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId: string | null = userData?.user?.id ?? null;

  // ── 2. Parse body ──────────────────────────────────────────────────────
  let body: {
    message?: string;
    system?: string;
    history?: Array<{ role: string; text: string }>;
    requestId?: string;
    quotaOnly?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userMessage = (body.message ?? "").trim();
  const requestId = (body.requestId ?? "").trim();
  if (body.quotaOnly) {
    if (!userId) return json({ error: "Unauthorised" }, 401);
    try {
      return json({ quota: await getAdvisorMonthlyQuota(supabase, userId) });
    } catch (error) {
      console.error("Quota lookup error:", error);
      return json({ error: "Unable to load chat quota" }, 500);
    }
  }
  if (!userMessage) return json({ error: "message is required" }, 400);
  if (userId && lifecycleEnabled && !requestId) return json({ error: "requestId is required" }, 400);

  // ── 3. Claim the authenticated request row ─────────────────────────────
  let requestRowId: string | null = null;
  if (userId && lifecycleEnabled) {
    const { data: existing } = await supabase
      .from("dsemcq_advisor_messages")
      .select("id, status, bot_reply, error_message")
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (!existing) {
      return json({ error: "Advisor request was not prepared" }, 409);
    }

    requestRowId = existing.id;
    if (existing.status === "completed") return json({ status: "completed", reply: existing.bot_reply }, 200);
    if (existing.status === "failed") return json({ status: "failed", error: existing.error_message ?? "AI service failed" }, 200);
    if (existing.status === "processing") return json({ status: "processing" }, 202);

    const { data: claimed } = await supabase
      .from("dsemcq_advisor_messages")
      .update({ status: "processing", processing_at: new Date().toISOString() })
      .eq("id", requestRowId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) return json({ status: "processing" }, 202);
  }

  // ── 4. Monthly limit check for authenticated users ─────────────────────
  let quotaBefore: AdvisorQuotaSnapshot | null = null;
  if (userId) {
    try {
      quotaBefore = await getAdvisorMonthlyQuota(supabase, userId);
    } catch (error) {
      console.error("Quota enforcement lookup error:", error);
      return json({ error: "Unable to verify chat quota" }, 500);
    }

    // Lifecycle requests are already in the processing count; legacy requests are inserted after Poe responds.
    const atLimit = lifecycleEnabled
      ? quotaBefore.used > quotaBefore.limit
      : quotaBefore.used >= quotaBefore.limit;
    if (atLimit) {
      if (lifecycleEnabled && requestRowId) {
        await supabase
          .from("dsemcq_advisor_messages")
          .update({ status: "failed", error_message: "MONTHLY_LIMIT", completed_at: new Date().toISOString() })
          .eq("id", requestRowId);
      }
      return json({
        error: "本月對話已達上限。",
        code: "MONTHLY_LIMIT",
        quota: quotaBefore,
      }, 200);
    }
  }

  const systemPrompt = body.system ?? "";
  const history      = Array.isArray(body.history) ? body.history : [];

  // ── 3. Build OpenAI-compatible messages array ──────────────────────────
  // Poe's OpenAI-compatible endpoint accepts: system / user / assistant roles
  const messages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    // Poe ignores system role on most bots — merge into first user message
    messages.push({ role: "user", content: `[System]\n${systemPrompt}` });
    messages.push({ role: "assistant", content: "明白。" });
  }

  // Conversation history
  for (const m of history) {
    messages.push({
      role:    m.role === "assistant" ? "assistant" : "user",
      content: m.text,
    });
  }

  // Current user turn
  messages.push({ role: "user", content: userMessage });

  // ── 5. Call Poe OpenAI-compatible API ─────────────────────────────────
  const poeApiKey = Deno.env.get("POE_API_KEY") ?? "";
  const botName   = Deno.env.get("DSE_ADVISOR_BOT_NAME") ?? DEFAULT_BOT;

  if (!poeApiKey) {
    console.error("POE_API_KEY not set");
    await failRequest(supabase, requestRowId, "AI service not configured");
    return json({ error: "AI service not configured — POE_API_KEY missing" }, 503);
  }

  let poeResp: Response;
  try {
    poeResp = await fetch(POE_CHAT_URL, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${poeApiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:    botName,
        messages: messages,
      }),
    });
  } catch (e) {
    console.error("Poe fetch error:", e);
    await failRequest(supabase, requestRowId, "Failed to reach AI service");
    return json({ error: "Failed to reach AI service" }, 502);
  }

  if (!poeResp.ok) {
    const errText = await poeResp.text().catch(() => "");
    console.error(`Poe API error ${poeResp.status}:`, errText);
    await failRequest(supabase, requestRowId, `AI service error (${poeResp.status})`);
    return json({ error: `AI service error (${poeResp.status}): ${errText.slice(0, 200)}` }, 502);
  }

  // ── 5. Parse JSON response ─────────────────────────────────────────────
  let poeJson: { choices?: Array<{ message?: { content?: string } }> };
  try {
    poeJson = await poeResp.json();
  } catch {
    await failRequest(supabase, requestRowId, "Invalid JSON from AI service");
    return json({ error: "Invalid JSON from AI service" }, 502);
  }

  const reply = (poeJson.choices?.[0]?.message?.content ?? "").slice(0, MAX_REPLY_CHARS);

  if (!reply) {
    await failRequest(supabase, requestRowId, "Empty reply from AI service");
    return json({ error: "Empty reply from AI service" }, 502);
  }

  // ── 6. Complete exchange (authenticated users only — guests not tracked) ─
  if (lifecycleEnabled && requestRowId) {
    const { error: dbErr } = await supabase.from("dsemcq_advisor_messages").update({
      status: "completed",
      bot_reply: reply,
      error_message: null,
      completed_at: new Date().toISOString(),
    }).eq("id", requestRowId);
    if (dbErr) {
      console.error("DB completion error:", dbErr.message);
    }
  } else if (userId) {
    const { error: legacyInsertErr } = await supabase
      .from("dsemcq_advisor_messages")
      .insert({
        user_id: userId,
        user_text: userMessage,
        bot_reply: reply,
      });
    if (legacyInsertErr) {
      console.error("DB legacy insert error:", legacyInsertErr.message);
      return json({ error: "Unable to record chat usage" }, 500);
    }
  }

  // ── 7. Return reply for guest-mode fallback ─────────────────────────────
  let quota: AdvisorQuotaSnapshot | undefined;
  if (userId) {
    try {
      quota = await getAdvisorMonthlyQuota(supabase, userId);
    } catch (error) {
      console.error("Post-chat quota lookup error:", error);
    }
  }
  return json({ status: "completed", reply, quota }, 200);
});

// ── Helpers ───────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function failRequest(
  supabase: ReturnType<typeof createClient>,
  requestRowId: string | null,
  errorMessage: string,
) {
  if (!requestRowId) return;
  const { error } = await supabase.from("dsemcq_advisor_messages").update({
    status: "failed",
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  }).eq("id", requestRowId);
  if (error) console.error("DB failure update error:", error.message);
}

async function hasAdvisorLifecycleColumns(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "dsemcq_advisor_messages")
    .in("column_name", ["request_id", "status", "error_message", "processing_at", "completed_at"]);

  if (error) {
    console.error("Schema check failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) >= 5;
}



// Supabase Edge Function: dsemcq-advisor-chat
// Calls the Poe OpenAI-compatible API, returns { reply: string }.
// Persists each exchange to dsemcq_advisor_messages via service-role key.
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   POE_API_KEY            — Poe API key (poe.com/api_key)
//   DSE_ADVISOR_BOT_NAME   — Poe bot name to target, e.g. "GPT-4o-Mini" (default)
//   SUPABASE_URL      — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // getUser returns null for guests (anon key ≠ user JWT) — that's ok.
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId: string | null = userData?.user?.id ?? null;

  // ── 2. Monthly limit check for authenticated users ─────────────────────
  if (userId) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [countResp, profileResp] = await Promise.all([
      supabase
        .from("dsemcq_advisor_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("dsemcq_profiles")
        .select("subscription_tier, bonus_ai_chat")
        .eq("id", userId)
        .single(),
    ]);

    const used = countResp.count ?? 0;
    const profile = profileResp.data as { subscription_tier?: string; bonus_ai_chat?: number } | null;
    const tier = profile?.subscription_tier ?? "free";
    const bonusChat = profile?.bonus_ai_chat ?? 0;

    // Read limits from app settings (fall back to defaults if not found)
    let freeMonthlyLimit = 20;
    let premiumMonthlyLimit = 300;
    try {
      const { data: settingsRows } = await supabase
        .from("dsemcq_app_settings")
        .select("key, value")
        .in("key", ["max_ai_chat_basic", "max_ai_chat_premium"]);
      if (settingsRows) {
        for (const row of settingsRows as { key: string; value: unknown }[]) {
          const v = typeof row.value === "number" ? row.value : parseInt(String(row.value), 10);
          if (!Number.isFinite(v)) continue;
          if (row.key === "max_ai_chat_basic") freeMonthlyLimit = v;
          if (row.key === "max_ai_chat_premium") premiumMonthlyLimit = v;
        }
      }
    } catch {
      // Settings table unavailable — use defaults
    }

    const baseLimit = tier === "premium" ? premiumMonthlyLimit : freeMonthlyLimit;
    const monthlyLimit = baseLimit + bonusChat;

    if (used >= monthlyLimit) {
      return json({
        error: tier === "premium"
          ? `學士版每月 ${baseLimit}${bonusChat > 0 ? ` + ${bonusChat} 額外` : ""} 次已用盡。如需更多請聯絡客服。`
          : `庶民版每月限 ${baseLimit}${bonusChat > 0 ? ` + ${bonusChat} 額外` : ""} 次，升級至學士版可享每月 ${premiumMonthlyLimit} 次。`,
        code: "MONTHLY_LIMIT",
      }, 200);
    }
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────
  let body: { message?: string; system?: string; history?: Array<{ role: string; text: string }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userMessage = (body.message ?? "").trim();
  if (!userMessage) return json({ error: "message is required" }, 400);

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

  // ── 4. Call Poe OpenAI-compatible API ─────────────────────────────────
  const poeApiKey = Deno.env.get("POE_API_KEY") ?? "";
  const botName   = Deno.env.get("DSE_ADVISOR_BOT_NAME") ?? DEFAULT_BOT;

  if (!poeApiKey) {
    console.error("POE_API_KEY not set");
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
    return json({ error: "Failed to reach AI service" }, 502);
  }

  if (!poeResp.ok) {
    const errText = await poeResp.text().catch(() => "");
    console.error(`Poe API error ${poeResp.status}:`, errText);
    return json({ error: `AI service error (${poeResp.status}): ${errText.slice(0, 200)}` }, 502);
  }

  // ── 5. Parse JSON response ─────────────────────────────────────────────
  let poeJson: { choices?: Array<{ message?: { content?: string } }> };
  try {
    poeJson = await poeResp.json();
  } catch {
    return json({ error: "Invalid JSON from AI service" }, 502);
  }

  const reply = (poeJson.choices?.[0]?.message?.content ?? "").slice(0, MAX_REPLY_CHARS);

  if (!reply) {
    return json({ error: "Empty reply from AI service" }, 502);
  }

  // ── 6. Persist exchange (authenticated users only — guests not tracked) ──
  if (userId) {
    const { error: dbErr } = await supabase.from("dsemcq_advisor_messages").insert({
      user_id:   userId,
      user_text: userMessage,
      bot_reply: reply,
    });
    if (dbErr) {
      console.error("DB insert error:", dbErr.message);
    }
  }

  // ── 7. Return reply ────────────────────────────────────────────────────
  return json({ reply }, 200);
});

// ── Helpers ───────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}


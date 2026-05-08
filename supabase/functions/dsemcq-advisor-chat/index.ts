// Supabase Edge Function: dsemcq-advisor-chat
// Calls the Poe HTTP API, collects the SSE stream, returns { reply: string }.
// Persists each exchange to dsemcq_advisor_messages via service-role key.
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   POE_API_KEY       — Poe API key (poe.com/api_key)
//   POE_BOT_NAME      — Poe bot name to target, e.g. "Claude-3-Sonnet" (default)
//   SUPABASE_URL      — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POE_BASE_URL = "https://api.poe.com/bot/";
const DEFAULT_BOT  = "Claude-3-Sonnet";
const MAX_REPLY_CHARS = 1200; // hard-cap to stay within 200 Chinese chars ≈ 600 bytes

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

  // ── 1. Auth: verify Supabase JWT ────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Unauthorised" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) return json({ error: "Unauthorised" }, 401);

  const userId = userData.user.id;

  // ── 2. Parse body ──────────────────────────────────────────────────────
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

  // ── 3. Build Poe protocol query ────────────────────────────────────────
  // Poe roles: "user" | "bot" | "system"
  const poeMessages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    poeMessages.push({ role: "system", content: systemPrompt });
  }

  // Append conversation history (last 6 messages, mapped to Poe roles)
  for (const m of history) {
    poeMessages.push({
      role:    m.role === "assistant" ? "bot" : "user",
      content: m.text,
    });
  }

  // Current user turn
  poeMessages.push({ role: "user", content: userMessage });

  const poePayload = {
    version:         "1.0",
    type:            "query",
    query:           poeMessages,
    user_id:         userId,
    conversation_id: `conv-${userId}-${Date.now()}`,
    message_id:      `msg-${userId}-${Date.now()}`,
  };

  // ── 4. Call Poe HTTP API ───────────────────────────────────────────────
  const poeApiKey = Deno.env.get("POE_API_KEY") ?? "";
  const botName   = Deno.env.get("POE_BOT_NAME") ?? DEFAULT_BOT;

  if (!poeApiKey) {
    console.error("POE_API_KEY not set");
    return json({ error: "AI service not configured" }, 503);
  }

  let poeResp: Response;
  try {
    poeResp = await fetch(`${POE_BASE_URL}${encodeURIComponent(botName)}`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${poeApiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "text/event-stream",
      },
      body: JSON.stringify(poePayload),
    });
  } catch (e) {
    console.error("Poe fetch error:", e);
    return json({ error: "Failed to reach AI service" }, 502);
  }

  if (!poeResp.ok) {
    const errText = await poeResp.text().catch(() => "");
    console.error(`Poe API error ${poeResp.status}:`, errText);
    return json({ error: `AI service error (${poeResp.status})` }, 502);
  }

  // ── 5. Read SSE stream, accumulate text chunks ─────────────────────────
  const reply = await readPoeStream(poeResp);

  if (!reply) {
    return json({ error: "Empty reply from AI service" }, 502);
  }

  // ── 6. Persist exchange to dsemcq_advisor_messages ────────────────────
  const { error: dbErr } = await supabase.from("dsemcq_advisor_messages").insert({
    user_id:   userId,
    user_text: userMessage,
    bot_reply: reply,
  });

  if (dbErr) {
    // Non-fatal: log and continue — client still gets the reply
    console.error("DB insert error:", dbErr.message);
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

/**
 * Reads a Poe SSE response body and concatenates all `text` event chunks.
 * Poe SSE format:
 *   event: text\n
 *   data: {"text":"chunk"}\n\n
 *   event: done\n
 *   data: {}\n\n
 */
async function readPoeStream(resp: Response): Promise<string> {
  const reader  = resp.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let   buffer  = "";
  let   reply   = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:") && currentEvent === "text") {
        try {
          const parsed = JSON.parse(line.slice(5).trim()) as { text?: string };
          if (parsed.text) reply += parsed.text;
        } catch {
          // malformed chunk — skip
        }
        currentEvent = "";
      } else if (line.startsWith("data:") && currentEvent === "done") {
        // Stream finished
        reader.cancel();
        return reply.slice(0, MAX_REPLY_CHARS);
      }
    }
  }

  return reply.slice(0, MAX_REPLY_CHARS);
}

// Supabase Edge Function: dsemcq-broadcast-announcement
//
// Admin-only. Writes a new row to dsemcq_announcements then fans out an Expo
// push notification to every token in dsemcq_push_tokens.
//
// Required env vars (auto-injected):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Optional:
//   EXPO_ACCESS_TOKEN — Expo push access token for higher throughput
//
// Request body:
//   {
//     title:     string,
//     body:      string,
//     type?:     "info" | "warning" | "success"   (default "info")
//     audience?: "all" | "free" | "premium"        (default "all")
//   }
//
// Response:
//   { ok: true, announcementId: string, recipients: number }
//   { ok: false, error: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_BATCH_SIZE = 100; // Expo recommends ≤100 messages per request

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // ── 1. Auth + admin gate ────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ ok: false, error: "Unauthorised" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ ok: false, error: "Invalid token" }, 401);

  const { data: profile } = await supabase
    .from("dsemcq_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "admin") return json({ ok: false, error: "Admin role required" }, 403);

  // ── 2. Validate input ───────────────────────────────────────────────────
  let body: { title?: string; body?: string; type?: string; audience?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const title = (body.title ?? "").trim();
  const text = (body.body ?? "").trim();
  const type = (["info", "warning", "success"].includes(body.type ?? "")
    ? body.type
    : "info") as "info" | "warning" | "success";
  const audience = (["all", "free", "premium"].includes(body.audience ?? "")
    ? body.audience
    : "all") as "all" | "free" | "premium";
  if (!title || !text) return json({ ok: false, error: "title and body required" }, 400);

  // ── 3. Fetch push tokens (filtered by audience / subscription_tier) ─────
  let tokens: string[];
  if (audience === "all") {
    const { data: tokenRows, error: tokensErr } = await supabase
      .from("dsemcq_push_tokens")
      .select("expo_push_token");
    if (tokensErr) return json({ ok: false, error: tokensErr.message }, 500);
    tokens = ((tokenRows ?? []) as { expo_push_token: string }[]).map((r) => r.expo_push_token);
  } else {
    // Join push_tokens → profiles, filter by subscription_tier
    const { data: tokenRows, error: tokensErr } = await supabase
      .from("dsemcq_push_tokens")
      .select("expo_push_token, dsemcq_profiles!inner(subscription_tier)")
      .eq("dsemcq_profiles.subscription_tier", audience);
    if (tokensErr) return json({ ok: false, error: tokensErr.message }, 500);
    tokens = ((tokenRows ?? []) as { expo_push_token: string }[]).map((r) => r.expo_push_token);
  }

  // ── 4. Insert announcement row ──────────────────────────────────────────
  const { data: announcement, error: insertErr } = await supabase
    .from("dsemcq_announcements")
    .insert({
      title,
      body: text,
      type,
      audience,
      sent_by: userData.user.id,
      push_sent: tokens.length > 0,
      recipients: tokens.length,
    })
    .select()
    .single();
  if (insertErr || !announcement) {
    return json({ ok: false, error: insertErr?.message ?? "insert failed" }, 500);
  }

  // ── 5. Fan-out to Expo push API ─────────────────────────────────────────
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  for (let i = 0; i < tokens.length; i += PUSH_BATCH_SIZE) {
    const batch = tokens.slice(i, i + PUSH_BATCH_SIZE).map((to) => ({
      to,
      title,
      body: text,
      sound: "default",
      data: { announcementId: announcement.id, type },
    }));
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
    } catch (err) {
      console.warn("expo push batch failed:", (err as Error).message);
    }
  }

  return json({ ok: true, announcementId: announcement.id, recipients: tokens.length }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

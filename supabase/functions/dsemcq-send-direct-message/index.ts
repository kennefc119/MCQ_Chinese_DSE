// Supabase Edge Function: dsemcq-send-direct-message
//
// Admin-only. Writes a row to dsemcq_inbox for a specific user, then sends
// an Expo push notification to that user's registered device (if any).
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
//     target_user_id: string,         // UUID of the recipient
//     title:          string,
//     body:           string,
//     type?:          "info" | "warning" | "success"   (default "info")
//   }
//
// Response:
//   { ok: true,  inboxId: string, pushed: boolean }
//   { ok: false, error: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200, CORS);
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
  let body: { target_user_id?: string; title?: string; body?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const targetUserId = (body.target_user_id ?? "").trim();
  const title = (body.title ?? "").trim();
  const text = (body.body ?? "").trim();
  const type = (["info", "warning", "success"].includes(body.type ?? "")
    ? body.type
    : "info") as "info" | "warning" | "success";

  if (!targetUserId) return json({ ok: false, error: "target_user_id required" }, 400);
  if (!title || !text) return json({ ok: false, error: "title and body required" }, 400);

  // ── 3. Verify target user exists ────────────────────────────────────────
  const { data: targetProfile, error: profileErr } = await supabase
    .from("dsemcq_profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (profileErr || !targetProfile) return json({ ok: false, error: "Target user not found" }, 404);

  // ── 4. Insert inbox message ─────────────────────────────────────────────
  const { data: inboxRow, error: insertErr } = await supabase
    .from("dsemcq_inbox")
    .insert({
      user_id: targetUserId,
      title,
      body: text,
      type,
      read: false,
    })
    .select("id")
    .single();
  if (insertErr || !inboxRow) {
    return json({ ok: false, error: insertErr?.message ?? "inbox insert failed" }, 500);
  }

  // ── 5. Send push notification to target user (if token exists) ─────────
  const { data: tokenRow } = await supabase
    .from("dsemcq_push_tokens")
    .select("expo_push_token")
    .eq("user_id", targetUserId)
    .maybeSingle();

  let pushed = false;
  if (tokenRow?.expo_push_token) {
    const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify([{
          to: tokenRow.expo_push_token,
          title,
          body: text,
          sound: "default",
          data: { inboxId: inboxRow.id, type },
        }]),
      });
      pushed = true;
    } catch (err) {
      console.warn("expo push failed:", (err as Error).message);
    }
  }

  return json({ ok: true, inboxId: inboxRow.id, pushed }, 200);
});

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extraHeaders },
  });
}

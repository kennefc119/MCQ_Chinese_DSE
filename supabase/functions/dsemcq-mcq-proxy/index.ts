// Supabase Edge Function: dsemcq-mcq-proxy
//
// Proxies authenticated admin requests from the mobile app to the local/hosted
// FastAPI MCQ generator. Verifies the caller's Supabase JWT, confirms
// role='admin' in dsemcq_profiles, then forwards the request with a shared
// X-Admin-Secret header that FastAPI checks (see backend/mcq_generator/mcq_gen/server.py).
//
// Required env vars (Supabase Dashboard → Edge Functions → Secrets):
//   MCQ_GENERATOR_URL      — base URL of the FastAPI server (e.g. https://gen.example.com)
//   MCQ_ADMIN_SECRET       — shared secret matching the server's MCQ_ADMIN_SECRET
//   SUPABASE_URL           — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Request body (from the app):
//   { path: "/api/generate", method: "POST", payload?: {...} }
//
// Response:
//   { ok: true,  status: 200, data: <upstream json> }
//   { ok: false, status: 4xx/5xx, error: "..." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PATH_PREFIXES = ["/api/"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // ── 1. Auth: extract JWT, require admin ─────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ ok: false, error: "Unauthorised" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ ok: false, error: "Invalid token" }, 401);

  const { data: profile, error: profileErr } = await supabase
    .from("dsemcq_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || profile?.role !== "admin") {
    return json({ ok: false, error: "Admin role required" }, 403);
  }

  // ── 2. Parse + validate request body ────────────────────────────────────
  let body: { path?: string; method?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  const path = (body.path ?? "").trim();
  const method = (body.method ?? "GET").toUpperCase();
  if (!path.startsWith("/")) return json({ ok: false, error: "path must start with /" }, 400);
  if (!ALLOWED_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    return json({ ok: false, error: "path not allowed" }, 400);
  }
  if (!["GET", "POST"].includes(method)) {
    return json({ ok: false, error: "method must be GET or POST" }, 400);
  }

  // ── 3. Forward to FastAPI ────────────────────────────────────────────────
  const base = Deno.env.get("MCQ_GENERATOR_URL");
  const secret = Deno.env.get("MCQ_ADMIN_SECRET");
  if (!base || !secret) {
    return json({ ok: false, error: "Generator not configured" }, 500);
  }
  const targetUrl = base.replace(/\/$/, "") + path;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
    },
  };
  if (method === "POST" && body.payload !== undefined) {
    init.body = JSON.stringify(body.payload);
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    return json({ ok: false, error: `Upstream unreachable: ${(err as Error).message}` }, 502);
  }

  const text = await upstream.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* leave as text */
  }

  if (!upstream.ok) {
    return json(
      { ok: false, status: upstream.status, error: typeof data === "string" ? data : JSON.stringify(data) },
      200, // we wrap upstream errors in a 200 with ok:false for easier client handling
    );
  }
  return json({ ok: true, status: upstream.status, data }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

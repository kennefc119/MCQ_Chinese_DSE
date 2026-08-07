import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  retrieveSource,
  normalizePerformanceDetailRequest,
  normalizeQuestionBankDetailRequest,
  normalizeRetrievalHints,
  resolvePassageScope,
  type Source,
} from "../_shared/advisor_v2_context.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-advisor-v2-worker-secret",
};

const ALLOWED_SOURCES: Source[] = ["profile", "performance", "question_bank"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const workerSecret = Deno.env.get("DSE_ADVISOR_V2_WORKER_SECRET") ?? "";
  if (!workerSecret || req.headers.get("x-advisor-v2-worker-secret") !== workerSecret) {
    return json({ error: "Unauthorised", code: "WORKER_SECRET_MISMATCH" }, 401);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const claims = parseBearerClaims(authHeader);
  if (!claims) {
    return json({ error: "Unauthorised", code: "AUTH_TOKEN_INVALID" }, 401);
  }
  if (claims.role !== "service_role") {
    return json({ error: "Unauthorised", code: "SERVICE_ROLE_REQUIRED" }, 401);
  }

  let body: {
    userId?: string;
    studentMessage?: string;
    sources?: string[];
    performanceDetailRequest?: unknown;
    questionBankDetailRequest?: unknown;
    retrievalHints?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userId = (body.userId ?? "").trim();
  const studentMessage = (body.studentMessage ?? "").trim();
  const sourceSet = Array.isArray(body.sources) ? body.sources : [];
  const sources = sourceSet.filter((source): source is Source => ALLOWED_SOURCES.includes(source as Source));
  const performanceDetailRequest = normalizePerformanceDetailRequest(body.performanceDetailRequest);
  const questionBankDetailRequest = normalizeQuestionBankDetailRequest(body.questionBankDetailRequest);
  const retrievalHints = normalizeRetrievalHints(body.retrievalHints);
  if (!userId) return json({ error: "userId is required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const contexts: Record<string, unknown> = {};
    const resolvedPassageScope = await resolvePassageScope(supabase, retrievalHints ?? undefined);
    for (const source of sources) {
      contexts[source] = await retrieveSource(
        supabase,
        userId,
        source,
        studentMessage,
        {
          retrievalHints: retrievalHints ?? undefined,
          resolvedPassageScope,
          performanceDetailRequest: source === "performance" ? performanceDetailRequest ?? undefined : undefined,
          questionBankDetailRequest: source === "question_bank" ? questionBankDetailRequest ?? undefined : undefined,
        },
      );
    }
    return json({ ok: true, userId, contexts });
  } catch (error) {
    console.error("Advisor V2 context failed", { userId, error: String(error) });
    return json({ ok: false, error: "Context retrieval failed", detail: String(error) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function parseBearerClaims(authHeader: string): Record<string, unknown> | null {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = base64UrlDecode(parts[1]);
    const value = JSON.parse(payload);
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

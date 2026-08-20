import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
  if (!webhookSecret) return json({ ok: false, error: "Webhook secret not configured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (token !== webhookSecret) return json({ ok: false, error: "Unauthorized" }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const event = payload?.event ?? payload;
  if (!event || typeof event !== "object") {
    return json({ ok: false, error: "Missing event payload" }, 400);
  }

  const eventType = String(event.type ?? "").trim() || "UNKNOWN";
  const eventTime = pickEventTime(event);

  const rawAppUserId = String(
    event.app_user_id ?? event.original_app_user_id ?? ""
  ).trim();
  const appUserId = isUuid(rawAppUserId) ? rawAppUserId : null;

  const providerEventId = String(
    event.id
      ?? event.event_id
      ?? event.transaction_id
      ?? event.original_transaction_id
      ?? `${eventType}:${eventTime.toISOString()}:${rawAppUserId || "unknown"}`
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const expirationAt = pickOptionalDate(event.expiration_at_ms, event.expiration_at);
  const productId = String(event.product_id ?? "").trim() || null;
  const willRenew = eventType === "CANCELLATION"
    || eventType === "EXPIRATION"
    || eventType === "REFUND"
    || eventType === "SUBSCRIPTION_PAUSED"
    || eventType === "NON_RENEWING_PURCHASE"
      ? false
      : eventType === "INITIAL_PURCHASE"
        || eventType === "RENEWAL"
        || eventType === "PRODUCT_CHANGE"
        || eventType === "UNCANCELLATION"
        ? true
        : null;

  const { data, error } = await supabase.rpc("apply_revenuecat_subscription_event", {
    p_provider_event_id: providerEventId,
    p_app_user_id: appUserId,
    p_event_type: eventType,
    p_event_time: eventTime.toISOString(),
    p_expiration_at: expirationAt?.toISOString() ?? null,
    p_product_id: productId,
    p_will_renew: willRenew,
    p_raw_payload: payload,
  });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json(data ?? { ok: true }, 200);
});

function pickEventTime(event: any): Date {
  const msCandidate = Number(
    event.event_timestamp_ms
      ?? event.purchased_at_ms
      ?? event.expiration_at_ms
      ?? event.original_purchase_at_ms
      ?? 0
  );

  if (Number.isFinite(msCandidate) && msCandidate > 0) {
    return new Date(msCandidate);
  }

  const isoCandidate = String(
    event.event_timestamp
      ?? event.purchased_at
      ?? event.expiration_at
      ?? ""
  ).trim();

  const parsed = isoCandidate ? new Date(isoCandidate) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;

  return new Date();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function pickOptionalDate(msValue: unknown, isoValue: unknown): Date | null {
  const milliseconds = Number(msValue ?? 0);
  if (Number.isFinite(milliseconds) && milliseconds > 0) {
    const parsed = new Date(milliseconds);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const iso = String(isoValue ?? "").trim();
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_EVENT_TYPES = new Set<string>([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
]);

const INACTIVE_EVENT_TYPES = new Set<string>([
  "EXPIRATION",
  "REFUND",
  "SUBSCRIPTION_PAUSED",
]);

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

  const insertResp = await supabase
    .from("dsemcq_subscription_events")
    .insert({
      provider: "revenuecat",
      provider_event_id: providerEventId,
      app_user_id: appUserId,
      event_type: eventType,
      event_time: eventTime.toISOString(),
      outcome: "received",
      raw_payload: payload,
    });

  if (insertResp.error) {
    if (insertResp.error.code === "23505") {
      return json({ ok: true, duplicate: true }, 200);
    }
    return json({ ok: false, error: insertResp.error.message }, 500);
  }

  if (!appUserId) {
    await markOutcome(supabase, providerEventId, "ignored_invalid_user", null);
    return json({ ok: true, ignored: "invalid_app_user_id" }, 200);
  }

  const profileResp = await supabase
    .from("dsemcq_profiles")
    .select("id, subscription_event_at")
    .eq("id", appUserId)
    .maybeSingle();

  if (profileResp.error) {
    await markOutcome(supabase, providerEventId, "error_profile_lookup", profileResp.error.message);
    return json({ ok: false, error: profileResp.error.message }, 500);
  }

  if (!profileResp.data) {
    await markOutcome(supabase, providerEventId, "ignored_profile_not_found", null);
    return json({ ok: true, ignored: "profile_not_found" }, 200);
  }

  const lastEventAt = profileResp.data.subscription_event_at
    ? new Date(profileResp.data.subscription_event_at)
    : null;

  if (lastEventAt && eventTime.getTime() < lastEventAt.getTime()) {
    await markOutcome(supabase, providerEventId, "ignored_stale_event", null);
    return json({ ok: true, ignored: "stale_event" }, 200);
  }

  if (ACTIVE_EVENT_TYPES.has(eventType)) {
    const patch = {
      subscription_tier: "premium",
      subscription_status: "active",
      subscription_event_at: eventTime.toISOString(),
    };
    const upd = await supabase.from("dsemcq_profiles").update(patch).eq("id", appUserId);
    if (upd.error) {
      await markOutcome(supabase, providerEventId, "error_profile_update_active", upd.error.message);
      return json({ ok: false, error: upd.error.message }, 500);
    }
    await markOutcome(supabase, providerEventId, "applied_active", null);
    return json({ ok: true, applied: "active" }, 200);
  }

  if (INACTIVE_EVENT_TYPES.has(eventType)) {
    const patch = {
      subscription_tier: "free",
      subscription_status: "inactive",
      subscription_event_at: eventTime.toISOString(),
    };
    const upd = await supabase.from("dsemcq_profiles").update(patch).eq("id", appUserId);
    if (upd.error) {
      await markOutcome(supabase, providerEventId, "error_profile_update_inactive", upd.error.message);
      return json({ ok: false, error: upd.error.message }, 500);
    }
    await markOutcome(supabase, providerEventId, "applied_inactive", null);
    return json({ ok: true, applied: "inactive" }, 200);
  }

  // For cancellation intent and other non-state-final events, keep current state.
  await markOutcome(supabase, providerEventId, "ignored_no_state_change", null);
  return json({ ok: true, ignored: "no_state_change" }, 200);
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

async function markOutcome(
  supabase: ReturnType<typeof createClient>,
  providerEventId: string,
  outcome: string,
  error: string | null,
) {
  const details = error ? { outcome: `${outcome}:${error}`.slice(0, 2000) } : { outcome };
  await supabase
    .from("dsemcq_subscription_events")
    .update({ ...details, processed_at: new Date().toISOString() })
    .eq("provider", "revenuecat")
    .eq("provider_event_id", providerEventId);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

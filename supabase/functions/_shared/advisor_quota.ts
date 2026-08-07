import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AdvisorQuotaSnapshot = {
  used: number;
  limit: number;
  remaining: number;
};

export async function getAdvisorMonthlyQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdvisorQuotaSnapshot> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthStart = startOfMonth.toISOString();

  const v1LifecycleCount = await supabase
      .from("dsemcq_advisor_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart)
      .in("status", ["processing", "completed"]);
  const v1Count = v1LifecycleCount.error
    ? await supabase
      .from("dsemcq_advisor_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart)
    : v1LifecycleCount;

  const [v2Count, profileResult, settingsResult] = await Promise.all([
    supabase
      .from("dsemcq_advisor_v2_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart)
      .in("status", ["processing", "completed"]),
    supabase
      .from("dsemcq_profiles")
      .select("subscription_tier, bonus_ai_chat")
      .eq("id", userId)
      .single(),
    supabase
      .from("dsemcq_app_settings")
      .select("key, value")
      .in("key", ["max_ai_chat_basic", "max_ai_chat_premium"]),
  ]);
  if (v1Count.error) throw v1Count.error;
  if (v2Count.error) throw v2Count.error;
  if (profileResult.error) throw profileResult.error;
  if (settingsResult.error) throw settingsResult.error;

  let freeMonthlyLimit = 20;
  let premiumMonthlyLimit = 300;
  for (const row of (settingsResult.data ?? []) as Array<{ key: string; value: unknown }>) {
    const value = typeof row.value === "number" ? row.value : Number.parseInt(String(row.value), 10);
    if (!Number.isFinite(value)) continue;
    if (row.key === "max_ai_chat_basic") freeMonthlyLimit = value;
    if (row.key === "max_ai_chat_premium") premiumMonthlyLimit = value;
  }

  const profile = profileResult.data as { subscription_tier?: string; bonus_ai_chat?: number } | null;
  const baseLimit = profile?.subscription_tier === "premium" ? premiumMonthlyLimit : freeMonthlyLimit;
  const limit = baseLimit + Number(profile?.bonus_ai_chat ?? 0);
  const used = (v1Count.count ?? 0) + (v2Count.count ?? 0);
  return { used, limit, remaining: Math.max(0, limit - used) };
}
/**
 * adminService.ts — admin-only data helpers.
 *
 * All functions assume Supabase is configured and the caller has role='admin'.
 * RLS at the DB level enforces this; the app should additionally gate the UI
 * via `useAuth().isAdmin`.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import {
  Profile,
  Announcement,
  AnnouncementType,
  AttemptHistoryItem,
  UsageWindowMetrics,
  UserSkillStat,
  UserDifficultyStat,
  UserPassageStat,
  PsychResult,
} from "../types/database";
import * as Application from "expo-application";
import { Platform } from "react-native";

const REQUIRE_SUPABASE = "[admin] Supabase not configured";

// ── Usage insights ──────────────────────────────────────────────────────────

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Fetch active/new/login/visitor metrics over the given window. */
export async function fetchUsageMetrics(windowDays: number): Promise<UsageWindowMetrics> {
  if (!isSupabaseConfigured) {
    return { windowDays, activeUsers: 0, newUsers: 0, loginEvents: 0, visitorDevices: 0, chatUsers: 0, chatMessages: 0 };
  }
  const since = isoDaysAgo(windowDays);

  // Distinct users with submitted attempts in window
  const { data: attemptRows } = await supabase
    .from("dsemcq_attempts")
    .select("user_id")
    .gte("started_at", since);
  const activeUsers = new Set((attemptRows ?? []).map((r: { user_id: string }) => r.user_id)).size;

  // New profiles created in window
  const { count: newUsers } = await supabase
    .from("dsemcq_profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  // Login events count in window
  const { count: loginEvents } = await supabase
    .from("dsemcq_login_events")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", since);

  // Distinct visitor (anonymous) device ids in window
  const { data: visitRows } = await supabase
    .from("dsemcq_visit_events")
    .select("device_id, user_id")
    .is("user_id", null)
    .gte("occurred_at", since);
  const visitorDevices = new Set(
    (visitRows ?? []).map((r: { device_id: string }) => r.device_id)
  ).size;

  // Chatbot: distinct users + total exchanges in window
  const { data: chatRows } = await supabase
    .from("dsemcq_advisor_messages")
    .select("user_id")
    .gte("created_at", since);
  const chatUsers = new Set((chatRows ?? []).map((r: { user_id: string }) => r.user_id)).size;
  const chatMessages = (chatRows ?? []).length;

  return {
    windowDays,
    activeUsers,
    newUsers: newUsers ?? 0,
    loginEvents: loginEvents ?? 0,
    visitorDevices,
    chatUsers,
    chatMessages,
  };
}

// ── Visit / login event logging (called from AuthContext) ───────────────────

export async function logVisit(deviceId: string, userId: string | null, platform: string | null) {
  if (!isSupabaseConfigured) return;
  await supabase.from("dsemcq_visit_events").insert({
    device_id: deviceId,
    user_id: userId,
    event_type: "open",
    platform,
  });
}

export async function logLogin(userId: string, platform: string | null) {
  if (!isSupabaseConfigured) return;
  await supabase.from("dsemcq_login_events").insert({ user_id: userId, platform });
}

// ── Push token registration ─────────────────────────────────────────────────

export async function upsertPushToken(userId: string, token: string, platform: string | null) {
  if (!isSupabaseConfigured) return;
  await supabase.from("dsemcq_push_tokens").upsert(
    { user_id: userId, expo_push_token: token, platform, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

// ── Announcements ───────────────────────────────────────────────────────────

export async function listAnnouncements(): Promise<Announcement[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("dsemcq_announcements")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (error) console.warn("[admin] listAnnouncements:", error.message);
  return (data as Announcement[]) ?? [];
}

/** Sends a broadcast announcement by invoking the dsemcq-broadcast-announcement Edge Function. */
export async function sendBroadcast(args: {
  title: string;
  body: string;
  type: AnnouncementType;
}): Promise<{ ok: boolean; recipients: number; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, recipients: 0, error: REQUIRE_SUPABASE };
  const { data, error } = await supabase.functions.invoke("dsemcq-broadcast-announcement", {
    body: args,
  });
  if (error) return { ok: false, recipients: 0, error: error.message };
  return { ok: true, recipients: (data as { recipients?: number })?.recipients ?? 0 };
}

/** Mark a broadcast announcement as read for the current user. */
export async function markAnnouncementRead(userId: string, announcementId: string) {
  if (!isSupabaseConfigured) return;
  await supabase.from("dsemcq_announcement_reads").upsert(
    { user_id: userId, announcement_id: announcementId, read_at: new Date().toISOString() },
    { onConflict: "user_id,announcement_id" }
  );
}

/** Unread broadcast announcements for the current user. */
export async function listUnreadAnnouncements(userId: string): Promise<Announcement[]> {
  if (!isSupabaseConfigured) return [];
  const { data: reads } = await supabase
    .from("dsemcq_announcement_reads")
    .select("announcement_id")
    .eq("user_id", userId);
  const readIds = new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id));
  const { data } = await supabase
    .from("dsemcq_announcements")
    .select("*")
    .order("sent_at", { ascending: false });
  return ((data as Announcement[]) ?? []).filter((a) => !readIds.has(a.id));
}

// ── User search & detail ────────────────────────────────────────────────────

export async function searchUsers(query: string, limit = 50): Promise<Profile[]> {
  if (!isSupabaseConfigured) return [];
  const q = query.trim();
  let req = supabase
    .from("dsemcq_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (q.length > 0) {
    // username or email contains query (case-insensitive)
    const safe = q.replace(/[%,]/g, "");
    req = req.or(`username.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  const { data, error } = await req;
  if (error) console.warn("[admin] searchUsers:", error.message);
  return (data as Profile[]) ?? [];
}

export async function getUserProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.from("dsemcq_profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

/** Admin update of mutable profile fields. */
export async function updateUserProfile(
  userId: string,
  patch: Partial<Pick<Profile, "wenyuan_points" | "subscription_tier" | "subscription_status" | "role">>
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: REQUIRE_SUPABASE };
  const { error } = await supabase.from("dsemcq_profiles").update(patch).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── User attempt history & stats ────────────────────────────────────────────

export async function fetchUserAttemptHistory(
  userId: string,
  page: number,
  pageSize: number
): Promise<{ items: AttemptHistoryItem[]; total: number }> {
  if (!isSupabaseConfigured) return { items: [], total: 0 };
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from("dsemcq_attempts")
    .select("id, quiz_id, score, total, status, started_at, submitted_at, time_spent_seconds", {
      count: "exact",
    })
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .range(from, to);
  if (error) console.warn("[admin] fetchUserAttemptHistory:", error.message);

  const attempts = (data ?? []) as Array<{
    id: string;
    quiz_id: string;
    score: number | null;
    total: number;
    status: AttemptHistoryItem["status"];
    started_at: string;
    submitted_at: string | null;
    time_spent_seconds: number | null;
  }>;

  // Hydrate quiz titles + passage info in one go
  const quizIds = [...new Set(attempts.map((a) => a.quiz_id))];
  let quizMap: Record<string, { title: string; passage_id: string | null }> = {};
  let passageMap: Record<string, string> = {};
  if (quizIds.length > 0) {
    const { data: quizzes } = await supabase
      .from("dsemcq_quizzes")
      .select("id, title, passage_id")
      .in("id", quizIds);
    quizMap = Object.fromEntries(
      ((quizzes ?? []) as { id: string; title: string; passage_id: string | null }[]).map((q) => [
        q.id,
        { title: q.title, passage_id: q.passage_id },
      ])
    );
    const passageIds = [...new Set(Object.values(quizMap).map((q) => q.passage_id).filter(Boolean) as string[])];
    if (passageIds.length > 0) {
      const { data: passages } = await supabase
        .from("dsemcq_passages")
        .select("id, title")
        .in("id", passageIds);
      passageMap = Object.fromEntries(
        ((passages ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title])
      );
    }
  }

  const items: AttemptHistoryItem[] = attempts.map((a) => {
    const quiz = quizMap[a.quiz_id];
    const passageId = quiz?.passage_id ?? null;
    return {
      attempt_id: a.id,
      quiz_id: a.quiz_id,
      quiz_title: quiz?.title ?? a.quiz_id,
      passage_id: passageId,
      passage_title: passageId ? passageMap[passageId] ?? null : null,
      score: a.score,
      total: a.total,
      percentage: a.score == null || a.total === 0 ? -1 : Math.round((a.score / a.total) * 100),
      status: a.status,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
      time_spent_seconds: a.time_spent_seconds,
    };
  });

  return { items, total: count ?? items.length };
}

/** Per-skill, per-difficulty, per-passage stats for the report-card view. */
export async function fetchUserPerformanceBreakdown(userId: string): Promise<{
  skills: UserSkillStat[];
  difficulties: UserDifficultyStat[];
  passages: UserPassageStat[];
}> {
  if (!isSupabaseConfigured) return { skills: [], difficulties: [], passages: [] };

  // Pull all the user's answers (submitted attempts only)
  const { data: attemptIdsData } = await supabase
    .from("dsemcq_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "submitted");
  const attemptIds = ((attemptIdsData ?? []) as { id: string }[]).map((a) => a.id);
  if (attemptIds.length === 0) return { skills: [], difficulties: [], passages: [] };

  const { data: answerRows } = await supabase
    .from("dsemcq_attempt_answers")
    .select("question_id, is_correct")
    .in("attempt_id", attemptIds);

  const answers = ((answerRows ?? []) as { question_id: string; is_correct: boolean | null }[]).filter(
    (r) => r.is_correct !== null
  );
  if (answers.length === 0) return { skills: [], difficulties: [], passages: [] };

  const questionIds = [...new Set(answers.map((a) => a.question_id))];

  // Fetch question metadata + tag mappings + tag labels + passages in parallel
  const [{ data: qRows }, { data: tagRows }, { data: tagDefs }] = await Promise.all([
    supabase.from("dsemcq_questions").select("id, passage_id, difficulty").in("id", questionIds),
    supabase.from("dsemcq_question_tags").select("question_id, tag_id").in("question_id", questionIds),
    supabase.from("dsemcq_tags").select("id, label"),
  ]);

  const qMeta: Record<string, { passage_id: string | null; difficulty: number }> = {};
  for (const q of (qRows ?? []) as { id: string; passage_id: string | null; difficulty: number }[]) {
    qMeta[q.id] = { passage_id: q.passage_id, difficulty: q.difficulty };
  }
  const tagByQ: Record<string, string[]> = {};
  for (const t of (tagRows ?? []) as { question_id: string; tag_id: string }[]) {
    if (!tagByQ[t.question_id]) tagByQ[t.question_id] = [];
    tagByQ[t.question_id].push(t.tag_id);
  }
  const tagLabel: Record<string, string> = Object.fromEntries(
    ((tagDefs ?? []) as { id: string; label: string }[]).map((t) => [t.id, t.label])
  );

  // Hydrate passage titles
  const passageIds = [...new Set(Object.values(qMeta).map((m) => m.passage_id).filter(Boolean) as string[])];
  let passageTitle: Record<string, string> = {};
  if (passageIds.length > 0) {
    const { data: passages } = await supabase
      .from("dsemcq_passages")
      .select("id, title")
      .in("id", passageIds);
    passageTitle = Object.fromEntries(
      ((passages ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title])
    );
  }

  // Aggregate
  const skillBuckets: Record<string, { attempted: number; correct: number }> = {};
  const diffBuckets: Record<number, { attempted: number; correct: number }> = {};
  const passageBuckets: Record<string, { attempted: number; correct: number }> = {};

  for (const a of answers) {
    const meta = qMeta[a.question_id];
    if (!meta) continue;
    const correct = a.is_correct ? 1 : 0;

    // skills
    for (const tag of tagByQ[a.question_id] ?? []) {
      if (!skillBuckets[tag]) skillBuckets[tag] = { attempted: 0, correct: 0 };
      skillBuckets[tag].attempted += 1;
      skillBuckets[tag].correct += correct;
    }

    // difficulty
    if (!diffBuckets[meta.difficulty]) diffBuckets[meta.difficulty] = { attempted: 0, correct: 0 };
    diffBuckets[meta.difficulty].attempted += 1;
    diffBuckets[meta.difficulty].correct += correct;

    // passage
    if (meta.passage_id) {
      if (!passageBuckets[meta.passage_id]) passageBuckets[meta.passage_id] = { attempted: 0, correct: 0 };
      passageBuckets[meta.passage_id].attempted += 1;
      passageBuckets[meta.passage_id].correct += correct;
    }
  }

  const skills: UserSkillStat[] = Object.entries(skillBuckets).map(([tag_id, v]) => ({
    tag_id,
    tag_label: tagLabel[tag_id] ?? tag_id,
    attempted: v.attempted,
    correct: v.correct,
    accuracy: v.attempted === 0 ? 0 : v.correct / v.attempted,
  }));
  const difficulties: UserDifficultyStat[] = Object.entries(diffBuckets)
    .map(([d, v]) => ({
      difficulty: Number(d),
      attempted: v.attempted,
      correct: v.correct,
      accuracy: v.attempted === 0 ? 0 : v.correct / v.attempted,
    }))
    .sort((a, b) => a.difficulty - b.difficulty);
  const passages: UserPassageStat[] = Object.entries(passageBuckets).map(([passage_id, v]) => ({
    passage_id,
    passage_title: passageTitle[passage_id] ?? passage_id,
    attempted: v.attempted,
    correct: v.correct,
    accuracy: v.attempted === 0 ? 0 : v.correct / v.attempted,
  }));

  return { skills, difficulties, passages };
}

/** Read a user's psychometric test results (any user, admin-only via RLS). */
export async function fetchUserPsychResults(userId: string): Promise<PsychResult[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("dsemcq_psych_user_results")
    .select("id, user_id, test_id, result_code, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });
  if (error) console.warn("[admin] fetchUserPsychResults:", error.message);
  return (data as PsychResult[]) ?? [];
}

// ── MCQ Generator proxy (calls dsemcq-mcq-proxy edge function) ──────────────

/**
 * Invokes the dsemcq-mcq-proxy edge function which forwards to the FastAPI generator.
 * `path` is the FastAPI route (e.g. "/api/generate"), `method` is GET/POST.
 */
export async function generatorProxy<T = unknown>(
  path: string,
  method: "GET" | "POST",
  payload?: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  if (!isSupabaseConfigured) return { ok: false, error: REQUIRE_SUPABASE };
  const body = { path, method, payload };
  const { data, error } = await supabase.functions.invoke("dsemcq-mcq-proxy", { body });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok: boolean; status?: number; data?: T; error?: string };
  if (!res.ok) return { ok: false, error: res.error ?? "proxy error", status: res.status };
  return { ok: true, data: res.data as T };
}

// Convenience wrappers
export const generatorListPassages = () => generatorProxy<Array<{ id: string; title: string; order_no: number }>>("/api/passages", "GET");
export const generatorListSkills = () => generatorProxy<Array<{ value: string; label: string }>>("/api/skills", "GET");
export const generatorFetchStats = () => generatorProxy<Record<string, unknown>>("/api/stats", "GET");
export const generatorGenerate = (req: {
  passage_id: string | null;
  forced_difficulty: number | null;
  forced_skill: string | null;
  dry_run: boolean;
  count: number;
}) => generatorProxy<unknown>("/api/generate", "POST", req);
export const generatorAssemble = (req: { dry_run: boolean; strategies: string[] }) =>
  generatorProxy<unknown>("/api/assemble", "POST", req);

// ── Device id helper (stable per install) ───────────────────────────────────

/** Returns a stable device id for visit tracking. */
export async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") {
      return (await Application.getAndroidId()) ?? "anon-android";
    }
    if (Platform.OS === "ios") {
      return (await Application.getIosIdForVendorAsync()) ?? "anon-ios";
    }
  } catch {
    /* fallthrough */
  }
  return "anon-web";
}

/** Best-effort sync platform name for visit events. */
export function getPlatform(): string {
  return Platform.OS;
}

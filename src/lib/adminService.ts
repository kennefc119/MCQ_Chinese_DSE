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
  DailyUsageMetric,
  AIUsageStats,
  PassageSuccessRate,
  DifficultySuccessRate,
  ExerciseChoiceItem,
  StudentExerciseCount,
  UserSummaryStats,
  InventorySummary,
  AppSetting,
  EduDomainStat,
  EduDomainMonthly,
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
  const attemptRows = await fetchAllRows<{ user_id: string }>(
    () => supabase.from("dsemcq_attempts").select("user_id").gte("started_at", since)
  );
  const activeUsers = new Set(attemptRows.map((r) => r.user_id)).size;

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
  const visitRows = await fetchAllRows<{ device_id: string }>(
    () => supabase.from("dsemcq_visit_events").select("device_id").is("user_id", null).gte("occurred_at", since)
  );
  const visitorDevices = new Set(visitRows.map((r) => r.device_id)).size;

  // Chatbot: distinct users + total exchanges in window
  const chatRows = await fetchAllRows<{ user_id: string }>(
    () => supabase.from("dsemcq_advisor_messages").select("user_id").gte("created_at", since)
  );
  const chatUsers = new Set(chatRows.map((r) => r.user_id)).size;
  const chatMessages = chatRows.length;

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

// ── Daily usage metrics (per-day breakdown) ─────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns per-day usage metrics for the given window (for bar chart). */
export async function fetchDailyUsageMetrics(windowDays: number): Promise<DailyUsageMetric[]> {
  if (!isSupabaseConfigured) return [];
  const since = isoDaysAgo(windowDays);

  const [attemptRows, profileRows, loginRows, visitRows] = await Promise.all([
    fetchAllRows<{ user_id: string; started_at: string }>(
      () => supabase.from("dsemcq_attempts").select("user_id, started_at").gte("started_at", since)
    ),
    fetchAllRows<{ id: string; created_at: string }>(
      () => supabase.from("dsemcq_profiles").select("id, created_at").gte("created_at", since)
    ),
    fetchAllRows<{ id: string; occurred_at: string }>(
      () => supabase.from("dsemcq_login_events").select("id, occurred_at").gte("occurred_at", since)
    ),
    fetchAllRows<{ device_id: string; occurred_at: string }>(
      () => supabase.from("dsemcq_visit_events").select("device_id, occurred_at").is("user_id", null).gte("occurred_at", since)
    ),
  ]);

  // Build date → bucket map
  const buckets: Record<string, { activeSet: Set<string>; newUsers: number; logins: number; visitorSet: Set<string> }> = {};
  const initBucket = () => ({ activeSet: new Set<string>(), newUsers: 0, logins: 0, visitorSet: new Set<string>() });

  // Pre-fill all dates in range
  for (let i = 0; i < windowDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets[toDateString(d)] = initBucket();
  }

  for (const r of attemptRows) {
    const day = r.started_at.slice(0, 10);
    if (!buckets[day]) buckets[day] = initBucket();
    buckets[day].activeSet.add(r.user_id);
  }
  for (const r of profileRows) {
    const day = r.created_at.slice(0, 10);
    if (!buckets[day]) buckets[day] = initBucket();
    buckets[day].newUsers += 1;
  }
  for (const r of loginRows) {
    const day = r.occurred_at.slice(0, 10);
    if (!buckets[day]) buckets[day] = initBucket();
    buckets[day].logins += 1;
  }
  for (const r of visitRows) {
    const day = r.occurred_at.slice(0, 10);
    if (!buckets[day]) buckets[day] = initBucket();
    buckets[day].visitorSet.add(r.device_id);
  }

  return Object.entries(buckets)
    .map(([date, b]) => ({
      date,
      activeUsers: b.activeSet.size,
      newUsers: b.newUsers,
      loginEvents: b.logins,
      visitorDevices: b.visitorSet.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── AI usage stats ──────────────────────────────────────────────────────────

/** AI advisor usage: unique users, total conversations, avg output length. */
export async function fetchAIUsageStats(windowDays: number): Promise<AIUsageStats> {
  if (!isSupabaseConfigured) return { uniqueUsers: 0, totalConversations: 0, avgOutputLength: 0 };
  const since = isoDaysAgo(windowDays);
  const rows = await fetchAllRows<{ user_id: string; bot_reply: string }>(
    () => supabase.from("dsemcq_advisor_messages").select("user_id, bot_reply").gte("created_at", since)
  );
  const uniqueUsers = new Set(rows.map((r) => r.user_id)).size;
  const totalConversations = rows.length;
  const totalLength = rows.reduce((s, r) => s + (r.bot_reply?.length ?? 0), 0);
  return {
    uniqueUsers,
    totalConversations,
    avgOutputLength: totalConversations > 0 ? Math.round(totalLength / totalConversations) : 0,
  };
}

// ── Passage success rates (global) ──────────────────────────────────────────

/** Paginated fetch of all attempt answers. */
async function fetchAllAttemptAnswers(): Promise<{ question_id: string; is_correct: boolean }[]> {
  if (!isSupabaseConfigured) return [];
  const PAGE_SIZE = 1000;
  const all: { question_id: string; is_correct: boolean }[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("dsemcq_attempt_answers")
      .select("question_id, is_correct")
      .not("is_correct", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    const rows = (data ?? []) as { question_id: string; is_correct: boolean }[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** Batch .in() queries to avoid URL length limits (max ~300 IDs per batch). */
async function batchInQuery<T>(
  table: string,
  column: string,
  ids: string[],
  selectCols: string
): Promise<T[]> {
  const BATCH = 300;
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const { data } = await supabase.from(table).select(selectCols).in(column, batch);
    if (data) results.push(...(data as T[]));
  }
  return results;
}

/**
 * Generic paginated fetch — fetches ALL rows from a table/query beyond the 1000-row default.
 * `buildQuery` receives the Supabase client and must return a query builder (without .range()).
 */
async function fetchAllRows<T>(
  buildQuery: () => ReturnType<ReturnType<typeof supabase.from>["select"]>
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await (buildQuery() as any).range(from, from + PAGE_SIZE - 1);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** Success rate of students for each passage (all students combined). */
export async function fetchPassageSuccessRates(): Promise<PassageSuccessRate[]> {
  if (!isSupabaseConfigured) return [];

  const answers = await fetchAllAttemptAnswers();
  if (answers.length === 0) return [];

  const qIds = [...new Set(answers.map((a) => a.question_id))];
  const qRows = await batchInQuery<{ id: string; passage_id: string | null }>(
    "dsemcq_questions", "id", qIds, "id, passage_id"
  );
  const qPassage: Record<string, string | null> = {};
  for (const q of qRows) qPassage[q.id] = q.passage_id;

  const passageIds = [...new Set(Object.values(qPassage).filter(Boolean) as string[])];
  let passageTitle: Record<string, string> = {};
  if (passageIds.length > 0) {
    const { data: passages } = await supabase.from("dsemcq_passages").select("id, title").in("id", passageIds);
    passageTitle = Object.fromEntries(((passages ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
  }

  const buckets: Record<string, { correct: number; total: number }> = {};
  for (const a of answers) {
    const pid = qPassage[a.question_id];
    if (!pid) continue;
    if (!buckets[pid]) buckets[pid] = { correct: 0, total: 0 };
    buckets[pid].total += 1;
    if (a.is_correct) buckets[pid].correct += 1;
  }

  return Object.entries(buckets)
    .map(([pid, b]) => ({
      passage_id: pid,
      passage_title: passageTitle[pid] ?? pid,
      correct: b.correct,
      total: b.total,
      rate: b.total > 0 ? b.correct / b.total : 0,
    }))
    .sort((a, b) => a.rate - b.rate);
}

// ── Difficulty success rates (global) ───────────────────────────────────────

export async function fetchDifficultySuccessRates(): Promise<DifficultySuccessRate[]> {
  if (!isSupabaseConfigured) return [];

  const answers = await fetchAllAttemptAnswers();
  if (answers.length === 0) return [];

  const qIds = [...new Set(answers.map((a) => a.question_id))];
  const qRows = await batchInQuery<{ id: string; difficulty: number }>(
    "dsemcq_questions", "id", qIds, "id, difficulty"
  );
  const qDiff: Record<string, number> = {};
  for (const q of qRows) qDiff[q.id] = q.difficulty;

  const buckets: Record<number, { correct: number; total: number }> = {};
  for (const a of answers) {
    const d = qDiff[a.question_id];
    if (d == null) continue;
    if (!buckets[d]) buckets[d] = { correct: 0, total: 0 };
    buckets[d].total += 1;
    if (a.is_correct) buckets[d].correct += 1;
  }

  return Object.entries(buckets)
    .map(([d, b]) => ({
      difficulty: Number(d),
      correct: b.correct,
      total: b.total,
      rate: b.total > 0 ? b.correct / b.total : 0,
    }))
    .sort((a, b) => a.difficulty - b.difficulty);
}

// ── Skipping rate ───────────────────────────────────────────────────────────

/** Fraction of exercise attempts where student submitted without answering. */
export async function fetchSkippingRate(): Promise<{
  total: number;
  skipped: number;
  rate: number;
}> {
  if (!isSupabaseConfigured) return { total: 0, skipped: 0, rate: 0 };

  // Fetch attempts that are submitted
  const attempts = await fetchAllRows<{ id: string; answers: Record<string, string>; status: string }>(
    () => supabase.from("dsemcq_attempts").select("id, answers, status").eq("status", "submitted")
  );
  const total = attempts.length;
  const skipped = attempts.filter(
    (a) => !a.answers || Object.keys(a.answers).length === 0
  ).length;
  return { total, skipped, rate: total > 0 ? skipped / total : 0 };
}

// ── Exercise choice distribution ────────────────────────────────────────────

/** Count of attempts per quiz (exercise-type), as % of total. */
export async function fetchExerciseChoiceDistribution(): Promise<ExerciseChoiceItem[]> {
  if (!isSupabaseConfigured) return [];

  // Get exercise-type quiz IDs
  const { data: quizRows } = await supabase
    .from("dsemcq_quizzes")
    .select("id, title, passage_id, type")
    .eq("type", "exercise");
  const quizzes = (quizRows ?? []) as { id: string; title: string; passage_id: string | null; type: string }[];
  if (quizzes.length === 0) return [];

  const quizIds = quizzes.map((q) => q.id);
  const attempts = await fetchAllRows<{ quiz_id: string }>(
    () => supabase.from("dsemcq_attempts").select("quiz_id").in("quiz_id", quizIds).eq("status", "submitted")
  );

  const totalAttempts = attempts.length;

  // Count per quiz
  const counts: Record<string, number> = {};
  for (const a of attempts) {
    counts[a.quiz_id] = (counts[a.quiz_id] ?? 0) + 1;
  }

  // Passage titles
  const passageIds = [...new Set(quizzes.map((q) => q.passage_id).filter(Boolean) as string[])];
  let passageTitle: Record<string, string> = {};
  if (passageIds.length > 0) {
    const { data: passages } = await supabase.from("dsemcq_passages").select("id, title").in("id", passageIds);
    passageTitle = Object.fromEntries(((passages ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
  }

  return quizzes
    .map((q) => ({
      quiz_id: q.id,
      quiz_title: q.title,
      passage_title: q.passage_id ? passageTitle[q.passage_id] ?? null : null,
      instanceCount: counts[q.id] ?? 0,
      percentage: totalAttempts > 0 ? ((counts[q.id] ?? 0) / totalAttempts) * 100 : 0,
    }))
    .sort((a, b) => b.instanceCount - a.instanceCount);
}

// ── Per-student exercise count ──────────────────────────────────────────────

/** Number of exercise attempts per individual student (all-time). */
export async function fetchPerStudentExerciseCounts(): Promise<StudentExerciseCount[]> {
  if (!isSupabaseConfigured) return [];

  // Get exercise quiz IDs
  const { data: quizRows } = await supabase
    .from("dsemcq_quizzes")
    .select("id")
    .eq("type", "exercise");
  const quizIds = ((quizRows ?? []) as { id: string }[]).map((q) => q.id);
  if (quizIds.length === 0) return [];

  const attemptRows = await fetchAllRows<{ user_id: string }>(
    () => supabase.from("dsemcq_attempts").select("user_id").in("quiz_id", quizIds).eq("status", "submitted")
  );

  const counts: Record<string, number> = {};
  for (const r of attemptRows) {
    counts[r.user_id] = (counts[r.user_id] ?? 0) + 1;
  }

  // Get usernames
  const userIds = Object.keys(counts);
  if (userIds.length === 0) return [];
  const { data: profiles } = await supabase.from("dsemcq_profiles").select("id, username").in("id", userIds);
  const nameMap: Record<string, string> = {};
  for (const p of (profiles ?? []) as { id: string; username: string }[]) nameMap[p.id] = p.username;

  return Object.entries(counts)
    .map(([uid, count]) => ({ user_id: uid, username: nameMap[uid] ?? uid, count }))
    .sort((a, b) => b.count - a.count);
}

// ── User summary stats (aggregate) ──────────────────────────────────────────

/** High-level summary statistics across all users. */
export async function fetchUserSummaryStats(): Promise<UserSummaryStats> {
  const empty: UserSummaryStats = {
    totalUsers: 0,
    genderBreakdown: {},
    dseYearBreakdown: {},
    subscriptionBreakdown: { free: 0, premium: 0 },
    statusBreakdown: { active: 0, inactive: 0 },
    avgWenyuanPoints: 0,
    avgSuccessRate: 0,
    medianSuccessRate: 0,
    psychTestCompletionRate: 0,
    psychTestCountBreakdown: {},
  };
  if (!isSupabaseConfigured) return empty;

  const [profileRows, attemptRows, psychRows] = await Promise.all([
    fetchAllRows<{
      id: string;
      gender: string;
      dse_year: number;
      subscription_tier: string;
      subscription_status: string;
      wenyuan_points: number;
    }>(() => supabase.from("dsemcq_profiles").select("id, gender, dse_year, subscription_tier, subscription_status, wenyuan_points")),
    fetchAllRows<{ user_id: string; score: number | null; total: number }>(
      () => supabase.from("dsemcq_attempts").select("user_id, score, total, status").eq("status", "submitted")
    ),
    fetchAllRows<{ user_id: string; test_id: string }>(
      () => supabase.from("dsemcq_psych_user_results").select("user_id, test_id")
    ),
  ]);

  const profiles = profileRows;
  const totalUsers = profiles.length;
  if (totalUsers === 0) return empty;

  // Gender breakdown
  const genderBreakdown: Record<string, number> = {};
  for (const p of profiles) genderBreakdown[p.gender] = (genderBreakdown[p.gender] ?? 0) + 1;

  // DSE year breakdown
  const dseYearBreakdown: Record<number, number> = {};
  for (const p of profiles) dseYearBreakdown[p.dse_year] = (dseYearBreakdown[p.dse_year] ?? 0) + 1;

  // Subscription breakdown
  const subscriptionBreakdown = { free: 0, premium: 0 };
  const statusBreakdown = { active: 0, inactive: 0 };
  let totalPoints = 0;
  for (const p of profiles) {
    if (p.subscription_tier === "premium") subscriptionBreakdown.premium += 1;
    else subscriptionBreakdown.free += 1;
    if (p.subscription_status === "active") statusBreakdown.active += 1;
    else statusBreakdown.inactive += 1;
    totalPoints += p.wenyuan_points ?? 0;
  }

  // Per-user success rate
  const attempts = attemptRows;
  const userAccuracy: Record<string, { correct: number; total: number }> = {};
  for (const a of attempts) {
    if (a.score == null) continue;
    if (!userAccuracy[a.user_id]) userAccuracy[a.user_id] = { correct: 0, total: 0 };
    userAccuracy[a.user_id].correct += a.score;
    userAccuracy[a.user_id].total += a.total;
  }
  const userRates = Object.values(userAccuracy)
    .filter((v) => v.total > 0)
    .map((v) => (v.correct / v.total) * 100);
  userRates.sort((a, b) => a - b);
  const avgSuccessRate = userRates.length > 0 ? userRates.reduce((s, r) => s + r, 0) / userRates.length : 0;
  const medianSuccessRate = userRates.length > 0 ? userRates[Math.floor(userRates.length / 2)] : 0;

  // Psych test stats
  const psychResults = psychRows;
  const psychByUser: Record<string, Set<string>> = {};
  for (const r of psychResults) {
    if (!psychByUser[r.user_id]) psychByUser[r.user_id] = new Set();
    psychByUser[r.user_id].add(r.test_id);
  }
  const usersWithPsych = Object.keys(psychByUser).length;
  const psychTestCompletionRate = totalUsers > 0 ? (usersWithPsych / totalUsers) * 100 : 0;
  const psychTestCountBreakdown: Record<number, number> = {};
  for (const tests of Object.values(psychByUser)) {
    const cnt = tests.size;
    psychTestCountBreakdown[cnt] = (psychTestCountBreakdown[cnt] ?? 0) + 1;
  }

  return {
    totalUsers,
    genderBreakdown,
    dseYearBreakdown,
    subscriptionBreakdown,
    statusBreakdown,
    avgWenyuanPoints: Math.round(totalPoints / totalUsers),
    avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
    medianSuccessRate: Math.round(medianSuccessRate * 10) / 10,
    psychTestCompletionRate: Math.round(psychTestCompletionRate * 10) / 10,
    psychTestCountBreakdown,
  };
}

// ── Inventory summary ───────────────────────────────────────────────────────

/** Summary of exercises/questions status by passage, difficulty, and tag. */
export async function fetchInventorySummary(): Promise<InventorySummary> {
  if (!isSupabaseConfigured) {
    return { totalQuizzes: 0, totalExercises: 0, totalQuestions: 0, activeQuestions: 0, flaggedQuestions: 0, byPassage: [], byDifficulty: [], byTag: [] };
  }

  const [{ data: quizRows }, { data: qRows }, { data: tagRows }, { data: tagDefs }, { data: passages }] =
    await Promise.all([
      supabase.from("dsemcq_quizzes").select("id, type, passage_id"),
      supabase.from("dsemcq_questions").select("id, passage_id, difficulty, is_active, admin_flag"),
      supabase.from("dsemcq_question_tags").select("question_id, tag_id"),
      supabase.from("dsemcq_tags").select("id, label"),
      supabase.from("dsemcq_passages").select("id, title"),
    ]);

  const quizzes = (quizRows ?? []) as { id: string; type: string; passage_id: string | null }[];
  const questions = (qRows ?? []) as { id: string; passage_id: string | null; difficulty: number; is_active: boolean; admin_flag: boolean }[];
  const tags = (tagRows ?? []) as { question_id: string; tag_id: string }[];
  const tagLabels = Object.fromEntries(((tagDefs ?? []) as { id: string; label: string }[]).map((t) => [t.id, t.label]));
  const passageMap = Object.fromEntries(((passages ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));

  const totalQuizzes = quizzes.length;
  const totalExercises = quizzes.filter((q) => q.type === "exercise").length;
  const totalQuestions = questions.length;
  const activeQuestions = questions.filter((q) => q.is_active).length;
  const flaggedQuestions = questions.filter((q) => q.admin_flag).length;

  // By passage
  const passageQCount: Record<string, number> = {};
  const passageECount: Record<string, number> = {};
  for (const q of questions) {
    if (q.passage_id) passageQCount[q.passage_id] = (passageQCount[q.passage_id] ?? 0) + 1;
  }
  for (const q of quizzes) {
    if (q.passage_id && q.type === "exercise") passageECount[q.passage_id] = (passageECount[q.passage_id] ?? 0) + 1;
  }
  const byPassage = Object.keys({ ...passageQCount, ...passageECount }).map((pid) => ({
    passage_id: pid,
    passage_title: passageMap[pid] ?? pid,
    questionCount: passageQCount[pid] ?? 0,
    exerciseCount: passageECount[pid] ?? 0,
  }));

  // By difficulty
  const diffCount: Record<number, number> = {};
  for (const q of questions) diffCount[q.difficulty] = (diffCount[q.difficulty] ?? 0) + 1;
  const byDifficulty = Object.entries(diffCount)
    .map(([d, count]) => ({ difficulty: Number(d), count }))
    .sort((a, b) => a.difficulty - b.difficulty);

  // By tag
  const tagCount: Record<string, number> = {};
  for (const t of tags) tagCount[t.tag_id] = (tagCount[t.tag_id] ?? 0) + 1;
  const byTag = Object.entries(tagCount)
    .map(([tid, count]) => ({ tag_id: tid, tag_label: tagLabels[tid] ?? tid, count }))
    .sort((a, b) => b.count - a.count);

  return { totalQuizzes, totalExercises, totalQuestions, activeQuestions, flaggedQuestions, byPassage, byDifficulty, byTag };
}

// ── Education email domain analysis ─────────────────────────────────────────

const EDU_SUFFIXES = [".edu", ".edu.hk", ".school.hk", ".k12.hk"];

function isEduEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  return EDU_SUFFIXES.some((s) => domain.endsWith(s));
}

function extractDomain(email: string): string {
  return (email.toLowerCase().split("@")[1] ?? "").trim();
}

/** Fetch education email domain counts + monthly trend for top domains. */
export async function fetchEduEmailStats(): Promise<{
  domains: EduDomainStat[];
  monthly: EduDomainMonthly[];
}> {
  if (!isSupabaseConfigured) return { domains: [], monthly: [] };

  const rows = await fetchAllRows<{ email: string; created_at: string }>(
    () => supabase.from("dsemcq_profiles").select("email, created_at")
  );

  const eduRows = rows.filter((r) => isEduEmail(r.email));

  // Domain counts
  const domainCounts: Record<string, number> = {};
  for (const r of eduRows) {
    const d = extractDomain(r.email);
    domainCounts[d] = (domainCounts[d] ?? 0) + 1;
  }
  const domains: EduDomainStat[] = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);

  // Monthly trend for top 10 domains
  const topDomains = new Set(domains.slice(0, 10).map((d) => d.domain));
  const monthlyMap: Record<string, Record<string, number>> = {}; // domain -> month -> count
  for (const r of eduRows) {
    const d = extractDomain(r.email);
    if (!topDomains.has(d)) continue;
    const month = r.created_at.slice(0, 7); // YYYY-MM
    if (!monthlyMap[d]) monthlyMap[d] = {};
    monthlyMap[d][month] = (monthlyMap[d][month] ?? 0) + 1;
  }
  const monthly: EduDomainMonthly[] = [];
  for (const [domain, months] of Object.entries(monthlyMap)) {
    for (const [month, count] of Object.entries(months)) {
      monthly.push({ domain, month, count });
    }
  }
  monthly.sort((a, b) => a.month.localeCompare(b.month) || b.count - a.count);

  return { domains, monthly };
}

// ── App settings ────────────────────────────────────────────────────────────

/** Fetch all app settings. */
export async function fetchAppSettings(): Promise<AppSetting[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("dsemcq_app_settings").select("*");
  if (error) console.warn("[admin] fetchAppSettings:", error.message);
  return (data as AppSetting[]) ?? [];
}

/** Update a single app setting. */
export async function updateAppSetting(
  key: string,
  value: unknown,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: REQUIRE_SUPABASE };
  const { error } = await supabase.from("dsemcq_app_settings").upsert(
    { key, value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: "key" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Fetch list of all quizzes (for admin to select exempt ones). */
export async function fetchAllQuizzes(): Promise<{ id: string; title: string; type: string; passage_id: string | null }[]> {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase.from("dsemcq_quizzes").select("id, title, type, passage_id").order("type").order("title");
  return (data ?? []) as { id: string; title: string; type: string; passage_id: string | null }[];
}

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

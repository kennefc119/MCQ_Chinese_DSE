import { Quiz, Question, QuestionOption, Attempt, QuizSignup, InboxMessage, TipCard, PsychTest, PsychUserResult, Passage } from "../types/database";
import { isSupabaseConfigured, supabase } from "./supabase";
import { SEED_QUIZZES } from "../data/seedQuizzes";
import { SEED_QUESTIONS } from "../data/seedQuestions";
import { SEED_PASSAGES } from "../data/seedPassages";
import { SEED_TIP_CARDS } from "../data/seedTipCards";
import { SEED_PSYCH_TESTS } from "../data/seedPsychTests";
import { SEED_INBOX } from "../data/seedInbox";

// In-memory store for demo mode — persists during runtime only.
const memory = {
  attempts: [] as Attempt[],
  signups: [] as QuizSignup[],
  inbox: [...SEED_INBOX] as InboxMessage[],
};

export const localStore = memory;

// ── Difficulty computation ────────────────────────────────────────────────
// difficulty is no longer stored on dsemcq_quizzes; it is computed by averaging
// dsemcq_questions.difficulty for all question_ids in the quiz, rounded to the
// nearest integer. Minimum value is 1.
function applyComputedDifficulty(quizzes: Quiz[], diffMap: Record<string, number>): Quiz[] {
  return quizzes.map((quiz) => {
    const diffs = quiz.question_ids
      .map((id) => diffMap[id])
      .filter((d): d is number => typeof d === "number");
    const difficulty = diffs.length > 0
      ? Math.round(diffs.reduce((sum, d) => sum + d, 0) / diffs.length)
      : 1;
    return { ...quiz, difficulty };
  });
}

// ── Public API (works in both demo + Supabase mode) ─────────────────────
export async function listQuizzes(): Promise<Quiz[]> {
  if (!isSupabaseConfigured) {
    console.warn("[dsemcq] listQuizzes: Supabase not configured — returning seed data");
    const diffMap = Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, q.difficulty]));
    return applyComputedDifficulty(SEED_QUIZZES, diffMap);
  }
  const { data, error } = await supabase
    .from("dsemcq_quizzes")
    .select("*")
    .eq("is_published", true)
    .order("order_no", { nullsFirst: false });
  if (error) {
    console.warn("[dsemcq] listQuizzes error:", error.message, "| code:", error.code, "| details:", JSON.stringify(error));
    return [];
  }
  console.warn(`[dsemcq] listQuizzes: returned ${data?.length ?? 0} rows`);
  const quizzes = (data as Quiz[]) ?? [];
  const allIds = [...new Set(quizzes.flatMap((q) => q.question_ids))];
  if (allIds.length === 0) return quizzes;
  const { data: qRows } = await supabase
    .from("dsemcq_questions")
    .select("id, difficulty")
    .in("id", allIds);
  const diffMap = Object.fromEntries((qRows ?? []).map((r: { id: string; difficulty: number }) => [r.id, r.difficulty]));
  return applyComputedDifficulty(quizzes, diffMap);
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  if (!isSupabaseConfigured) {
    const quiz = SEED_QUIZZES.find((q) => q.id === id) ?? null;
    if (!quiz) return null;
    const diffMap = Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, q.difficulty]));
    return applyComputedDifficulty([quiz], diffMap)[0] ?? null;
  }
  const { data, error } = await supabase.from("dsemcq_quizzes").select("*").eq("id", id).maybeSingle();
  if (error) console.warn("[dsemcq] getQuiz error:", error.message);
  const quiz = data as Quiz | null;
  if (!quiz) return null;
  const { data: qRows } = await supabase
    .from("dsemcq_questions")
    .select("id, difficulty")
    .in("id", quiz.question_ids);
  const diffMap = Object.fromEntries((qRows ?? []).map((r: { id: string; difficulty: number }) => [r.id, r.difficulty]));
  return applyComputedDifficulty([quiz], diffMap)[0] ?? null;
}

export async function getQuestionsForQuiz(quiz: Quiz): Promise<Question[]> {
  if (!isSupabaseConfigured) {
    return quiz.question_ids.map((qid) => SEED_QUESTIONS.find((q) => q.id === qid)!).filter(Boolean);
  }

  // Try anti-cheat RPC first (hides is_correct during play)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_quiz_for_attempt", { p_quiz_id: quiz.id });
  if (rpcError) console.warn("[dsemcq] getQuestionsForQuiz RPC error:", rpcError.code, rpcError.message);

  const rpcQuestions = (rpcData as Question[]) ?? [];
  if (rpcQuestions.length > 0) return rpcQuestions;

  // Fallback: direct query — used when RPC returns empty (e.g. permission issue, stale plan)
  console.warn("[dsemcq] getQuestionsForQuiz: RPC returned empty (rpcError:", rpcError?.message ?? "none", ") — falling back to direct query for quiz", quiz.id, "with", quiz.question_ids.length, "question_ids");
  const ids = quiz.question_ids;
  if (ids.length === 0) {
    console.warn("[dsemcq] getQuestionsForQuiz: quiz.question_ids is empty for quiz", quiz.id);
    return [];
  }

  const [{ data: qRows, error: qErr }, { data: optRows, error: optErr }] = await Promise.all([
    supabase.from("dsemcq_questions").select("*").in("id", ids),
    supabase
      .from("dsemcq_question_options")
      .select("id, question_id, label, text, explanation")  // is_correct intentionally omitted (anti-cheat)
      .in("question_id", ids)
      .order("id"),
  ]);

  if (qErr) console.warn("[dsemcq] getQuestionsForQuiz fallback questions error:", qErr.code, qErr.message);
  if (optErr) console.warn("[dsemcq] getQuestionsForQuiz fallback options error:", optErr.code, optErr.message);

  console.warn("[dsemcq] getQuestionsForQuiz fallback: fetched", qRows?.length ?? 0, "questions and", optRows?.length ?? 0, "options for", ids.length, "ids");

  const optsByQ: Record<string, QuestionOption[]> = {};
  for (const o of optRows ?? []) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id]!.push({ ...o, is_correct: false }); // hide is_correct during quiz play
  }

  return ids
    .map((id) => (qRows ?? []).find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => q != null)
    .map((q) => ({ ...q, options: optsByQ[q.id] ?? [] } as Question));
}

// Returns questions with REAL is_correct values for the result screen.
// For local attempts (ID starts with "attempt-"), the options returned by getQuestionsForQuiz
// have is_correct=false (anti-cheat). We re-fetch from the DB if possible, otherwise the
// caller must supply the pre-loaded questions via the `localQuestions` parameter.
export async function getQuestionsForResult(
  quiz: Quiz,
  attemptId?: string,
  localQuestions?: Question[],
): Promise<Question[]> {
  // For a purely local attempt, re-use the questions that were loaded during the quiz run.
  // They have is_correct=false from the anti-cheat RPC, so we need the direct DB query;
  // but if the DB is unreachable, fall back to seed data so at least the review renders.
  if (!isSupabaseConfigured) {
    return quiz.question_ids.map((qid) => SEED_QUESTIONS.find((q) => q.id === qid)!).filter(Boolean);
  }

  // Try the result RPC first: SECURITY DEFINER bypasses table-level privilege requirements
  // and reveals real is_correct values only for submitted/expired attempts.
  if (attemptId && !attemptId.startsWith("attempt-")) {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_quiz_for_result", {
      p_quiz_id: quiz.id,
      p_attempt_id: attemptId,
    });
    if (rpcError) {
      console.warn("[dsemcq] getQuestionsForResult RPC error:", rpcError.code, rpcError.message);
    } else {
      const rpcQuestions = (rpcData as Question[]) ?? [];
      if (rpcQuestions.length > 0) return rpcQuestions;
      console.warn("[dsemcq] getQuestionsForResult: RPC returned empty for attempt", attemptId);
    }
  }

  // Fallback: direct table query (requires table-level grant on dsemcq_questions / dsemcq_question_options)
  const ids = quiz.question_ids;
  if (ids.length === 0) return [];

  const [{ data: qRows, error: qErr }, { data: optRows, error: optErr }] = await Promise.all([
    supabase.from("dsemcq_questions").select("*").in("id", ids),
    supabase
      .from("dsemcq_question_options")
      .select("id, question_id, label, text, is_correct, explanation")
      .in("question_id", ids)
      .order("id"),
  ]);

  if (qErr) console.warn("[dsemcq] getQuestionsForResult questions error:", qErr.message);
  if (optErr) console.warn("[dsemcq] getQuestionsForResult options error:", optErr.message);

  const optsByQ: Record<string, typeof optRows> = {};
  for (const o of optRows ?? []) {
    if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
    optsByQ[o.question_id]!.push(o);
  }

  // Preserve the quiz's question order
  return ids
    .map((id) => (qRows ?? []).find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => q != null)
    .map((q) => ({ ...q, options: optsByQ[q.id] ?? [] } as Question));
}

export async function listPassages(): Promise<Passage[]> {
  if (!isSupabaseConfigured) return SEED_PASSAGES;
  const { data } = await supabase.from("dsemcq_passages").select("*").order("order_no");
  return (data as Passage[]) ?? SEED_PASSAGES;
}

export async function getPassagesByIds(ids: string[]): Promise<Passage[]> {
  if (ids.length === 0) return [];
  if (!isSupabaseConfigured) return SEED_PASSAGES.filter((p) => ids.includes(p.id));
  const { data, error } = await supabase
    .from("dsemcq_passages")
    .select("id, title, dynasty, author, body")
    .in("id", ids);
  if (error) {
    console.warn("[dsemcq] getPassagesByIds error:", error.message);
    return [];
  }
  return (data as Passage[]) ?? [];
}

export async function listTipCards(): Promise<TipCard[]> {
  if (!isSupabaseConfigured) return SEED_TIP_CARDS;
  const { data, error } = await supabase.from("dsemcq_tip_cards").select("*").eq("is_active", true).order("position");
  if (error) {
    console.warn("[dsemcq] listTipCards error — falling back to seed:", error.message);
    return SEED_TIP_CARDS;
  }
  if (!data || data.length === 0) return SEED_TIP_CARDS;
  return data as TipCard[];
}

export async function listPsychTests(): Promise<PsychTest[]> {
  if (!isSupabaseConfigured) return SEED_PSYCH_TESTS;
  const { data, error } = await supabase.from("dsemcq_psych_tests").select("*").eq("is_active", true).order("position");
  if (error) {
    console.warn("[dsemcq] listPsychTests error — falling back to seed:", error.message);
    return SEED_PSYCH_TESTS;
  }
  if (!data || data.length === 0) return SEED_PSYCH_TESTS;
  return data as PsychTest[];
}

export async function savePsychResult(userId: string, testId: string, resultCode: string) {
  if (!isSupabaseConfigured) return;
  await supabase.from("dsemcq_psych_user_results").upsert(
    {
      user_id: userId,
      test_id: testId,
      result_code: resultCode,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,test_id" }
  );
}

export async function listUserPsychResults(userId: string): Promise<Record<string, { result_code: string; completed_at: string }>> {
  if (!isSupabaseConfigured) return {};
  const { data } = await supabase
    .from("dsemcq_psych_user_results")
    .select("test_id, result_code, completed_at")
    .eq("user_id", userId);
  if (!data) return {};
  return Object.fromEntries(data.map((r: { test_id: string; result_code: string; completed_at: string }) => [r.test_id, { result_code: r.result_code, completed_at: r.completed_at }]));
}

// ── Inbox ────────────────────────────────────────────────────
export async function listInbox(userId: string): Promise<InboxMessage[]> {
  if (!isSupabaseConfigured) return memory.inbox.filter((m) => m.user_id === userId || m.user_id === "demo");
  const { data } = await supabase
    .from("dsemcq_inbox")
    .select("*")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("created_at", { ascending: false });
  return (data as InboxMessage[]) ?? [];
}

export async function markInboxRead(id: string) {
  if (!isSupabaseConfigured) {
    const m = memory.inbox.find((x) => x.id === id);
    if (m) m.read = true;
    return;
  }
  await supabase.from("dsemcq_inbox").update({ read: true }).eq("id", id);
}

// ── Signups (calendar) ─────────────────────────────────────
export async function listSignups(userId: string): Promise<QuizSignup[]> {
  if (!isSupabaseConfigured) return memory.signups.filter((s) => s.user_id === userId);
  const { data } = await supabase.from("dsemcq_user_quiz_signups").select("*").eq("user_id", userId);
  return (data as QuizSignup[]) ?? [];
}

export async function signUpForQuiz(userId: string, quizId: string) {
  if (!isSupabaseConfigured) {
    const signup: QuizSignup = {
      id: `signup-${Date.now()}`,
      user_id: userId,
      quiz_id: quizId,
      signed_up_at: new Date().toISOString(),
    };
    memory.signups.push(signup);
    return signup;
  }
  // Use the live auth user id from the session rather than the cached profile id
  // to prevent RLS violations when the SecureStore profile has become stale.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const liveUserId = authUser?.id ?? userId;
  const { data, error } = await supabase
    .from("dsemcq_user_quiz_signups")
    .upsert(
      { user_id: liveUserId, quiz_id: quizId, signed_up_at: new Date().toISOString() },
      { onConflict: "user_id,quiz_id" }
    )
    .select()
    .single();
  if (error) {
    console.warn("[dsemcq] signUpForQuiz error:", error.message);
    return { id: "", user_id: liveUserId, quiz_id: quizId, signed_up_at: new Date().toISOString() } as QuizSignup;
  }
  return data as QuizSignup;
}

// ── Attempts ─────────────────────────────────────────────
export async function startAttempt(userId: string, quiz: Quiz): Promise<Attempt> {
  const localAttempt: Attempt = {
    id: `attempt-${Date.now()}`,
    user_id: userId,
    quiz_id: quiz.id,
    started_at: new Date().toISOString(),
    submitted_at: null,
    score: null,
    total: quiz.question_ids.length,
    time_spent_seconds: null,
    status: "in_progress",
    answers: {},
  };
  if (!isSupabaseConfigured) {
    memory.attempts.push(localAttempt);
    return localAttempt;
  }
  // Use the live auth user id to prevent RLS violations from a stale cached profile.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const liveUserId = authUser?.id ?? userId;
  const { data, error } = await supabase
    .from("dsemcq_attempts")
    .insert({
      user_id: liveUserId,
      quiz_id: quiz.id,
      total: quiz.question_ids.length,
      status: "in_progress",
      answers: {},
    })
    .select()
    .single();
  if (error) {
    console.warn("[dsemcq] startAttempt error:", error.message);
    memory.attempts.push(localAttempt);
    return localAttempt;
  }
  return data as Attempt;
}

export async function saveAnswer(attemptId: string, questionId: string, optionId: string) {
  if (!isSupabaseConfigured) {
    const a = memory.attempts.find((x) => x.id === attemptId);
    if (a) a.answers[questionId] = optionId;
    return;
  }
  await supabase
    .from("dsemcq_attempt_answers")
    .upsert({ attempt_id: attemptId, question_id: questionId, selected_option_id: optionId });
}

/** Returns true when the attempt was stored locally (RLS prevented DB insert). */
const isLocalAttemptId = (id: string) => id.startsWith("attempt-");

export async function submitAttempt(
  attemptId: string,
  answers: Record<string, string>,
  questions: Question[],
  timeSpent: number,
): Promise<Attempt> {
  // Local-only path: no Supabase configured, OR the attempt was never persisted to DB
  // (e.g. startAttempt hit an RLS violation and fell back to a local "attempt-xxx" ID).
  // In both cases we score locally using the options already loaded during the quiz.
  if (!isSupabaseConfigured || isLocalAttemptId(attemptId)) {
    let correct = 0;
    for (const q of questions) {
      const sel = answers[q.id];
      if (sel) {
        const opt = q.options.find((o) => o.id === sel);
        if (opt?.is_correct) correct++;
      }
    }
    const update = {
      submitted_at: new Date().toISOString(),
      score: correct,
      total: questions.length,
      time_spent_seconds: timeSpent,
      status: "submitted" as const,
      answers,
    };
    const a = memory.attempts.find((x) => x.id === attemptId);
    if (a) Object.assign(a, update);
    return { ...(a as Attempt), ...update };
  }

  // Supabase mode: query dsemcq_question_options directly to get real is_correct values.
  // The quiz RPC hides is_correct during play (anti-cheat), so we must look up the DB table.
  let correct = 0;
  const selectedOptionIds = Object.values(answers).filter(Boolean);
  if (selectedOptionIds.length > 0) {
    const { data: opts, error: optsError } = await supabase
      .from("dsemcq_question_options")
      .select("id, is_correct")
      .in("id", selectedOptionIds);
    if (optsError) {
      console.warn("[dsemcq] submitAttempt: failed to fetch option correctness:", optsError.message);
    } else {
      correct = (opts ?? []).filter((o) => o.is_correct).length;
    }
  }

  const update = {
    submitted_at: new Date().toISOString(),
    score: correct,
    total: questions.length,
    time_spent_seconds: timeSpent,
    status: "submitted" as const,
    answers,
  };

  const answerRows = questions
    .filter((q) => answers[q.id])
    .map((q) => {
      const selectedOptionId = answers[q.id];
      return {
        attempt_id: attemptId,
        question_id: q.id,
        selected_option_id: selectedOptionId,
        answered_at: new Date().toISOString(),
      };
    });

  if (answerRows.length > 0) {
    await supabase.from("dsemcq_attempt_answers").upsert(answerRows);
  }

  const { data, error } = await supabase
    .from("dsemcq_attempts")
    .update(update)
    .eq("id", attemptId)
    .select()
    .single();

  if (error || !data) {
    // Attempt was stored locally (e.g. FK constraint prevented DB insert), update memory
    console.warn("[dsemcq] submitAttempt DB update failed (using local):", error?.message);
    const a = memory.attempts.find((x) => x.id === attemptId);
    if (a) Object.assign(a, update);
    const base = a ?? ({ id: attemptId, user_id: "", quiz_id: "", started_at: new Date().toISOString() } as any);
    return { ...base, ...update } as Attempt;
  }
  return data as Attempt;
}

// ── Question analytics metadata (for skills radar) ─────────────────────
// Returns per-question tag IDs and the correct option ID, sourced from Supabase
// (or seed data in demo mode). Used by DiscoverSelfScreen to compute skill accuracy.
export interface QuestionAnalyticsMeta {
  tagIds: string[];
  correctOptionId: string | null;
}

export async function fetchQuestionAnalyticsData(
  questionIds: string[],
): Promise<Record<string, QuestionAnalyticsMeta>> {
  if (questionIds.length === 0) return {};

  if (!isSupabaseConfigured) {
    // Demo mode: build from seed data (maintains existing behaviour)
    const meta: Record<string, QuestionAnalyticsMeta> = {};
    for (const id of questionIds) {
      const q = SEED_QUESTIONS.find((sq) => sq.id === id);
      if (!q) continue;
      const correctOpt = q.options.find((o) => o.is_correct);
      meta[id] = { tagIds: q.tag_ids ?? [], correctOptionId: correctOpt?.id ?? null };
    }
    return meta;
  }

  const [{ data: tagRows, error: tagErr }, { data: optRows, error: optErr }] = await Promise.all([
    supabase
      .from("dsemcq_question_tags")
      .select("question_id, tag_id")
      .in("question_id", questionIds),
    supabase
      .from("dsemcq_question_options")
      .select("id, question_id")
      .in("question_id", questionIds)
      .eq("is_correct", true),
  ]);

  if (tagErr) console.warn("[dsemcq] fetchQuestionAnalyticsData tags error:", tagErr.message);
  if (optErr) console.warn("[dsemcq] fetchQuestionAnalyticsData options error:", optErr.message);

  const meta: Record<string, QuestionAnalyticsMeta> = {};
  for (const id of questionIds) meta[id] = { tagIds: [], correctOptionId: null };
  for (const row of tagRows ?? []) {
    meta[row.question_id]?.tagIds.push(row.tag_id);
  }
  for (const row of optRows ?? []) {
    if (meta[row.question_id]) meta[row.question_id].correctOptionId = row.id;
  }
  return meta;
}

export async function listUserAttempts(userId: string): Promise<Attempt[]> {
  const local = memory.attempts.filter((a) => a.user_id === userId);
  if (!isSupabaseConfigured) return local;
  const { data, error } = await supabase
    .from("dsemcq_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) console.warn("[dsemcq] listUserAttempts error:", error.message);
  const remote = (data as Attempt[]) ?? [];
  // Merge: remote first, then any local-only attempts not yet persisted
  const remoteIds = new Set(remote.map((a) => a.id));
  return [...remote, ...local.filter((a) => !remoteIds.has(a.id))];
}

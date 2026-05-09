import { Quiz, Question, QuestionOption, Attempt, QuizSignup, InboxMessage, TipCard, PsychTest, Passage } from "../types/database";
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

// ── Public API (works in both demo + Supabase mode) ─────────────────────
export async function listQuizzes(): Promise<Quiz[]> {
  if (!isSupabaseConfigured) {
    console.warn("[dsemcq] listQuizzes: Supabase not configured — returning seed data");
    return SEED_QUIZZES;
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
  return (data as Quiz[]) ?? [];
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  if (!isSupabaseConfigured) return SEED_QUIZZES.find((q) => q.id === id) ?? null;
  const { data, error } = await supabase.from("dsemcq_quizzes").select("*").eq("id", id).maybeSingle();
  if (error) console.warn("[dsemcq] getQuiz error:", error.message);
  return data as Quiz | null;
}

export async function getQuestionsForQuiz(quiz: Quiz): Promise<Question[]> {
  if (!isSupabaseConfigured) {
    return quiz.question_ids.map((qid) => SEED_QUESTIONS.find((q) => q.id === qid)!).filter(Boolean);
  }

  // Try anti-cheat RPC first (hides is_correct during play)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_quiz_for_attempt", { p_quiz_id: quiz.id });
  if (rpcError) console.warn("[dsemcq] getQuestionsForQuiz RPC error:", rpcError.message);

  const rpcQuestions = (rpcData as Question[]) ?? [];
  if (rpcQuestions.length > 0) return rpcQuestions;

  // Fallback: direct query — used when RPC returns empty (e.g. is_active mismatch, permission issue)
  console.warn("[dsemcq] getQuestionsForQuiz: RPC returned empty, falling back to direct query");
  const ids = quiz.question_ids;
  if (ids.length === 0) return [];

  const [{ data: qRows, error: qErr }, { data: optRows, error: optErr }] = await Promise.all([
    supabase.from("dsemcq_questions").select("*").in("id", ids),
    supabase
      .from("dsemcq_question_options")
      .select("id, question_id, label, text, explanation")  // is_correct intentionally omitted (anti-cheat)
      .in("question_id", ids)
      .order("id"),
  ]);

  if (qErr) console.warn("[dsemcq] getQuestionsForQuiz fallback questions error:", qErr.message);
  if (optErr) console.warn("[dsemcq] getQuestionsForQuiz fallback options error:", optErr.message);

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

// Returns questions with REAL is_correct values by querying tables directly (bypasses the
// anti-cheat RPC that hides is_correct=false during the quiz).
export async function getQuestionsForResult(quiz: Quiz): Promise<Question[]> {
  if (!isSupabaseConfigured) {
    return quiz.question_ids.map((qid) => SEED_QUESTIONS.find((q) => q.id === qid)!).filter(Boolean);
  }

  const ids = quiz.question_ids;
  if (ids.length === 0) return [];

  // Query questions and options in parallel
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
  const { data } = await supabase.from("dsemcq_psych_tests").select("*").eq("is_active", true).order("position");
  return (data as PsychTest[]) ?? [];
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
  const { data, error } = await supabase
    .from("dsemcq_user_quiz_signups")
    .upsert(
      { user_id: userId, quiz_id: quizId, signed_up_at: new Date().toISOString() },
      { onConflict: "user_id,quiz_id" }
    )
    .select()
    .single();
  if (error) {
    console.warn("[dsemcq] signUpForQuiz error:", error.message);
    return { id: "", user_id: userId, quiz_id: quizId, signed_up_at: new Date().toISOString() } as QuizSignup;
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
  const { data, error } = await supabase
    .from("dsemcq_attempts")
    .insert({
      user_id: userId,
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

export async function submitAttempt(
  attemptId: string,
  answers: Record<string, string>,
  questions: Question[],
  timeSpent: number,
): Promise<Attempt> {
  // Demo mode: calculate score locally (seed questions have correct is_correct values)
  if (!isSupabaseConfigured) {
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

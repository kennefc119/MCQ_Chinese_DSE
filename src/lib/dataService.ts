import { Quiz, Question, Attempt, QuizSignup, InboxMessage, TipCard, PsychTest, Passage } from "../types/database";
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
  if (!isSupabaseConfigured) return SEED_QUIZZES;
  const { data } = await supabase.from("dsemcq_quizzes").select("*").eq("is_published", true);
  return (data as Quiz[]) ?? [];
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  if (!isSupabaseConfigured) return SEED_QUIZZES.find((q) => q.id === id) || null;
  const { data } = await supabase.from("dsemcq_quizzes").select("*").eq("id", id).maybeSingle();
  return data as Quiz | null;
}

export async function getQuestionsForQuiz(quiz: Quiz): Promise<Question[]> {
  if (!isSupabaseConfigured) {
    return quiz.question_ids.map((qid) => SEED_QUESTIONS.find((q) => q.id === qid)!).filter(Boolean);
  }
  const { data } = await supabase.rpc("get_quiz_for_attempt", { quiz_id: quiz.id });
  return (data as Question[]) ?? [];
}

export async function listPassages(): Promise<Passage[]> {
  if (!isSupabaseConfigured) return SEED_PASSAGES;
  const { data } = await supabase.from("dsemcq_passages").select("*").order("order_no");
  return (data as Passage[]) ?? SEED_PASSAGES;
}

export async function listTipCards(): Promise<TipCard[]> {
  if (!isSupabaseConfigured) return SEED_TIP_CARDS;
  const { data } = await supabase.from("dsemcq_tip_cards").select("*").eq("is_active", true).order("position");
  return (data as TipCard[]) ?? SEED_TIP_CARDS;
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
  const signup: QuizSignup = {
    id: `signup-${Date.now()}`,
    user_id: userId,
    quiz_id: quizId,
    signed_up_at: new Date().toISOString(),
  };
  if (!isSupabaseConfigured) {
    memory.signups.push(signup);
    return signup;
  }
  const { data } = await supabase
    .from("dsemcq_user_quiz_signups")
    .upsert(signup, { onConflict: "user_id,quiz_id" })
    .select()
    .single();
  return data as QuizSignup;
}

// ── Attempts ─────────────────────────────────────────────
export async function startAttempt(userId: string, quiz: Quiz): Promise<Attempt> {
  const attempt: Attempt = {
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
    memory.attempts.push(attempt);
    return attempt;
  }
  const { data } = await supabase.from("dsemcq_attempts").insert(attempt).select().single();
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
  if (!isSupabaseConfigured) {
    const a = memory.attempts.find((x) => x.id === attemptId);
    if (a) Object.assign(a, update);
    return { ...(a as Attempt), ...update };
  }
  const answerRows = questions
    .filter((q) => answers[q.id])
    .map((q) => {
      const selectedOptionId = answers[q.id];
      const opt = q.options.find((o) => o.id === selectedOptionId);
      return {
        attempt_id: attemptId,
        question_id: q.id,
        selected_option_id: selectedOptionId,
        is_correct: Boolean(opt?.is_correct),
        answered_at: new Date().toISOString(),
      };
    });

  if (answerRows.length > 0) {
    await supabase.from("dsemcq_attempt_answers").upsert(answerRows);
  }

  const { data } = await supabase
    .from("dsemcq_attempts")
    .update(update)
    .eq("id", attemptId)
    .select()
    .single();
  return data as Attempt;
}

export async function listUserAttempts(userId: string): Promise<Attempt[]> {
  if (!isSupabaseConfigured) return memory.attempts.filter((a) => a.user_id === userId);
  const { data } = await supabase
    .from("dsemcq_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  return (data as Attempt[]) ?? [];
}

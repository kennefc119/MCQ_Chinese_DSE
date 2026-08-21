import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Source = "profile" | "performance" | "question_bank";

type QuestionMeta = {
  id: string;
  passage_id: string | null;
  cross_passage_id?: string | null;
  difficulty: number | null;
};

type AttemptRow = {
  id: string;
  quiz_id: string | null;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  time_spent_seconds: number | null;
  answers: Record<string, string> | null;
};

type AnswerRow = {
  attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean | null;
};

type TagRow = {
  question_id: string;
  tag_id: string;
};

type TagDefRow = {
  id: string;
  label: string;
};

type PassageRow = {
  id: string;
  title: string;
};

export type PerformanceDetailRequest = {
  action?: string;
  question_ids?: string[];
  passage_ids?: string[];
  passage_names?: string[];
  tag_ids?: string[];
  tag_labels?: string[];
  include?: string[];
  lookback_attempts?: number;
  limit_questions?: number;
  reason?: string;
};

export type RetrievalHints = {
  mentionedDesignatedPassages?: string[];
  questionBankFocus?: string[];
};

export type QuestionBankDetailRequest = {
  action?: string;
  passage_names?: string[];
  section_type?: "designated" | "unseen" | "mixed";
  exam_year_from?: number;
  exam_year_to?: number;
  question_types?: string[];
  focus_terms?: string[];
  include?: string[];
  limit_questions?: number;
  reason?: string;
};

export type ResolvedPassageScope = {
  requested_passages: string[];
  resolved_passages: Array<{
    canonical_name: string;
    app_passage_ids: string[];
    app_titles: string[];
    past_exam_title_patterns: string[];
  }>;
  unresolved_passages: string[];
};

type RetrieveOptions = {
  performanceDetailRequest?: PerformanceDetailRequest;
  questionBankDetailRequest?: QuestionBankDetailRequest;
  retrievalHints?: RetrievalHints;
  resolvedPassageScope?: ResolvedPassageScope;
  conversationHistoryEnabled?: boolean;
};

export type RecentChatBubble = {
  role: "user" | "assistant";
  text: string;
};

export type RecentChatContext = {
  bubbles: RecentChatBubble[];
  truncated: boolean;
};

type PastExamQuestionRow = {
  exam_year: number | null;
  section_type: string | null;
  passage_bucket: string | null;
  passage_title: string | null;
  question_number: string | null;
  question_text: string | null;
  score: number | null;
  question_type_norm: string | null;
  specific_marking_notes: string | null;
  suggested_answer_text: string | null;
};

const DESIGNATED_PASSAGE_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "岳陽樓記", aliases: ["岳阳楼记"] },
  { canonical: "師說", aliases: ["师说"] },
  { canonical: "廉頗藺相如列傳", aliases: ["廉颇蔺相如列传", "廉頗藺相如", "廉颇蔺相如"] },
  { canonical: "魚我所欲也", aliases: ["鱼我所欲也"] },
  { canonical: "勸學", aliases: ["劝学"] },
  { canonical: "六國論", aliases: ["六国论"] },
  { canonical: "逍遙遊", aliases: ["逍遥游"] },
  { canonical: "出師表", aliases: ["出师表"] },
  { canonical: "始得西山宴遊記", aliases: ["始得西山宴游记"] },
  { canonical: "唐詩三首", aliases: ["唐诗三首", "山居秋暝", "月下獨酌", "登樓", "山居秋暝", "月下独酌", "登楼"] },
  { canonical: "詞三首", aliases: ["词三首", "念奴嬌", "青玉案", "聲聲慢", "念奴娇", "声声慢"] },
  { canonical: "論仁、論孝、論君子", aliases: ["论仁论孝论君子", "論仁", "論孝", "論君子", "论仁", "论孝", "论君子"] },
];

export async function resolvePassageScope(
  supabase: SupabaseClient,
  retrievalHints?: RetrievalHints,
): Promise<ResolvedPassageScope> {
  const requested = uniqueStrings(retrievalHints?.mentionedDesignatedPassages ?? [], 8);
  if (requested.length === 0) {
    return { requested_passages: [], resolved_passages: [], unresolved_passages: [] };
  }

  const { data, error } = await supabase
    .from("dsemcq_passages")
    .select("id, title")
    .order("order_no", { ascending: true });
  if (error) throw error;
  const passages = (data ?? []) as Array<{ id: string; title: string }>;
  const resolved: ResolvedPassageScope["resolved_passages"] = [];
  const unresolved: string[] = [];

  for (const requestedName of requested) {
    const requestedNorm = normalizeText(requestedName);
    const catalog = DESIGNATED_PASSAGE_ALIASES.find((entry) => {
      const names = [entry.canonical, ...entry.aliases].map(normalizeText);
      return names.some((name) => name === requestedNorm || name.includes(requestedNorm) || requestedNorm.includes(name));
    });
    const canonicalName = catalog?.canonical ?? requestedName;
    const matchTerms = uniqueStrings([canonicalName, ...(catalog?.aliases ?? []), requestedName], 20);
    const matchNorms = matchTerms.map(normalizeText);
    const matchedRows = passages.filter((passage) => {
      const titleNorm = normalizeText(passage.title);
      return matchNorms.some((term) => term === titleNorm || term.includes(titleNorm) || titleNorm.includes(term));
    });

    if (matchedRows.length === 0) {
      unresolved.push(requestedName);
      continue;
    }
    resolved.push({
      canonical_name: canonicalName,
      app_passage_ids: uniqueStrings(matchedRows.map((row) => row.id), 8),
      app_titles: uniqueStrings(matchedRows.map((row) => row.title), 8),
      past_exam_title_patterns: matchTerms,
    });
  }

  return {
    requested_passages: requested,
    resolved_passages: resolved,
    unresolved_passages: uniqueStrings(unresolved, 8),
  };
}

async function batchIn<T>(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
  selectColumns: string,
) {
  const result: T[] = [];
  const size = 250;
  for (let i = 0; i < ids.length; i += size) {
    const batch = ids.slice(i, i + size);
    const rows = await fetchAllPages<T>((from, to) => supabase
      .from(table)
      .select(selectColumns)
      .in(column, batch)
      .range(from, to));
    result.push(...rows);
  }
  return result;
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function ratio(correct: number, total: number) {
  return total > 0 ? correct / total : null;
}

export async function loadPerformanceSnapshot(
  supabase: SupabaseClient,
  userId: string,
  resolvedPassageScope?: ResolvedPassageScope,
) {
  const attempts = await fetchAllPages<AttemptRow>((from, to) => supabase
    .from("dsemcq_attempts")
    .select("id, quiz_id, score, total, submitted_at, time_spent_seconds, answers")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .range(from, to));
  const answeredAttempts = attempts.filter((row) => typeof row.total === "number" && row.total > 0);
  const attemptIds = answeredAttempts.map((row) => row.id);
  if (attemptIds.length === 0) {
    return {
      retrieval_scope: resolvedPassageScope ?? { requested_passages: [], resolved_passages: [], unresolved_passages: [] },
      overall: {
        submitted_attempts: 0,
        answered_count: 0,
        correct_count: 0,
        incorrect_count: 0,
        answered_accuracy: null,
        quiz_score_rate: null,
      },
      engagement: {
        expected_questions: 0,
        skipped_count: 0,
        completion_rate: null,
        fully_skipped_attempts: 0,
        partial_attempts: 0,
      },
      focused_passage_performance: [],
      recent_attempts: [],
      skill_stats: [],
      passage_stats: [],
      difficulty_stats: [],
      top_passages_best: [],
      top_passages_worst: [],
      skipped_attempts: 0,
      skipped_rate: null,
      coverage: {
        passages_attempted: 0,
        passages_total_available: 0,
        skills_attempted: 0,
        skills_total_available: 0,
      },
      evidence_ids: [],
    };
  }

  const [answers, tagDefs] = await Promise.all([
    batchIn<AnswerRow>(
      supabase,
      "dsemcq_attempt_answers",
      "attempt_id",
      attemptIds,
      "attempt_id, question_id, selected_option_id, is_correct",
    ),
    Promise.all([
      supabase
        .from("dsemcq_tags")
        .select("id, label")
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as TagDefRow[];
        }),
      supabase
        .from("dsemcq_passages")
        .select("id", { count: "exact", head: true })
        .then(({ count, error }) => {
          if (error) throw error;
          return count ?? 0;
        }),
    ]),
  ]);
  const [tagDefRows, totalPassagesAvailable] = tagDefs;

  const questionIds = [...new Set(answers.map((row) => row.question_id))];

  const [questions, questionTags] = await Promise.all([
    questionIds.length > 0
      ? batchIn<QuestionMeta & { stem: string }>(
        supabase,
        "dsemcq_questions",
        "id",
        questionIds,
        "id, passage_id, cross_passage_id, difficulty, stem",
      )
      : Promise.resolve([] as QuestionMeta[]),
    questionIds.length > 0
      ? batchIn<TagRow>(supabase, "dsemcq_question_tags", "question_id", questionIds, "question_id, tag_id")
      : Promise.resolve([] as TagRow[]),
  ]);

  const questionMeta = new Map<string, QuestionMeta>(questions.map((row) => [row.id, row]));
  const questionStem = new Map(questions.map((row) => [row.id, row.stem]));
  const tagLabel = new Map<string, string>(tagDefRows.map((row) => [row.id, row.label]));

  const tagsByQuestion = new Map<string, string[]>();
  for (const row of questionTags) {
    if (!tagsByQuestion.has(row.question_id)) tagsByQuestion.set(row.question_id, []);
    tagsByQuestion.get(row.question_id)!.push(row.tag_id);
  }

  const selectedOptionIds = uniqueStrings(answers
    .map((row) => row.selected_option_id)
    .filter((id): id is string => Boolean(id)), 100000);
  const selectedOptions = selectedOptionIds.length > 0
    ? await batchIn<{ id: string; is_correct: boolean }>(
      supabase,
      "dsemcq_question_options",
      "id",
      selectedOptionIds,
      "id, is_correct",
    )
    : [];
  const selectedOptionCorrectness = new Map(selectedOptions.map((row) => [row.id, row.is_correct]));

  const passageIds = [...new Set(questions.flatMap((row) => [row.passage_id, row.cross_passage_id])
    .filter((id): id is string => Boolean(id)))];
  const passages = passageIds.length > 0
    ? await batchIn<PassageRow>(supabase, "dsemcq_passages", "id", passageIds, "id, title")
    : [];
  const passageTitle = new Map<string, string>(passages.map((row) => [row.id, row.title]));

  const overallTotal = answeredAttempts.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const overallCorrect = answeredAttempts.reduce((sum, row) => sum + Number(row.score ?? 0), 0);

  const skillBuckets = new Map<string, { answered: number; correct: number }>();
  const passageBuckets = new Map<string, { answered: number; correct: number; skipped: number }>();
  const difficultyBuckets = new Map<number, { answered: number; correct: number }>();
  const questionBuckets = new Map<string, { answered: number; correct: number; skipped: number }>();
  let answeredCount = 0;
  let correctCount = 0;

  for (const answer of answers) {
    const meta = questionMeta.get(answer.question_id);
    if (!meta) continue;
    const selectedOptionId = answer.selected_option_id;
    const isAnswered = Boolean(selectedOptionId);
    const correctness = isAnswered
      ? (typeof answer.is_correct === "boolean" ? answer.is_correct : selectedOptionCorrectness.get(selectedOptionId!))
      : null;
    const questionBucket = questionBuckets.get(answer.question_id) ?? { answered: 0, correct: 0, skipped: 0 };
    if (!isAnswered) {
      questionBucket.skipped += 1;
      questionBuckets.set(answer.question_id, questionBucket);
      for (const passageId of uniqueStrings([meta.passage_id, meta.cross_passage_id]
        .filter((id): id is string => Boolean(id)), 2)) {
        const bucket = passageBuckets.get(passageId) ?? { answered: 0, correct: 0, skipped: 0 };
        bucket.skipped += 1;
        passageBuckets.set(passageId, bucket);
      }
      continue;
    }
    if (typeof correctness !== "boolean") continue;
    answeredCount += 1;
    const correct = correctness ? 1 : 0;
    correctCount += correct;
    questionBucket.answered += 1;
    questionBucket.correct += correct;
    questionBuckets.set(answer.question_id, questionBucket);

    const tags = tagsByQuestion.get(answer.question_id) ?? [];
    for (const tag of tags) {
      const current = skillBuckets.get(tag) ?? { answered: 0, correct: 0 };
      current.answered += 1;
      current.correct += correct;
      skillBuckets.set(tag, current);
    }

    const answerPassageIds = uniqueStrings([meta.passage_id, meta.cross_passage_id]
      .filter((id): id is string => Boolean(id)), 2);
    for (const passageId of answerPassageIds) {
      const current = passageBuckets.get(passageId) ?? { answered: 0, correct: 0, skipped: 0 };
      current.answered += 1;
      current.correct += correct;
      passageBuckets.set(passageId, current);
    }

    if (typeof meta.difficulty === "number") {
      const current = difficultyBuckets.get(meta.difficulty) ?? { answered: 0, correct: 0 };
      current.answered += 1;
      current.correct += correct;
      difficultyBuckets.set(meta.difficulty, current);
    }
  }

  const skillStats = [...skillBuckets.entries()].map(([tagId, values]) => ({
    tag_id: tagId,
    tag_label: tagLabel.get(tagId) ?? tagId,
    answered: values.answered,
    correct: values.correct,
    answered_accuracy: ratio(values.correct, values.answered),
  }));

  const passageStats = [...passageBuckets.entries()].map(([passageId, values]) => ({
    passage_id: passageId,
    passage_title: passageTitle.get(passageId) ?? passageId,
    answered: values.answered,
    correct: values.correct,
    incorrect: values.answered - values.correct,
    skipped: values.skipped,
    answered_accuracy: ratio(values.correct, values.answered),
  }));

  const difficultyStats = [...difficultyBuckets.entries()]
    .map(([difficulty, values]) => ({
      difficulty,
      answered: values.answered,
      correct: values.correct,
      answered_accuracy: ratio(values.correct, values.answered),
    }))
    .sort((a, b) => a.difficulty - b.difficulty);

  const skippedCount = Math.max(0, overallTotal - answeredCount);
  const fullySkippedAttempts = attempts.filter((row) => !row.answers || Object.keys(row.answers).length === 0).length;
  const partialAttempts = attempts.filter((row) => Object.keys(row.answers ?? {}).length > 0 && Object.keys(row.answers ?? {}).length < Number(row.total ?? 0)).length;

  const sortedPassages = [...passageStats]
    .filter((row) => row.answered > 0 && row.answered_accuracy !== null)
    .sort((a, b) => {
      if ((b.answered_accuracy ?? 0) !== (a.answered_accuracy ?? 0)) return (b.answered_accuracy ?? 0) - (a.answered_accuracy ?? 0);
      return b.answered - a.answered;
    });
  const topPassagesBest = sortedPassages.slice(0, 3);
  const topPassagesWorst = [...sortedPassages]
    .sort((a, b) => {
      if ((a.answered_accuracy ?? 0) !== (b.answered_accuracy ?? 0)) return (a.answered_accuracy ?? 0) - (b.answered_accuracy ?? 0);
      return b.answered - a.answered;
    })
    .slice(0, 3);

  const recentAttempts = answeredAttempts.slice(0, 30).map((row) => ({
    id: row.id,
    quiz_id: row.quiz_id,
    score: row.score,
    total: row.total,
    submitted_at: row.submitted_at,
    time_spent_seconds: row.time_spent_seconds,
  }));

  const evidenceIds = [
    ...recentAttempts.map((row) => row.id),
    ...skillStats.slice(0, 12).map((row) => `tag:${row.tag_id}`),
    ...passageStats.slice(0, 12).map((row) => `passage:${row.passage_id}`),
  ];

  const focusedPassageIds = new Set(
    (resolvedPassageScope?.resolved_passages ?? []).flatMap((row) => row.app_passage_ids),
  );
  const focusedPassagePerformance = passageStats
    .filter((row) => focusedPassageIds.has(row.passage_id))
    .map((row) => ({ ...row }));

  const suspicionCandidates = [...questionBuckets.entries()]
    .map(([questionId, values]) => {
      const meta = questionMeta.get(questionId);
      const answeredAccuracy = ratio(values.correct, values.answered);
      const primaryPassageId = meta?.passage_id ?? null;
      const repeatedIncorrect = values.answered >= 2 && values.correct < values.answered;
      const repeatedlySkipped = values.skipped >= 2;
      const signal = repeatedlySkipped
        ? "repeatedly_skipped"
        : repeatedIncorrect
          ? "repeated_incorrect"
          : "low_mastery";
      return {
        question_id: questionId,
        passage_id: primaryPassageId,
        passage_title: primaryPassageId ? passageTitle.get(primaryPassageId) ?? null : null,
        question_text: questionStem.get(questionId) ?? null,
        tag_labels: (tagsByQuestion.get(questionId) ?? []).map((tagId) => tagLabel.get(tagId) ?? tagId),
        answered_times: values.answered,
        correct_times: values.correct,
        incorrect_times: values.answered - values.correct,
        skipped_times: values.skipped,
        mastery_accuracy: answeredAccuracy,
        signal,
      };
    })
    .filter((row) => row.incorrect_times > 0 || row.skipped_times > 0)
    .sort((a, b) => {
      const focusDelta = Number(focusedPassageIds.has(b.passage_id ?? "")) - Number(focusedPassageIds.has(a.passage_id ?? ""));
      if (focusDelta !== 0) return focusDelta;
      if (b.skipped_times !== a.skipped_times) return b.skipped_times - a.skipped_times;
      if (b.incorrect_times !== a.incorrect_times) return b.incorrect_times - a.incorrect_times;
      return (a.mastery_accuracy ?? 1) - (b.mastery_accuracy ?? 1);
    })
    .slice(0, 10);

  return {
    retrieval_scope: resolvedPassageScope ?? { requested_passages: [], resolved_passages: [], unresolved_passages: [] },
    overall: {
      submitted_attempts: answeredAttempts.length,
      answered_count: answeredCount,
      correct_count: correctCount,
      incorrect_count: answeredCount - correctCount,
      answered_accuracy: ratio(correctCount, answeredCount),
      quiz_score_rate: ratio(overallCorrect, overallTotal),
    },
    engagement: {
      expected_questions: overallTotal,
      skipped_count: skippedCount,
      completion_rate: ratio(answeredCount, overallTotal),
      fully_skipped_attempts: fullySkippedAttempts,
      partial_attempts: partialAttempts,
    },
    focused_passage_performance: focusedPassagePerformance,
    suspicion_candidates: suspicionCandidates,
    recent_attempts: recentAttempts,
    skill_stats: skillStats,
    passage_stats: passageStats,
    difficulty_stats: difficultyStats,
    top_passages_best: topPassagesBest,
    top_passages_worst: topPassagesWorst,
    coverage: {
      passages_attempted: passageStats.length,
      passages_total_available: totalPassagesAvailable,
      skills_attempted: skillStats.length,
      skills_total_available: tagDefRows.length,
    },
    evidence_ids: evidenceIds,
  };
}

function cleanList(values: unknown, limit: number) {
  if (!Array.isArray(values)) return [] as string[];
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, limit);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

const PERFORMANCE_DETAIL_ACTIONS = new Set([
  "question_diagnostics",
  "compare_passage_performance",
  "inspect_wrong_questions",
  "inspect_tag_performance",
  "inspect_recent_errors",
]);

const PERFORMANCE_DETAIL_INCLUDES = new Set([
  "question_text",
  "explanation",
  "selected_wrong_options",
  "correct_option",
  "time_spent",
  "recent_attempts",
]);

const QUESTION_BANK_DETAIL_ACTIONS = new Set([
  "similar_questions",
  "passage_trend",
  "question_type_trend",
  "marking_scheme_deep_dive",
  "year_comparison",
]);

const QUESTION_BANK_DETAIL_INCLUDES = new Set([
  "question_text",
  "specific_marking_notes",
  "suggested_answer",
  "trend_breakdown",
]);

export function normalizeQuestionBankDetailRequest(value: unknown): QuestionBankDetailRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const action = typeof input.action === "string" && QUESTION_BANK_DETAIL_ACTIONS.has(input.action)
    ? input.action
    : "similar_questions";
  const section = input.section_type === "designated" || input.section_type === "unseen" || input.section_type === "mixed"
    ? input.section_type
    : "mixed";
  const request: QuestionBankDetailRequest = {
    action,
    passage_names: cleanList(input.passage_names, 8),
    section_type: section,
    exam_year_from: clampInt(input.exam_year_from, 2000, 2100, 2000),
    exam_year_to: clampInt(input.exam_year_to, 2000, 2100, 2100),
    question_types: cleanList(input.question_types, 10),
    focus_terms: cleanList(input.focus_terms, 10),
    include: cleanList(input.include, 10).filter((item) => QUESTION_BANK_DETAIL_INCLUDES.has(item)),
    limit_questions: clampInt(input.limit_questions, 5, 30, 15),
    reason: typeof input.reason === "string" ? input.reason.slice(0, 300) : undefined,
  };
  if (request.exam_year_from! > request.exam_year_to!) {
    [request.exam_year_from, request.exam_year_to] = [request.exam_year_to, request.exam_year_from];
  }
  return request;
}

export function normalizePerformanceDetailRequest(value: unknown): PerformanceDetailRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const requestedAction = typeof input.action === "string" ? input.action.trim() : "";
  const request: PerformanceDetailRequest = {
    action: PERFORMANCE_DETAIL_ACTIONS.has(requestedAction)
      ? requestedAction
      : "question_diagnostics",
    question_ids: cleanList(input.question_ids, 40),
    passage_ids: cleanList(input.passage_ids, 20),
    passage_names: cleanList(input.passage_names, 8),
    tag_ids: cleanList(input.tag_ids, 20),
    tag_labels: cleanList(input.tag_labels, 20),
    include: cleanList(input.include, 10).filter((item) => PERFORMANCE_DETAIL_INCLUDES.has(item)),
    lookback_attempts: clampInt(input.lookback_attempts, 10, 160, 80),
    limit_questions: clampInt(input.limit_questions, 5, 40, 25),
    reason: typeof input.reason === "string" ? input.reason.slice(0, 300) : undefined,
  };
  if (
    (request.question_ids?.length ?? 0) === 0 &&
    (request.passage_ids?.length ?? 0) === 0 &&
    (request.passage_names?.length ?? 0) === 0 &&
    (request.tag_ids?.length ?? 0) === 0 &&
    (request.tag_labels?.length ?? 0) === 0 &&
    !requestedAction
  ) {
    return null;
  }
  return request;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[「」『』《》〈〉（）()\[\]【】,，。．、；：:！？!?.\-_/]/g, "");
}

function uniqueStrings(values: string[], limit: number) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
    if (output.length >= limit) break;
  }
  return output;
}

function messageTokens(query: string) {
  const chunks = query
    .split(/[\s,，。；;:：！？!?()（）\[\]【】"'“”‘’、《》〈〉]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  return uniqueStrings(chunks, 12);
}

function collapseText(value: string | null | undefined, limit: number) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function evidenceIdForPastExam(row: PastExamQuestionRow) {
  const year = row.exam_year ?? "na";
  const section = row.section_type ?? "na";
  const questionNo = row.question_number ?? "na";
  return `dse:${year}:${section}:${questionNo}`;
}

function detectDesignatedPassagesFromText(text: string) {
  const normalized = normalizeText(text);
  const matches: string[] = [];
  for (const def of DESIGNATED_PASSAGE_ALIASES) {
    const tokens = [def.canonical, ...def.aliases].map(normalizeText);
    if (tokens.some((token) => token && normalized.includes(token))) {
      matches.push(def.canonical);
    }
  }
  return uniqueStrings(matches, 6);
}

export function normalizeRetrievalHints(value: unknown): RetrievalHints | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const hintedPassages = uniqueStrings([
    ...cleanList(input.mentionedDesignatedPassages, 10),
    ...cleanList(input.mentioned_designated_passages, 10),
  ], 10);
  const focus = uniqueStrings([
    ...cleanList(input.questionBankFocus, 12),
    ...cleanList(input.question_bank_focus, 12),
  ], 12);
  if (hintedPassages.length === 0 && focus.length === 0) return null;
  return {
    mentionedDesignatedPassages: hintedPassages,
    questionBankFocus: focus,
  };
}

async function loadQuestionBankSnapshot(
  supabase: SupabaseClient,
  query: string,
  retrievalHints?: RetrievalHints,
  resolvedPassageScope?: ResolvedPassageScope,
  detailRequest?: QuestionBankDetailRequest,
) {
  const hintedPassages = uniqueStrings([
    ...(retrievalHints?.mentionedDesignatedPassages ?? []),
    ...cleanList(detailRequest?.passage_names, 8),
  ], 8);
  const detectedPassages = detectDesignatedPassagesFromText(query);
  const matchedPassages = uniqueStrings([...hintedPassages, ...detectedPassages], 6);
  const requestedSection = detailRequest?.section_type;
  const forceDesignated = requestedSection === "designated" || (
    requestedSection !== "unseen" &&
    (matchedPassages.length > 0 || /(指定|十二篇|12篇|範文|指定篇章)/.test(query))
  );

  const focusTerms = uniqueStrings([
    ...(retrievalHints?.questionBankFocus ?? []),
    ...cleanList(detailRequest?.focus_terms, 10),
  ], 10);
  const searchTerms = uniqueStrings([...focusTerms, ...messageTokens(query)], 10);
  const requestScope = detailRequest?.passage_names?.length
    ? await resolvePassageScope(supabase, { mentionedDesignatedPassages: detailRequest.passage_names })
    : undefined;
  const titlePatterns = uniqueStrings([
    ...(resolvedPassageScope?.resolved_passages ?? []).flatMap((row) => row.past_exam_title_patterns),
    ...(requestScope?.resolved_passages ?? []).flatMap((row) => row.past_exam_title_patterns),
    ...matchedPassages,
  ], 30);
  const limitQuestions = detailRequest?.limit_questions ?? 10;

  let similarQuery = supabase
    .from("dsemcq_dse_past_exam_questions")
    .select([
      "exam_year",
      "section_type",
      "passage_bucket",
      "passage_title",
      "question_number",
      "question_text",
      "score",
      "question_type_norm",
      "specific_marking_notes",
      "suggested_answer_text",
    ].join(", "))
    .order("exam_year", { ascending: false });

  let trendQuery = supabase
    .from("dsemcq_dse_past_exam_questions")
    .select("exam_year, section_type, question_type_norm, score, passage_title")
    .order("exam_year", { ascending: false });

  if (forceDesignated) {
    similarQuery = similarQuery.eq("section_type", "designated");
    trendQuery = trendQuery.eq("section_type", "designated");
  } else if (requestedSection === "unseen") {
    similarQuery = similarQuery.eq("section_type", "unseen");
    trendQuery = trendQuery.eq("section_type", "unseen");
  }

  if (titlePatterns.length > 0) {
    const passageFilters = titlePatterns.map((value) => `passage_title.ilike.%${value}%`).join(",");
    similarQuery = similarQuery.or(passageFilters);
    trendQuery = trendQuery.or(passageFilters);
  } else if (searchTerms.length > 0) {
    const clauses: string[] = [];
    for (const term of searchTerms.slice(0, 7)) {
      clauses.push(`question_text.ilike.%${term}%`);
      clauses.push(`passage_title.ilike.%${term}%`);
      clauses.push(`question_type_norm.ilike.%${term}%`);
    }
    similarQuery = similarQuery.or(clauses.join(","));
  }

  if (detailRequest) {
    similarQuery = similarQuery
      .gte("exam_year", detailRequest.exam_year_from ?? 2000)
      .lte("exam_year", detailRequest.exam_year_to ?? 2100);
    trendQuery = trendQuery
      .gte("exam_year", detailRequest.exam_year_from ?? 2000)
      .lte("exam_year", detailRequest.exam_year_to ?? 2100);
    const questionTypes = cleanList(detailRequest.question_types, 10);
    if (questionTypes.length > 0) {
      similarQuery = similarQuery.in("question_type_norm", questionTypes);
      trendQuery = trendQuery.in("question_type_norm", questionTypes);
    }
  }

  const similarRows = await fetchAllPages<PastExamQuestionRow>((from, to) => similarQuery.range(from, to));
  const trendRows = await fetchAllPages<{
    exam_year: number | null;
    section_type: string | null;
    question_type_norm: string | null;
    score: number | null;
    passage_title: string | null;
  }>((from, to) => trendQuery.range(from, to));

  const selectedRows = [...similarRows]
    .sort((a, b) => {
      const yearDelta = (b.exam_year ?? 0) - (a.exam_year ?? 0);
      if (yearDelta !== 0) return yearDelta;
      return (b.score ?? 0) - (a.score ?? 0);
    })
    .slice(0, limitQuestions);

  const similarQuestions = selectedRows.map((row) => ({
    exam_year: row.exam_year,
    section_type: row.section_type,
    passage_bucket: row.passage_bucket,
    passage_title: row.passage_title,
    question_number: row.question_number,
    question_type_norm: row.question_type_norm,
    score: row.score,
    question_text: collapseText(row.question_text, 220),
    evidence_id: evidenceIdForPastExam(row),
  }));

  const markingSkillNotes = selectedRows
    .map((row) => ({
      exam_year: row.exam_year,
      question_number: row.question_number,
      passage_title: row.passage_title,
      specific_marking_notes: collapseText(row.specific_marking_notes, 220),
      suggested_answer_text: collapseText(row.suggested_answer_text, 220),
      evidence_id: evidenceIdForPastExam(row),
    }))
    .filter((row) => row.specific_marking_notes || row.suggested_answer_text)
    .slice(0, 8);

  const trendBucket = new Map<string, { count: number; totalScore: number; years: Set<number> }>();
  for (const row of trendRows) {
    const key = `${row.section_type ?? "unknown"}|${row.question_type_norm ?? "other"}`;
    const bucket = trendBucket.get(key) ?? { count: 0, totalScore: 0, years: new Set<number>() };
    bucket.count += 1;
    bucket.totalScore += Number(row.score ?? 0);
    if (typeof row.exam_year === "number") bucket.years.add(row.exam_year);
    trendBucket.set(key, bucket);
  }
  const trendSignals = [...trendBucket.entries()]
    .map(([key, value]) => {
      const [sectionType, questionTypeNorm] = key.split("|");
      const years = [...value.years].sort((a, b) => b - a);
      return {
        section_type: sectionType,
        question_type_norm: questionTypeNorm,
        frequency: value.count,
        avg_score: value.count > 0 ? value.totalScore / value.count : null,
        recent_years: years.slice(0, 5),
      };
    })
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 8);

  const evidenceIds = uniqueStrings([
    ...similarQuestions.map((row) => row.evidence_id),
    ...markingSkillNotes.map((row) => row.evidence_id),
  ], 20);

  return {
    retrieval_coverage: {
      matching_question_rows_scanned: similarRows.length,
      matching_trend_rows_scanned: trendRows.length,
      evidence_rows_returned: selectedRows.length,
    },
    resolved_request: detailRequest ? {
      action: detailRequest.action,
      passage_names: cleanList(detailRequest.passage_names, 8),
      section_type: forceDesignated ? "designated" : requestedSection ?? "mixed",
      exam_year_from: detailRequest.exam_year_from,
      exam_year_to: detailRequest.exam_year_to,
      question_types: cleanList(detailRequest.question_types, 10),
      focus_terms: focusTerms,
      include: cleanList(detailRequest.include, 10),
      limit_questions: limitQuestions,
    } : null,
    retrieval_mode: {
      section_filter: forceDesignated ? "designated" : "mixed",
      matched_designated_passages: matchedPassages,
      resolved_passage_scope: resolvedPassageScope ?? requestScope ?? null,
      focus_terms: focusTerms,
      search_terms: searchTerms,
    },
    similar_questions: similarQuestions,
    trend_signals: trendSignals,
    marking_skill_notes: markingSkillNotes,
    data_gap_notes: similarQuestions.length > 0
      ? []
      : ["No matching records found from dsemcq_dse_past_exam_questions with current filters."],
    evidence_ids: evidenceIds,
  };
}

export async function loadPerformanceDetail(
  supabase: SupabaseClient,
  userId: string,
  detailRequest: PerformanceDetailRequest,
  resolvedPassageScope?: ResolvedPassageScope,
) {
  const limitQuestions = clampInt(detailRequest.limit_questions, 5, 40, 25);

  const attempts = await fetchAllPages<{ id: string; submitted_at: string | null; answers: Record<string, string> | null }>((from, to) => supabase
    .from("dsemcq_attempts")
    .select("id, submitted_at, answers")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .range(from, to));

  let candidateQuestionIds = cleanList(detailRequest.question_ids, 80);
  const requestedNameScope = await resolvePassageScope(supabase, {
    mentionedDesignatedPassages: cleanList(detailRequest.passage_names, 8),
  });
  const passageIds = uniqueStrings([
    ...cleanList(detailRequest.passage_ids, 20),
    ...(resolvedPassageScope?.resolved_passages ?? []).flatMap((row) => row.app_passage_ids),
    ...requestedNameScope.resolved_passages.flatMap((row) => row.app_passage_ids),
  ], 20);
  let tagIds = cleanList(detailRequest.tag_ids, 20);
  const tagLabels = cleanList(detailRequest.tag_labels, 20);

  if (tagLabels.length > 0) {
    const normalizedLabels = new Set(tagLabels.map(normalizeText));
    const { data, error } = await supabase.from("dsemcq_tags").select("id, label");
    if (error) throw error;
    const resolvedTagIds = (data ?? [])
      .filter((row: { id: string; label: string }) => normalizedLabels.has(normalizeText(row.label)))
      .map((row: { id: string }) => row.id);
    tagIds = uniqueStrings([...tagIds, ...resolvedTagIds], 20);
  }

  if (candidateQuestionIds.length === 0 && passageIds.length > 0) {
    const rows = await fetchAllPages<{ id: string }>((from, to) => supabase
      .from("dsemcq_questions")
      .select("id")
      .or(`passage_id.in.(${passageIds.join(",")}),cross_passage_id.in.(${passageIds.join(",")})`)
      .eq("is_active", true)
      .range(from, to));
    candidateQuestionIds = rows.map((row) => row.id);
  }

  if (tagIds.length > 0) {
    const rows = await fetchAllPages<{ question_id: string }>((from, to) => supabase
      .from("dsemcq_question_tags")
      .select("question_id, tag_id")
      .in("tag_id", tagIds)
      .range(from, to));
    const byTag = rows.map((row) => row.question_id);
    candidateQuestionIds = candidateQuestionIds.length > 0
      ? candidateQuestionIds.filter((id) => byTag.includes(id))
      : byTag;
  }

  candidateQuestionIds = [...new Set(candidateQuestionIds)];
  if (candidateQuestionIds.length === 0) {
    return {
      resolved_request: {
        action: detailRequest.action ?? "question_diagnostics",
        passage_ids: passageIds,
        passage_names: cleanList(detailRequest.passage_names, 8),
        tag_ids: tagIds,
        tag_labels: tagLabels,
        include: cleanList(detailRequest.include, 10),
      },
      retrieval_coverage: {
        submitted_attempts_scanned: attempts.length,
        candidate_questions_scanned: candidateQuestionIds.length,
        evidence_questions_returned: 0,
      },
      reason: detailRequest.reason ?? null,
      question_diagnostics: [],
      data_gaps: ["No student question history matched the resolved selectors."],
      evidence_ids: [],
    };
  }

  const attemptIds = attempts.map((row) => row.id);
  const [questionRows, optionRows, answerRows] = await Promise.all([
    batchIn<QuestionMeta & { stem: string; explanation: string | null }>(
      supabase,
      "dsemcq_questions",
      "id",
      candidateQuestionIds,
      "id, passage_id, cross_passage_id, difficulty, stem, explanation",
    ),
    batchIn<{ id: string; question_id: string; text: string; is_correct: boolean }>(
      supabase,
      "dsemcq_question_options",
      "question_id",
      candidateQuestionIds,
      "id, question_id, text, is_correct",
    ),
    attemptIds.length > 0
      ? batchIn<AnswerRow>(
        supabase,
        "dsemcq_attempt_answers",
        "attempt_id",
        attemptIds,
        "attempt_id, question_id, selected_option_id, is_correct",
      )
      : Promise.resolve([] as AnswerRow[]),
  ]);

  const questionMeta = new Map<string, QuestionMeta>(questionRows.map((row) => [row.id, row]));
  const detailPassageIds = uniqueStrings(questionRows.flatMap((row) => [row.passage_id, row.cross_passage_id]
    .filter((id): id is string => Boolean(id))), 40);
  const detailPassages = detailPassageIds.length > 0
    ? await batchIn<PassageRow>(supabase, "dsemcq_passages", "id", detailPassageIds, "id, title")
    : [];
  const detailPassageTitle = new Map(detailPassages.map((row) => [row.id, row.title]));
  const correctOptionByQuestion = new Map<string, { id: string; text: string }>();
  for (const option of optionRows) {
    if (option.is_correct && !correctOptionByQuestion.has(option.question_id)) {
      correctOptionByQuestion.set(option.question_id, { id: option.id, text: option.text });
    }
  }
  const optionById = new Map(optionRows.map((row) => [row.id, row]));

  const diagnostics = new Map<string, {
    attempted: number;
    correct: number;
    incorrect: number;
    skipped: number;
    selected_wrong_options: Record<string, number>;
    passage_id: string | null;
    difficulty: number | null;
  }>();

  for (const answer of answerRows) {
    if (!candidateQuestionIds.includes(answer.question_id)) continue;
    if (!diagnostics.has(answer.question_id)) {
      const meta = questionMeta.get(answer.question_id);
      diagnostics.set(answer.question_id, {
        attempted: 0,
        correct: 0,
        incorrect: 0,
        skipped: 0,
        selected_wrong_options: {},
        passage_id: meta?.passage_id ?? null,
        difficulty: meta?.difficulty ?? null,
      });
    }
    const bucket = diagnostics.get(answer.question_id)!;
    if (!answer.selected_option_id) {
      bucket.skipped += 1;
      continue;
    }
    const correctness = typeof answer.is_correct === "boolean"
      ? answer.is_correct
      : optionById.get(answer.selected_option_id)?.is_correct;
    if (typeof correctness !== "boolean") continue;
    bucket.attempted += 1;
    if (correctness) {
      bucket.correct += 1;
    } else {
      bucket.incorrect += 1;
      bucket.selected_wrong_options[answer.selected_option_id] = (bucket.selected_wrong_options[answer.selected_option_id] ?? 0) + 1;
    }
  }

  const allQuestionDiagnostics = [...diagnostics.entries()].map(([questionId, bucket]) => {
    const wrongOptionRanks = Object.entries(bucket.selected_wrong_options)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([optionId, count]) => ({
        option_id: optionId,
        option_text: optionById.get(optionId)?.text ?? null,
        chosen_count: count,
      }));
    const correctOption = correctOptionByQuestion.get(questionId);
    return {
      question_id: questionId,
      passage_id: bucket.passage_id,
      passage_title: bucket.passage_id ? detailPassageTitle.get(bucket.passage_id) ?? null : null,
      question_text: (questionMeta.get(questionId) as (QuestionMeta & { stem?: string }))?.stem ?? null,
      explanation: (questionMeta.get(questionId) as (QuestionMeta & { explanation?: string | null }))?.explanation ?? null,
      difficulty: bucket.difficulty,
      attempted: bucket.attempted,
      correct: bucket.correct,
      incorrect: bucket.incorrect,
      skipped: bucket.skipped,
      accuracy: ratio(bucket.correct, bucket.attempted),
      correct_option_id: correctOption?.id ?? null,
      correct_option_text: correctOption?.text ?? null,
      top_wrong_selected_options: wrongOptionRanks,
    };
  });
  const questionDiagnostics = allQuestionDiagnostics
    .sort((a, b) => {
      if (b.incorrect !== a.incorrect) return b.incorrect - a.incorrect;
      return (a.accuracy ?? 1) - (b.accuracy ?? 1);
    })
    .slice(0, limitQuestions);

  return {
    resolved_request: {
      action: detailRequest.action ?? "question_diagnostics",
      passage_ids: passageIds,
      passage_names: cleanList(detailRequest.passage_names, 8),
      tag_ids: tagIds,
      tag_labels: tagLabels,
      include: cleanList(detailRequest.include, 10),
    },
    retrieval_coverage: {
      submitted_attempts_scanned: attempts.length,
      candidate_questions_scanned: candidateQuestionIds.length,
      question_diagnostics_calculated: allQuestionDiagnostics.length,
      evidence_questions_returned: questionDiagnostics.length,
    },
    reason: detailRequest.reason ?? null,
    question_diagnostics: questionDiagnostics,
    data_gaps: questionDiagnostics.length > 0 ? [] : ["The resolved questions have no submitted answer history for this student."],
    evidence_ids: questionDiagnostics.map((row) => row.question_id),
  };
}

export async function retrieveRecentChatContext(
  supabase: SupabaseClient,
  userId: string,
  excludedRequestId?: string,
  enabled = true,
): Promise<RecentChatContext> {
  if (!enabled) return { bubbles: [], truncated: false };

  let query = supabase
    .from("dsemcq_advisor_v2_messages")
    .select("request_id, user_text, bot_reply, status, created_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("bot_reply", "is", null)
    .order("created_at", { ascending: false })
    .order("request_id", { ascending: false })
    .limit(6);

  if (excludedRequestId) query = query.neq("request_id", excludedRequestId);

  const { data, error } = await query;
  if (error) {
    console.warn("Advisor V2 recent chat history unavailable", { userId, error: error.message });
    return { bubbles: [], truncated: false };
  }

  const validRows = (data as Array<{
    request_id: string | null;
    user_text: string | null;
    bot_reply: string | null;
    created_at: string | null;
  }> ?? [])
    .filter((row) => Boolean(row.user_text?.trim()) && Boolean(row.bot_reply?.trim()));
  const truncated = validRows.length > 5;
  const selectedRows = validRows.slice(0, 5);
  const bubbles = selectedRows
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .flatMap((row) => {
      return [
        { role: "user" as const, text: row.user_text!.trim() },
        { role: "assistant" as const, text: row.bot_reply!.trim() },
      ];
    });
  return { bubbles, truncated };
}

export async function retrieveRecentChatBubbles(
  supabase: SupabaseClient,
  userId: string,
  excludedRequestId?: string,
  enabled = true,
): Promise<RecentChatBubble[]> {
  const context = await retrieveRecentChatContext(supabase, userId, excludedRequestId, enabled);
  return context.bubbles;
}

export async function retrieveSource(
  supabase: SupabaseClient,
  userId: string,
  source: Source,
  query: string,
  options: RetrieveOptions = {},
) {
  if (source === "profile") {
    const historyRowsPromise = options.conversationHistoryEnabled === false
      ? Promise.resolve([])
      : supabase
        .from("dsemcq_advisor_v2_messages")
        .select("request_id, user_text, bot_reply, status, created_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .not("bot_reply", "is", null)
        .order("created_at", { ascending: false })
        .order("request_id", { ascending: false })
        .limit(5)
        .then(({ data, error }) => {
          if (error) throw error;
          return data ?? [];
        });
    const [profileData, psychData, historyRows] = await Promise.all([
      supabase
        .from("dsemcq_profiles")
        .select("id, username, gender, dse_year, subscription_tier, wenyuan_points, created_at")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
      supabase
        .from("dsemcq_psych_user_results")
        .select("test_id, result_code, completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(8)
        .then(({ data, error }) => {
          if (error) throw error;
          return data ?? [];
        }),
      historyRowsPromise,
    ]);

    const psychEvidence = psychData.map((row) => `psych:${row.test_id}:${row.result_code}`);
    const chatBubbles = (historyRows as Array<
      { request_id: string; user_text: string; bot_reply: string | null; created_at: string }
    >)
      .filter((row) => Boolean(row.user_text?.trim()) && Boolean(row.bot_reply?.trim()))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((row) => {
        const bubbles = [{ role: "user", text: row.user_text, created_at: row.created_at, request_id: row.request_id }];
        if (row.bot_reply && row.bot_reply.trim()) {
          bubbles.push({ role: "assistant", text: row.bot_reply, created_at: row.created_at, request_id: row.request_id });
        }
        return bubbles;
      })
      .slice(-10);

    return {
      profile: profileData,
      psych_results: psychData,
      chat_history: chatBubbles,
      evidence_ids: psychEvidence.slice(0, 80),
    };
  }

  if (source === "performance") {
    if (options.performanceDetailRequest) {
      return await loadPerformanceDetail(
        supabase,
        userId,
        options.performanceDetailRequest,
        options.resolvedPassageScope,
      );
    }
    const passageScope = options.resolvedPassageScope ?? await resolvePassageScope(supabase, options.retrievalHints);
    return await loadPerformanceSnapshot(supabase, userId, passageScope);
  }

  const passageScope = options.resolvedPassageScope ?? await resolvePassageScope(supabase, options.retrievalHints);
  return await loadQuestionBankSnapshot(
    supabase,
    query,
    options.retrievalHints,
    passageScope,
    options.questionBankDetailRequest,
  );
}

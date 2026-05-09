/**
 * Deterministic seeded shuffle for quiz options.
 *
 * Goal: given the same seed, always produce the same shuffle so that the
 * option order (A/B/C/D labels) is identical between QuizRunnerScreen and
 * QuizResultScreen for the same attempt.
 *
 * Seed convention: `${attemptId}:${questionId}`
 */

import { Question, QuestionOption } from "../types/database";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

/** Linear-congruential PRNG seeded by a string (djb2 hash → LCG). */
function makePrng(seed: string): () => number {
  let state = 5381;
  for (let i = 0; i < seed.length; i++) {
    state = (((state << 5) + state) ^ seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** In-place Fisher-Yates shuffle using the provided PRNG. */
function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Shuffle the options of every question using a deterministic seed derived
 * from the attempt ID and question ID.  Assigns A/B/C/D labels based on the
 * shuffled position.
 *
 * Call this in both QuizRunnerScreen (during play) and QuizResultScreen (when
 * reviewing) with the same attemptId to guarantee consistent label order.
 */
export function shuffleOptionsForAttempt(questions: Question[], attemptId: string): Question[] {
  return questions.map((q) => {
    const rand = makePrng(`${attemptId}:${q.id}`);
    const shuffled = seededShuffle(q.options, rand);
    return {
      ...q,
      options: shuffled.map((opt, idx) => ({
        ...opt,
        label: OPTION_LABELS[idx] ?? String(idx + 1),
      })),
    };
  });
}

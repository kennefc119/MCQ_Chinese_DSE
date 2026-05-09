/** Shared display helpers for quiz cards and calendar records. */

export const SKILL_LABELS = [
  "字詞解釋", "內容理解", "主旨歸納", "修辭手法",
  "人物分析", "句式語法", "背景知識", "跨篇章比較",
] as const;

export type SkillLabel = typeof SKILL_LABELS[number];

/** Extract a known skill label from a quiz title, if present. */
export function extractSkillFromTitle(title: string): SkillLabel | undefined {
  return SKILL_LABELS.find((skill) => title.includes(skill));
}

/** Strip numeric / passage-code prefixes like "p01 - ", "篇章07", "第一篇" */
export function cleanPassageName(title?: string): string | undefined {
  if (!title) return undefined;
  return title
    .replace(/^(p\d+|第[一二三四五六七八九十\d]+篇|篇章[一二三四五六七八九十\d]+)\s*[-—–：:·\s]*/i, "")
    .trim() || title;
}

/**
 * Given a quiz title and a hero text (passage name or skill name),
 * return the quiz-type suffix to show beneath the hero (e.g. "練習題").
 */
export function getQuizTypeSuffix(title: string, heroText: string): string {
  const stripped = title
    .replace(heroText, "")
    .replace(/^(篇章|p)\d+\s*[-—–：:·（()\s]*/i, "")
    .replace(/[（(）)]/g, "")
    .trim();
  return stripped || title;
}

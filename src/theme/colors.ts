// 文人/古典書院主題 — 深墨配金
export const colors = {
  background: "#15110D",
  surface: "#1F1A14",
  surfaceAlt: "#2A2218",
  primary: "#D4A24C",       // 金黃 — 主要強調色
  primarySoft: "#B68A3E",
  accent: "#C75D4E",        // 朱紅 — 印章色
  ink: "#E9DDC4",           // 米白 — 古紙
  success: "#7DB97A",
  error: "#D9534F",
  danger: "#D9534F",
  warning: "#E8B547",
  textPrimary: "#F4ECDC",
  textSecondary: "#A89880",
  textMuted: "#7A6C58",
  border: "#3A2F22",
  lock: "#5C4A33",
} as const;

export const QUIZ_TYPE_COLORS: Record<string, string> = {
  exercise: "#7DB97A",
  quiz: "#D4A24C",
  exam: "#C75D4E",
};

export const QUIZ_TYPE_LABEL: Record<string, string> = {
  exercise: "練習",
  quiz: "測驗",
  exam: "模擬試",
};

// 文人 / 書院 — 米紙配朱印
// Light "rice paper" palette. Ink-on-paper metaphor.
// Dark palette is preserved at the bottom as a commented block for a future toggle.
export const colors = {
  background: "#F5EFE3",      // 米紙 — warm rice paper
  surface: "#FBF6EA",         // 牙白 — slightly lighter, for cards lifting off the page
  surfaceAlt: "#EDE4D2",      // 淺褐 — subtle inset for inputs / secondary chrome
  surfaceSunken: "#EDE4D2",   // alias of surfaceAlt
  primary: "#B23A2E",         // 朱印 — cinnabar seal, the brand accent
  primarySoft: "#D9847A",     // 朱印淡 — tints, hover/pressed states
  primaryOnDark: "#FBF6EA",   // text colour on top of primary
  accent: "#B23A2E",          // alias — keep code that referenced accent working
  gold: "#B68A3E",            // 古金 — sparing accent only, never for chrome buttons
  ink: "#1F1A14",             // 墨 — true ink, primary text
  inkSoft: "#4A3F30",         // 墨淡 — secondary text
  inkMuted: "#8A7B62",        // 墨褪 — tertiary, captions
  textPrimary: "#1F1A14",     // alias of ink
  textSecondary: "#4A3F30",   // alias of inkSoft
  textMuted: "#8A7B62",       // alias of inkMuted
  muted: "#8A7B62",           // alias — older callsites used colors.muted directly
  hairline: "#D9CCB0",        // 細紋 — 1px borders
  border: "#D9CCB0",          // alias
  lock: "#A89880",
  success: "#5C8A50",         // 竹綠
  error: "#B23A2E",           // reuse seal — visually consistent
  danger: "#B23A2E",          // alias
  warning: "#C28A1E",         // 琥珀
  // Tints used in chips / soft surfaces
  successSoft: "#E4EFDA",
  errorSoft: "#F4DCD8",
  warningSoft: "#F4E5C8",
} as const;

// Quiz-type accent colours, tuned for legibility on the rice-paper background.
export const QUIZ_TYPE_COLORS: Record<string, string> = {
  exercise: "#5C8A50",   // 竹綠 — practice
  quiz: "#B68A3E",       // 古金 — quiz
  exam: "#B23A2E",       // 朱印 — exam
};

// 文人 / 書院 — 深墨配金 (legacy dark palette, kept for future toggle)
// export const colorsDark = {
//   background: "#15110D", surface: "#1F1A14", surfaceAlt: "#2A2218",
//   primary: "#D4A24C", primarySoft: "#B68A3E", accent: "#C75D4E",
//   ink: "#E9DDC4", success: "#7DB97A", error: "#D9534F", danger: "#D9534F",
//   warning: "#E8B547", textPrimary: "#F4ECDC", textSecondary: "#A89880",
//   textMuted: "#7A6C58", border: "#3A2F22", lock: "#5C4A33",
// } as const;

export const QUIZ_TYPE_LABEL: Record<string, string> = {
  exercise: "練習",
  quiz: "測驗",
  exam: "模擬試",
};

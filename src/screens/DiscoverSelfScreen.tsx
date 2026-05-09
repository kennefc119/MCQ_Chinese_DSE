import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { PsychTest, Attempt, Quiz, Passage } from "../types/database";
import { listPsychTests, listUserAttempts, listQuizzes, listPassages, listUserPsychResults } from "../lib/dataService";
import { SEED_QUESTIONS } from "../data/seedQuestions";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import RadarChart from "../components/RadarChart";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const PSYCH_ICON_MAP: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  "person.fill.questionmark": "help-circle",
  "books.vertical.fill": "library",
  "graduationcap.fill": "school",
};

const SKILL_TAGS = [
  { id: "t-meaning",      label: "字詞解釋" },
  { id: "t-comprehension",label: "內容理解" },
  { id: "t-theme",        label: "主旨歸納" },
  { id: "t-rhetoric",     label: "修辭手法" },
  { id: "t-character",    label: "人物分析" },
  { id: "t-grammar",      label: "句式語法" },
  { id: "t-context",      label: "背景知識" },
  { id: "t-comparison",   label: "跨篇章比較" },
] as const;

// Seed question lookup for per-tag accuracy analysis
const SEED_Q_MAP = Object.fromEntries(SEED_QUESTIONS.map((q) => [q.id, q]));

export default function DiscoverSelfScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  // Available width inside analyticsCard (FlatList padding + card padding = 4×spacing.md)
  const CHART_W = screenWidth - spacing.md * 4;

  const [tests, setTests]       = useState<PsychTest[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [quizzes, setQuizzes]   = useState<Quiz[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [userPsychResults, setUserPsychResults] = useState<Record<string, { result_code: string; completed_at: string }>>({});

  useEffect(() => {
    listPsychTests().then(setTests);
    listPassages().then(setPassages);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    Promise.all([listUserAttempts(user.id), listQuizzes(), listUserPsychResults(user.id)]).then(([as, qs, pr]) => {
      setAttempts(as.filter((a) => a.status === "submitted"));
      setQuizzes(qs);
      setUserPsychResults(pr);
    });
  }, [user]));

  const quizMap = useMemo(
    () => quizzes.reduce<Record<string, Quiz>>((m, q) => ({ ...m, [q.id]: q }), {}),
    [quizzes],
  );

  // ── Passage radar (12 axes) ──────────────────────────────────────────
  const { passageAxes, passageValues } = useMemo(() => {
    // Use actual passage titles from DB, stripping "(節錄)" suffix
    const axes = passages.map((p) => p.title.replace(/（節錄）$/, ""));
    // Aggregate: sum correct / sum total across all attempts for each passage
    const values = passages.map((p) => {
      const pa = attempts.filter((a) => quizMap[a.quiz_id]?.passage_id === p.id);
      if (pa.length === 0) return 0;
      const totalCorrect = pa.reduce((s, a) => s + (a.score ?? 0), 0);
      const totalAnswered = pa.reduce((s, a) => s + (a.total ?? 0), 0);
      if (totalAnswered === 0) return 0;
      return Math.round((totalCorrect / totalAnswered) * 100);
    });
    return { passageAxes: axes, passageValues: values };
  }, [passages, attempts, quizMap]);

  // ── Skills radar (8 axes) via per-question answer analysis ───────────
  const { skillAxes, skillValues } = useMemo(() => {
    const correct: Record<string, number> = {};
    const total:   Record<string, number> = {};

    for (const attempt of attempts) {
      for (const [questionId, selectedOptionId] of Object.entries(attempt.answers ?? {})) {
        const q = SEED_Q_MAP[questionId];
        if (!q) continue;
        const correctOpt = q.options.find((o) => o.is_correct);
        const isCorrect = correctOpt?.id === selectedOptionId;
        for (const tagId of q.tag_ids ?? []) {
          correct[tagId] = (correct[tagId] ?? 0) + (isCorrect ? 1 : 0);
          total[tagId]   = (total[tagId]   ?? 0) + 1;
        }
      }
    }

    const axes   = SKILL_TAGS.map((t) => t.label);
    const values = SKILL_TAGS.map((t) => {
      const tot = total[t.id] ?? 0;
      if (tot === 0) return 0;
      return Math.round((correct[t.id] ?? 0) / tot * 100);
    });
    return { skillAxes: axes, skillValues: values };
  }, [attempts]);

  const hasData = attempts.length >= 3;

  const ListHeader = (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>認識自己</Text>
        <Text style={styles.subtitle}>輕鬆小測驗　・　了解學習風格與職涯傾向</Text>
      </View>

      {/* ── Passage radar ─────────────────────────── */}
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsTitle}>📚 篇章掌握度</Text>
        <Text style={styles.analyticsHint}>各篇章答題平均得分率（完成 3 次以上練習後更新）</Text>
        {hasData && passages.length === 12 ? (
          <View style={styles.chartCenter}>
            <RadarChart
              axes={passageAxes}
              values={passageValues}
              color={colors.primary}
              width={CHART_W}
              height={CHART_W}
            />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {passages.length < 12 ? "載入篇章中…" : "完成 3 次以上練習後顯示篇章雷達圖"}
            </Text>
          </View>
        )}
      </View>

      {/* ── Skills radar ──────────────────────────── */}
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsTitle}>🎯 能力分析</Text>
        <Text style={styles.analyticsHint}>各語文能力答題正確率（基於種子題庫）</Text>
        {hasData ? (
          <View style={styles.chartCenter}>
            <RadarChart
              axes={skillAxes}
              values={skillValues}
              color={colors.accent}
              width={CHART_W}
              height={Math.round(CHART_W * 0.85)}
            />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>完成 3 次以上練習後顯示能力雷達圖</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>心理小測驗</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={tests}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.md }}
        ListHeaderComponent={ListHeader}
        renderItem={({ item: test }) => {
          const pastResult = userPsychResults[test.id];
          const resultMapping = pastResult
            ? test.results.find((r) => r.code === pastResult.result_code)
            : null;
          return (
            <TouchableOpacity
              style={[styles.card, test.color_hex ? { backgroundColor: test.color_hex + "22" } : null]}
              activeOpacity={0.85}
              onPress={() => nav.navigate("PsychTest", { testId: test.id })}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={PSYCH_ICON_MAP[test.icon_name] ?? "sparkles"}
                  size={24}
                  color={test.color_hex ?? colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{test.title}</Text>
                <Text style={styles.cardDesc}>{test.description}</Text>
                <Text style={styles.cardMeta}>📝 {test.question_count} 題　・　⏱ 約 {test.estimated_minutes} 分鐘</Text>
                {resultMapping && (
                  <View style={styles.resultBadge}>
                    <Text style={styles.resultBadgeText}>上次：{resultMapping.emoji} {resultMapping.title}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { marginBottom: spacing.md },
  title: { ...typography.title, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  analyticsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyticsTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 15, marginBottom: 2 },
  analyticsHint: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm },
  chartCenter: { alignItems: "center" },
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  placeholderText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.md,
  },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardDesc: { color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  resultBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultBadgeText: { color: colors.textSecondary, fontSize: 12 },
});


import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { Attempt, Quiz } from "../types/database";
import { listUserAttempts, listQuizzes } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";

export default function PointHistoryScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([listUserAttempts(user.id), listQuizzes()]).then(([as, qs]) => {
        setAttempts(as.filter((a) => a.status === "submitted"));
        setQuizzes(qs);
      });
    }, [user]),
  );

  const quizMap = useMemo(
    () => quizzes.reduce<Record<string, Quiz>>((m, q) => ({ ...m, [q.id]: q }), {}),
    [quizzes],
  );

  const sorted = useMemo(
    () =>
      [...attempts].sort((a, b) =>
        (b.submitted_at ?? b.started_at).localeCompare(a.submitted_at ?? a.started_at),
      ),
    [attempts],
  );

  const getPointsEarned = useCallback(
    (attempt: Attempt): number => {
      const quiz = quizMap[attempt.quiz_id];
      if (!quiz || attempt.score == null || attempt.total === 0) return 0;
      return attempt.score / attempt.total >= (quiz.pass_score ?? 60) / 100
        ? (quiz.points_reward ?? 0)
        : 0;
    },
    [quizMap],
  );

  const totalPoints = useMemo(
    () => sorted.reduce((sum, a) => sum + getPointsEarned(a), 0),
    [sorted, getPointsEarned],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>積分記錄</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.md }}
        ListHeaderComponent={
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>累積文淵點</Text>
            <Text style={styles.summaryValue}>{totalPoints}</Text>
            <Text style={styles.summaryHint}>共 {sorted.length} 次完成記錄</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暫未有紀錄。完成測驗即見此處。</Text>
          </View>
        }
        renderItem={({ item: attempt }) => {
          const quiz = quizMap[attempt.quiz_id];
          const pts = getPointsEarned(attempt);
          const pct =
            attempt.score != null && attempt.total > 0
              ? Math.round((attempt.score / attempt.total) * 100)
              : null;
          const dateStr = (attempt.submitted_at ?? attempt.started_at).slice(0, 10);
          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {quiz?.title ?? "未知測驗"}
                </Text>
                <Text style={styles.cardDate}>{dateStr}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {pct !== null && (
                  <Text style={styles.cardScore}>
                    {attempt.score}/{attempt.total} ({pct}%)
                  </Text>
                )}
                {pts > 0 ? (
                  <Text style={styles.cardPoints}>+{pts} 點</Text>
                ) : (
                  <Text style={styles.cardPointsMuted}>未達標</Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  title: { ...typography.heading, color: colors.ink },
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  summaryLabel: { ...typography.micro, color: colors.inkMuted },
  summaryValue: { ...typography.display, color: colors.primary, fontSize: 48, lineHeight: 58, marginVertical: 4 },
  summaryHint: { ...typography.caption, color: colors.inkSoft },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cardTitle: { ...typography.bodyEmphasis, color: colors.ink, fontSize: 14 },
  cardDate: { ...typography.micro, color: colors.inkMuted, marginTop: 2 },
  cardScore: { ...typography.caption, color: colors.inkSoft },
  cardPoints: { ...typography.bodyEmphasis, color: colors.primary, fontSize: 13, marginTop: 2 },
  cardPointsMuted: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyText: { ...typography.body, color: colors.inkMuted, textAlign: "center" },
});

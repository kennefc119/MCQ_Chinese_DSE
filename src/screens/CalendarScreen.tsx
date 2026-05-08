import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz, Attempt } from "../types/database";
import { listQuizzes, listUserAttempts } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";

export default function CalendarScreen() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [month, setMonth] = useState(new Date());

  const load = useCallback(async () => {
    if (!user) return;
    const [qs, as] = await Promise.all([listQuizzes(), listUserAttempts(user.id)]);
    setQuizzes(qs);
    setAttempts(as.filter((a) => a.status === "submitted"));
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const quizMap: Record<string, Quiz> = quizzes.reduce((m, q) => ({ ...m, [q.id]: q }), {});

  // Calendar grid
  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const startWeekday = new Date(year, m, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) =>
    `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Dates with completed attempts
  const completedDates = new Set<string>();
  attempts.forEach((a) => {
    completedDates.add((a.submitted_at ?? a.started_at).slice(0, 10));
  });

  // Sorted attempts (newest first)
  const sortedAttempts = [...attempts].sort((a, b) => {
    const da = a.submitted_at ?? a.started_at;
    const db = b.submitted_at ?? b.started_at;
    return db.localeCompare(da);
  });

  const getPointsEarned = (attempt: Attempt): number => {
    const quiz = quizMap[attempt.quiz_id];
    if (!quiz || attempt.score == null || attempt.total == null || attempt.total === 0) return 0;
    return attempt.score / attempt.total >= (quiz.pass_score ?? 60) / 100
      ? (quiz.points_reward ?? 0)
      : 0;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>學習日曆</Text>
        <Text style={styles.subtitle}>已完成 {attempts.length} 次練習</Text>

        {/* Month nav */}
        <View style={styles.monthBar}>
          <TouchableOpacity onPress={() => setMonth(new Date(year, m - 1, 1))} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthText}>{year} 年 {m + 1} 月</Text>
          <TouchableOpacity onPress={() => setMonth(new Date(year, m + 1, 1))} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Weekdays */}
        <View style={styles.row}>
          {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
            <Text key={w} style={styles.weekday}>{w}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.gridWrap}>
          {cells.map((d, i) => {
            const key = d ? fmt(d) : "";
            const hasCompleted = key ? completedDates.has(key) : false;
            const isToday = key === todayStr;
            return (
              <View key={i} style={styles.cellWrap}>
                {d ? (
                  <View style={[styles.cell, isToday && styles.cellToday, hasCompleted && !isToday && styles.cellHighlight]}>
                    <Text style={[styles.cellDay, isToday && { color: "#1A1208", fontWeight: "800" }]}>{d}</Text>
                    {hasCompleted && (
                      <View style={styles.dotsRow}>
                        <View style={[styles.eventDot, { backgroundColor: colors.success }]} />
                      </View>
                    )}
                  </View>
                ) : <View style={styles.cell} />}
              </View>
            );
          })}
        </View>

        {/* Learning records */}
        <Text style={styles.sectionTitle}>學習記錄</Text>
        {sortedAttempts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>暫無完成記錄</Text>
            <Text style={styles.emptySubtitle}>
              開始探索，完成測驗即可在此查看學習記錄！
            </Text>
          </View>
        ) : (
          sortedAttempts.map((attempt) => {
            const quiz = quizMap[attempt.quiz_id];
            const pts = getPointsEarned(attempt);
            const pct =
              attempt.score != null && attempt.total > 0
                ? Math.round((attempt.score / attempt.total) * 100)
                : null;
            return (
              <View key={attempt.id} style={styles.recordCard}>
                <Text style={styles.recordDate}>
                  {formatDate(attempt.submitted_at ?? attempt.started_at)}
                </Text>
                <View style={styles.recordRow}>
                  {quiz && (
                    <View style={[styles.typeBadge, { backgroundColor: QUIZ_TYPE_COLORS[quiz.type] ?? colors.primary }]}>
                      <Text style={styles.typeBadgeText}>{QUIZ_TYPE_LABEL[quiz.type] ?? quiz.type}</Text>
                    </View>
                  )}
                  <Text style={styles.recordTitle} numberOfLines={1}>
                    {quiz?.title ?? "未知測驗"}
                  </Text>
                  <View style={styles.recordRight}>
                    {pct !== null && (
                      <Text style={styles.recordScore}>
                        {attempt.score}/{attempt.total} ({pct}%)
                      </Text>
                    )}
                    {pts > 0 && <Text style={styles.recordPoints}>+{pts} 分</Text>}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.md },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  monthBtn: { padding: spacing.sm },
  monthBtnText: { color: colors.primary, fontSize: 24 },
  monthText: { ...typography.heading, color: colors.textPrimary },
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", color: colors.textMuted, paddingVertical: spacing.xs },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  cellWrap: { width: "14.28%", aspectRatio: 1, padding: 2 },
  cell: { flex: 1, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  cellToday: { backgroundColor: colors.primary },
  cellHighlight: { borderWidth: 1, borderColor: colors.success },
  cellDay: { color: colors.textPrimary },
  dotsRow: { flexDirection: "row", marginTop: 2 },
  eventDot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1 },
  sectionTitle: { ...typography.heading, color: colors.primary, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyContainer: { alignItems: "center", paddingVertical: 32, paddingHorizontal: spacing.md },
  emptyTitle: { color: colors.textSecondary, fontSize: 16, fontWeight: "600", marginBottom: spacing.sm },
  emptySubtitle: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  recordCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordDate: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  recordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { color: "#1A1208", fontWeight: "700", fontSize: 10 },
  recordTitle: { flex: 1, color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  recordRight: { alignItems: "flex-end" },
  recordScore: { color: colors.textSecondary, fontSize: 12 },
  recordPoints: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 2 },
});

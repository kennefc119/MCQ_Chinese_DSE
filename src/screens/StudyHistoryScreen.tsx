import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz, Attempt, Passage } from "../types/database";
import { listQuizzes, listQuizzesByIds, listUserAttempts, listPassages } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import { cleanPassageName, extractSkillFromTitle } from "../lib/quizDisplayUtils";
import { useAppResume } from "../hooks/useAppResume";

type Nav = NativeStackNavigationProp<AppStackParamList>;

type GroupedAttempt = {
  quiz_id: string;
  count: number;
  highestScore: number;
  highestTotal: number;
  highestAttemptId: string;
  mostRecentDate: string;
};

export default function StudyHistoryScreen() {
  const nav = useNavigation<Nav>();
  const { loading: authLoading, isSupabaseReady, user } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);

  const load = useCallback(async () => {
    if (!user || !isSupabaseReady) return;
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("load_timeout")), 8000)
    );
    try {
      const [as, ps] = await Promise.race([
        Promise.all([listUserAttempts(user.id), listPassages()]),
        deadline,
      ]);
      const submittedAttempts = as.filter((a) => a.status === "submitted");
      const attemptedQuizIds = [...new Set(submittedAttempts.map((a) => a.quiz_id))];

      const [visibleQuizzes, historicalQuizzes] = await Promise.race([
        Promise.all([
          listQuizzes(),
          attemptedQuizIds.length > 0 ? listQuizzesByIds(attemptedQuizIds) : Promise.resolve([]),
        ]),
        deadline,
      ]);

      const mergedQuizMap = new Map<string, Quiz>();
      historicalQuizzes.forEach((q) => mergedQuizMap.set(q.id, q));
      visibleQuizzes.forEach((q) => mergedQuizMap.set(q.id, q));

      setQuizzes(Array.from(mergedQuizMap.values()));
      setAttempts(submittedAttempts);
      setPassages(ps);
    } catch {
      // Timed out or network error — keep the existing screen state.
    }
  }, [isSupabaseReady, user]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading || !isSupabaseReady) return;
      void load();
    }, [authLoading, isSupabaseReady, load]),
  );

  useAppResume(() => {
    void load();
  }, isSupabaseReady);

  const quizMap = useMemo<Record<string, Quiz>>(
    () => quizzes.reduce((m, q) => ({ ...m, [q.id]: q }), {}),
    [quizzes],
  );
  const passageMap = useMemo<Record<string, Passage>>(
    () => passages.reduce((m, p) => ({ ...m, [p.id]: p }), {}),
    [passages],
  );

  const sortedAttempts = useMemo(
    () =>
      [...attempts].sort((a, b) => {
        const da = a.submitted_at ?? a.started_at;
        const db = b.submitted_at ?? b.started_at;
        return db.localeCompare(da);
      }),
    [attempts],
  );

  const groupedAttempts = useMemo<GroupedAttempt[]>(() => {
    const groups: Record<string, GroupedAttempt> = {};
    for (const attempt of sortedAttempts) {
      const quizId = attempt.quiz_id;
      const date = attempt.submitted_at ?? attempt.started_at;
      const score = attempt.score ?? 0;
      const total = attempt.total ?? 0;
      if (!groups[quizId]) {
        groups[quizId] = {
          quiz_id: quizId,
          count: 1,
          highestScore: score,
          highestTotal: total,
          highestAttemptId: attempt.id,
          mostRecentDate: date,
        };
      } else {
        groups[quizId].count++;
        const prevPct =
          groups[quizId].highestTotal > 0
            ? groups[quizId].highestScore / groups[quizId].highestTotal
            : 0;
        const newPct = total > 0 ? score / total : 0;
        if (newPct > prevPct) {
          groups[quizId].highestScore = score;
          groups[quizId].highestTotal = total;
          groups[quizId].highestAttemptId = attempt.id;
        }
        if (date > groups[quizId].mostRecentDate) groups[quizId].mostRecentDate = date;
      }
    }
    return Object.values(groups).sort((a, b) =>
      b.mostRecentDate.localeCompare(a.mostRecentDate),
    );
  }, [sortedAttempts]);

  const getPointsEarned = (quiz: Quiz | undefined, score: number, total: number): number => {
    if (!quiz || total === 0) return 0;
    return score / total >= (quiz.pass_score ?? 60) / 100 ? (quiz.points_reward ?? 0) : 0;
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>所有學習記錄</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={groupedAttempts}
        keyExtractor={(g) => g.quiz_id}
        contentContainerStyle={{ padding: spacing.md }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>暫無完成記錄</Text>
            <Text style={styles.emptySubtitle}>開始探索，完成測驗即可在此查看學習記錄！</Text>
          </View>
        }
        renderItem={({ item: group }) => {
          const quiz = quizMap[group.quiz_id];
          const pts = getPointsEarned(quiz, group.highestScore, group.highestTotal);
          const pct =
            group.highestTotal > 0
              ? Math.round((group.highestScore / group.highestTotal) * 100)
              : null;
          const passageName = quiz?.passage_id
            ? cleanPassageName(passageMap[quiz.passage_id]?.title)
            : null;
          const skillName = quiz?.title ? extractSkillFromTitle(quiz.title) : undefined;
          const heroTitle =
            passageName ??
            skillName ??
            quiz?.title
              ?.replace(
                /^(p\d+|篇章[一二三四五六七八九十\d]+|第[一二三四五六七八九十\d]+篇)\s*[-—–：:·（(）)\s]*/i,
                "",
              )
              .trim() ??
            "未知測驗";
          const skillDetail = passageName && skillName ? skillName : null;
          return (
            <TouchableOpacity
              style={styles.recordCard}
              activeOpacity={0.75}
              onPress={() =>
                nav.navigate("QuizResult", {
                  attemptId: group.highestAttemptId,
                  quizId: group.quiz_id,
                })
              }
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={styles.recordDate}>{formatDate(group.mostRecentDate)}</Text>
                <Text style={styles.recordDate}>已練習 {group.count} 次</Text>
              </View>
              <View style={styles.recordRow}>
                {quiz && (
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: QUIZ_TYPE_COLORS[quiz.type] ?? colors.primary },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {QUIZ_TYPE_LABEL[quiz.type] ?? quiz.type}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordTitle} numberOfLines={1}>
                    {heroTitle}
                  </Text>
                  {skillDetail ? (
                    <Text style={styles.recordPassage} numberOfLines={1}>
                      {skillDetail}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.recordRight}>
                  {pct !== null && (
                    <Text style={styles.recordScore}>
                      最高 {group.highestScore}/{group.highestTotal} ({pct}%)
                    </Text>
                  )}
                  {pts > 0 && <Text style={styles.recordPoints}>+{pts} 分</Text>}
                </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  title: { ...typography.heading, color: colors.primary, fontSize: 18 },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: spacing.md },
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
  recordTitle: { color: colors.textPrimary, fontWeight: "600", fontSize: 13, marginBottom: 2 },
  recordPassage: { color: colors.textMuted, fontSize: 11 },
  recordRight: { alignItems: "flex-end" },
  recordScore: { color: colors.textSecondary, fontSize: 12 },
  recordPoints: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 2 },
});

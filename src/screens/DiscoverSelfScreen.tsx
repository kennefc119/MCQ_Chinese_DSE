import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, QUIZ_TYPE_LABEL } from "../theme";
import { PsychTest, Attempt, Quiz } from "../types/database";
import { listPsychTests, listUserAttempts, listQuizzes } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import RadarChart from "../components/RadarChart";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const PSYCH_ICON_MAP: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  "person.fill.questionmark": "help-circle",
  "books.vertical.fill": "library",
  "graduationcap.fill": "school",
};

export default function DiscoverSelfScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const [tests, setTests] = useState<PsychTest[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  useEffect(() => { listPsychTests().then(setTests); }, []);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    Promise.all([listUserAttempts(user.id), listQuizzes()]).then(([as, qs]) => {
      setAttempts(as.filter((a) => a.status === "submitted"));
      setQuizzes(qs);
    });
  }, [user]));

  const quizMap = useMemo(
    () => quizzes.reduce<Record<string, Quiz>>((m, q) => ({ ...m, [q.id]: q }), {}),
    [quizzes],
  );

  const typeKeys = useMemo(() => Object.keys(QUIZ_TYPE_LABEL), []);
  const typeAxes = useMemo(() => typeKeys.map((k) => QUIZ_TYPE_LABEL[k]), [typeKeys]);
  const typeValues = useMemo(
    () =>
      typeKeys.map((t) => {
        const ta = attempts.filter((a) => quizMap[a.quiz_id]?.type === t);
        if (ta.length === 0) return 0;
        const avg = ta.reduce((s, a) => s + (a.score ?? 0) / Math.max(1, a.total), 0) / ta.length;
        return Math.round(avg * 100);
      }),
    [attempts, quizMap, typeKeys],
  );

  const diffAxes = ["★", "★★", "★★★", "★★★★", "★★★★★"];
  const diffValues = useMemo(
    () =>
      [1, 2, 3, 4, 5].map((d) => {
        const da = attempts.filter((a) => quizMap[a.quiz_id]?.difficulty === d);
        if (da.length === 0) return 0;
        const avg = da.reduce((s, a) => s + (a.score ?? 0) / Math.max(1, a.total), 0) / da.length;
        return Math.round(avg * 100);
      }),
    [attempts, quizMap],
  );

  const hasData = attempts.length >= 3;

  const ListHeader = (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>認識自己</Text>
        <Text style={styles.subtitle}>輕鬆小測驗　・　了解學習風格與職涯傾向</Text>
      </View>

      {/* Radar charts — only shown once student has ≥3 completed attempts */}
      {hasData && (
        <View style={styles.analyticsCard}>
          <Text style={styles.analyticsTitle}>📊 學習表現分析</Text>
          <Text style={styles.analyticsHint}>根據你已完成的練習自動計算</Text>
          <View style={styles.chartsRow}>
            <View style={styles.chartBlock}>
              <Text style={styles.chartLabel}>各題型得分率</Text>
              <RadarChart axes={typeAxes} values={typeValues} color={colors.primary} size={150} />
            </View>
            <View style={styles.chartBlock}>
              <Text style={styles.chartLabel}>各難度得分率</Text>
              <RadarChart axes={diffAxes} values={diffValues} color={colors.accent} size={150} />
            </View>
          </View>
        </View>
      )}
      {!hasData && (
        <View style={styles.analyticsPlaceholder}>
          <Text style={styles.analyticsPlaceholderText}>📈 完成 3 次以上練習後，這裡將顯示你的學習表現雷達圖</Text>
        </View>
      )}

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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => nav.navigate("PsychTest", { testId: item.id })}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={PSYCH_ICON_MAP[item.icon_name] ?? "sparkles"}
                size={24}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <Text style={styles.cardMeta}>📝 {item.question_count} 題　・　⏱ 約 {item.estimated_minutes} 分鐘</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { marginBottom: spacing.md },
  title: { ...typography.title, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  analyticsCard: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  analyticsTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 15, marginBottom: 2 },
  analyticsHint: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm },
  chartsRow: { flexDirection: "row", justifyContent: "space-around" },
  chartBlock: { alignItems: "center" },
  chartLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  analyticsPlaceholder: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  analyticsPlaceholderText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.sm },
  card: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
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
});

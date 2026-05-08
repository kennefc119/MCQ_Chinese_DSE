import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_LABEL } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { AppStackParamList } from "../navigation/types";
import { useFocusEffect } from "@react-navigation/native";
import { Attempt, Quiz } from "../types/database";
import { listUserAttempts, listQuizzes } from "../lib/dataService";
import RadarChart from "../components/RadarChart";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const ROW = (label: string, value: string) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const { user, signOut, demoMode } = useAuth();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

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

  if (!user) return null;

  const onSignOut = () => {
    Alert.alert("登出", "確定登出？", [
      { text: "取消", style: "cancel" },
      { text: "登出", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.username.slice(0, 1)}</Text>
          </View>
          <Text style={styles.name}>{user.username}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {demoMode && <Text style={styles.demoTag}>示範模式</Text>}
        </View>

        <View style={styles.pointsBox}>
          <Text style={styles.pointsLabel}>文淵點</Text>
          <Text style={styles.pointsValue}>{user.wenyuan_points}</Text>
          <Text style={styles.pointsHint}>通過練習與測驗即可累積，解鎖更高難度挑戰</Text>
        </View>

        <View style={styles.card}>
          {ROW("性別", user.gender === "male" ? "男" : user.gender === "female" ? "女" : "其他")}
          {ROW("應考 DSE 年份", `${user.dse_year}`)}
          {ROW("會員等級", user.subscription_tier === "premium" ? "高級" : "免費")}
          {user.role === "admin" && ROW("身份", "管理員")}
        </View>

        <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("Inbox")}>
          <Text style={styles.menuLabel}>📨 收件箱</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("Subscription")}>
          <Text style={styles.menuLabel}>💎 訂閱方案</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        {user.role === "admin" && (
          <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("Admin")}>
            <Text style={styles.menuLabel}>🛠 管理後台</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.lg }} />
        <Button title="登出" variant="ghost" onPress={onSignOut} />

        {/* Analytics */}
        {attempts.length >= 3 && (
          <>
            <View style={{ height: spacing.lg }} />
            <Text style={styles.sectionTitle}>學習能力分析</Text>
            <View style={styles.chartsRow}>
              <View style={styles.chartBlock}>
                <Text style={styles.chartLabel}>各題型得分率</Text>
                <RadarChart axes={typeAxes} values={typeValues} color={colors.primary} size={160} />
              </View>
              <View style={styles.chartBlock}>
                <Text style={styles.chartLabel}>各難度得分率</Text>
                <RadarChart axes={diffAxes} values={diffValues} color={colors.accent} size={160} />
              </View>
            </View>
          </>
        )}

        {/* Attempt history */}
        {attempts.length > 0 && (
          <>
            <View style={{ height: spacing.md }} />
            <Text style={styles.sectionTitle}>積分記錄</Text>
            {[...attempts]
              .sort((a, b) => (b.submitted_at ?? b.started_at).localeCompare(a.submitted_at ?? a.started_at))
              .slice(0, 10)
              .map((attempt) => {
                const quiz = quizMap[attempt.quiz_id];
                const pts = getPointsEarned(attempt);
                const pct =
                  attempt.score != null && attempt.total > 0
                    ? Math.round((attempt.score / attempt.total) * 100)
                    : null;
                return (
                  <View key={attempt.id} style={styles.historyCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle} numberOfLines={1}>
                        {quiz?.title ?? "未知測驗"}
                      </Text>
                      <Text style={styles.historyDate}>
                        {(attempt.submitted_at ?? attempt.started_at).slice(0, 10)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {pct !== null && (
                        <Text style={styles.historyScore}>{attempt.score}/{attempt.total} ({pct}%)</Text>
                      )}
                      {pts > 0 && <Text style={styles.historyPoints}>+{pts} 點</Text>}
                    </View>
                  </View>
                );
              })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  avatarText: { fontSize: 36, fontWeight: "800", color: "#1A1208" },
  name: { ...typography.title, color: colors.textPrimary },
  email: { color: colors.textSecondary, marginTop: 4 },
  demoTag: { marginTop: 8, color: colors.warning, fontSize: 12, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pointsBox: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 16, alignItems: "center", marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  pointsLabel: { color: colors.textMuted, fontSize: 13 },
  pointsValue: { color: colors.primary, fontSize: 48, fontWeight: "800", marginVertical: 4 },
  pointsHint: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", padding: spacing.sm },
  rowLabel: { color: colors.textSecondary },
  rowValue: { color: colors.textPrimary, fontWeight: "600" },
  menuItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface, borderRadius: 10, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border },
  menuLabel: { color: colors.textPrimary, fontSize: 16 },
  menuArrow: { color: colors.textMuted, fontSize: 22 },
  sectionTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.sm },
  chartsRow: { flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  chartBlock: { alignItems: "center" },
  chartLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  historyCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border },
  historyTitle: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  historyDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  historyScore: { color: colors.textSecondary, fontSize: 12 },
  historyPoints: { color: colors.primary, fontWeight: "700", fontSize: 12, marginTop: 2 },
});

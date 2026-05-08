import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz, Attempt, QuizSignup } from "../types/database";
import { listQuizzes, listSignups, listUserAttempts } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import EmptyState from "../components/EmptyState";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function CalendarScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [signups, setSignups] = useState<QuizSignup[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [month, setMonth] = useState(new Date());

  const load = useCallback(async () => {
    if (!user) return;
    const [qs, ss, as] = await Promise.all([listQuizzes(), listSignups(user.id), listUserAttempts(user.id)]);
    setQuizzes(qs);
    setSignups(ss);
    setAttempts(as);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Build a date → events map
  const events = new Map<string, { quiz: Quiz; type: "scheduled" | "completed" }[]>();
  signups.forEach((s) => {
    const q = quizzes.find((x) => x.id === s.quiz_id);
    if (!q) return;
    const dateKey = (q.scheduled_start ?? s.signed_up_at).slice(0, 10);
    if (!events.has(dateKey)) events.set(dateKey, []);
    events.get(dateKey)!.push({ quiz: q, type: "scheduled" });
  });
  attempts.filter((a) => a.status === "submitted").forEach((a) => {
    const q = quizzes.find((x) => x.id === a.quiz_id);
    if (!q) return;
    const dateKey = (a.submitted_at ?? a.started_at).slice(0, 10);
    if (!events.has(dateKey)) events.set(dateKey, []);
    events.get(dateKey)!.push({ quiz: q, type: "completed" });
  });

  // Calendar grid
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) => `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // upcoming events list
  const upcoming = [...events.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([k]) => k >= todayStr);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>學習日曆</Text>
        <Text style={styles.subtitle}>已參加考試 {signups.length} 場　・　已完成 {attempts.filter((a) => a.status === "submitted").length} 次</Text>

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
            const dayEvents = key ? events.get(key) : undefined;
            const isToday = key === todayStr;
            return (
              <View key={i} style={styles.cellWrap}>
                {d ? (
                  <View style={[styles.cell, isToday && styles.cellToday, dayEvents && styles.cellHighlight]}>
                    <Text style={[styles.cellDay, isToday && { color: "#1A1208", fontWeight: "800" }]}>{d}</Text>
                    {dayEvents && (
                      <View style={styles.dotsRow}>
                        {dayEvents.slice(0, 3).map((e, k) => (
                          <View
                            key={k}
                            style={[styles.eventDot, { backgroundColor: e.type === "completed" ? colors.success : colors.accent }]}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                ) : <View style={styles.cell} />}
              </View>
            );
          })}
        </View>

        {/* Upcoming list */}
        <Text style={styles.sectionTitle}>即將到來</Text>
        {upcoming.length === 0 ? (
          <EmptyState icon="📅" title="沒有預定考試" subtitle="到「探索」標籤加入測驗或模擬試" />
        ) : (
          upcoming.map(([date, evs]) => (
            <View key={date}>
              <Text style={styles.dateLabel}>{date}</Text>
              {evs.map(({ quiz, type }, k) => (
                <TouchableOpacity
                  key={`${quiz.id}-${k}`}
                  style={styles.eventCard}
                  onPress={() => nav.navigate("QuizDetail", { quizId: quiz.id })}
                >
                  <View style={[styles.eventBadge, { backgroundColor: QUIZ_TYPE_COLORS[quiz.type] }]}>
                    <Text style={styles.eventBadgeText}>{QUIZ_TYPE_LABEL[quiz.type]}</Text>
                  </View>
                  <Text style={styles.eventTitle}>{quiz.title}</Text>
                  <Text style={styles.eventStatus}>{type === "completed" ? "✅ 已完成" : "📝 已預約"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
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
  cellHighlight: { borderWidth: 1, borderColor: colors.accent },
  cellDay: { color: colors.textPrimary },
  dotsRow: { flexDirection: "row", marginTop: 2 },
  eventDot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1 },
  sectionTitle: { ...typography.heading, color: colors.primary, marginTop: spacing.md, marginBottom: spacing.sm },
  dateLabel: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  eventCard: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginTop: spacing.xs, borderWidth: 1, borderColor: colors.border },
  eventBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  eventBadgeText: { color: "#1A1208", fontWeight: "700", fontSize: 11 },
  eventTitle: { color: colors.textPrimary, fontWeight: "600", marginTop: 4 },
  eventStatus: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});

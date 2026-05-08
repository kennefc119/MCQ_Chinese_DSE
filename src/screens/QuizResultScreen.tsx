import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { Quiz, Question, Attempt } from "../types/database";
import { getQuiz, getQuestionsForQuiz, listUserAttempts } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import LoadingScreen from "../components/LoadingScreen";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList, "QuizResult">;
type Rt = RouteProp<AppStackParamList, "QuizResult">;

export default function QuizResultScreen() {
  const nav = useNavigation<Nav>();
  const { quizId, attemptId } = useRoute<Rt>().params;
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  useEffect(() => {
    (async () => {
      const q = await getQuiz(quizId);
      if (!q) return;
      setQuiz(q);
      setQuestions(await getQuestionsForQuiz(q));
      if (user) {
        const all = await listUserAttempts(user.id);
        setAttempt(all.find((a) => a.id === attemptId) || null);
      }
    })();
  }, [quizId, attemptId, user]);

  if (!quiz || !attempt) return <LoadingScreen />;
  const pct = Math.round((attempt.score! / attempt.total) * 100);
  const passed = pct >= quiz.pass_score;

  const goHome = () => {
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.emoji}>{passed ? "🎉" : "📚"}</Text>
        <Text style={[styles.title, { color: passed ? colors.success : colors.warning }]}>
          {passed ? "通過" : "再接再厲"}
        </Text>
        <Text style={styles.score}>{attempt.score} / {attempt.total}</Text>
        <Text style={styles.percent}>{pct}%</Text>
        {passed && <Text style={styles.reward}>+{quiz.points_reward} 文淵點</Text>}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>逐題解析</Text>

        {questions.map((q, i) => {
          const sel = attempt.answers[q.id];
          const correctOpt = q.options.find((o) => o.is_correct);
          const selOpt = q.options.find((o) => o.id === sel);
          const isCorrect = selOpt?.is_correct ?? false;
          return (
            <View key={q.id} style={styles.qBlock}>
              <Text style={styles.qHeader}>
                第 {i + 1} 題　{isCorrect ? "✅" : selOpt ? "❌" : "—"}
              </Text>
              <Text style={styles.qStem}>{q.stem}</Text>
              {q.options.map((o) => {
                const isSel = o.id === sel;
                const isAns = o.is_correct;
                return (
                  <View
                    key={o.id}
                    style={[
                      styles.optRow,
                      isAns && styles.optCorrect,
                      isSel && !isAns && styles.optWrong,
                    ]}
                  >
                    <Text style={styles.optLabel}>{o.label}.</Text>
                    <Text style={styles.optText}>{o.text}</Text>
                    {isAns && <Text style={styles.optTag}>正確</Text>}
                    {isSel && !isAns && <Text style={[styles.optTag, { color: colors.danger }]}>你選</Text>}
                  </View>
                );
              })}
              {q.explanation && (
                <View style={styles.explainBox}>
                  <Text style={styles.explainTitle}>解析</Text>
                  <Text style={styles.explainText}>{q.explanation}</Text>
                </View>
              )}
            </View>
          );
        })}

        <Button title="返回主頁" onPress={goHome} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, alignItems: "stretch" },
  emoji: { fontSize: 64, textAlign: "center", marginTop: spacing.md },
  title: { ...typography.title, textAlign: "center", marginTop: spacing.sm },
  score: { fontSize: 36, color: colors.primary, textAlign: "center", fontWeight: "800", marginTop: spacing.sm },
  percent: { fontSize: 18, color: colors.textSecondary, textAlign: "center", marginTop: 4 },
  reward: { color: colors.accent, fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  sectionTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.md },
  qBlock: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  qHeader: { color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: "600" },
  qStem: { color: colors.textPrimary, fontSize: 15, marginBottom: spacing.sm, lineHeight: 22 },
  optRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  optCorrect: { backgroundColor: "rgba(91,191,116,0.15)", paddingHorizontal: 8, borderRadius: 6 },
  optWrong: { backgroundColor: "rgba(199,93,78,0.15)", paddingHorizontal: 8, borderRadius: 6 },
  optLabel: { color: colors.textSecondary, fontWeight: "700", marginRight: spacing.sm, width: 20 },
  optText: { flex: 1, color: colors.textPrimary },
  optTag: { color: colors.success, fontSize: 12, fontWeight: "700", marginLeft: spacing.sm },
  explainBox: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: 8 },
  explainTitle: { color: colors.accent, fontWeight: "700", marginBottom: 4 },
  explainText: { color: colors.textSecondary, lineHeight: 20 },
});

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { Quiz, Question, QuestionOption, Attempt } from "../types/database";
import { getQuiz, getQuestionsForResult, listUserAttempts } from "../lib/dataService";
import { shuffleOptionsForAttempt } from "../lib/shuffleUtils";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import LoadingScreen from "../components/LoadingScreen";
import FloatingBalloons from "../components/FloatingBalloons";
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
      setQuestions(await getQuestionsForResult(q));
      if (user) {
        const all = await listUserAttempts(user.id);
        setAttempt(all.find((a) => a.id === attemptId) || null);
      }
    })();
  }, [quizId, attemptId, user]);

  if (!quiz || !attempt) return <LoadingScreen />;
  const pct = Math.round((attempt.score! / attempt.total) * 100);
  const passed = pct >= quiz.pass_score;

  // Apply the same deterministic shuffle as QuizRunnerScreen so A/B/C/D labels match.
  const displayQuestions = shuffleOptionsForAttempt(questions, attemptId);

  const goHome = () => {
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));
  };

  const askAI = (q: Question, o: QuestionOption, displayLabel: string, correctOpt: QuestionOption | undefined) => {
    const isAns = o.id === correctOpt?.id;
    const optStatus = isAns ? "正確答案" : `干擾項`;
    const lines: string[] = [
      `【題目】${q.stem}`,
      ``,
      `【選項 ${displayLabel}】${o.text}（${optStatus}）`,
    ];
    if (o.explanation) lines.push(`【此選項解析】${o.explanation}`);
    if (correctOpt && correctOpt.id !== o.id) {
      lines.push(``, `【正確答案】${correctOpt.text}`);
      if (correctOpt.explanation) lines.push(`【正確答案解析】${correctOpt.explanation}`);
    }
    lines.push(``, `請以中學生能理解的方式，逐步詳細解釋為何如此，並說明各選項正確或錯誤的原因。`);
    const message = lines.join("\n");
    nav.navigate("Tabs", { screen: "Advisor", params: { initialMessage: message } } as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <FloatingBalloons shown />
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

        {displayQuestions.map((q, i) => {
          const sel = attempt.answers[q.id];
          const correctOpt = q.options.find((o) => o.is_correct);
          const skipped = sel == null;
          const isCorrect = !skipped && sel === correctOpt?.id;
          const isWrong = !skipped && sel !== correctOpt?.id;
          return (
            <View key={q.id} style={styles.qBlock}>
              <Text style={styles.qHeader}>
                第 {i + 1} 題　{isCorrect ? "✅" : "❌"}
                {skipped ? "　未作答" : ""}
              </Text>
              <Text style={styles.qStem}>{q.stem}</Text>
              {skipped && (
                <View style={styles.skippedBanner}>
                  <Text style={styles.skippedText}>⚠️ 此題未作答，視為錯誤</Text>
                </View>
              )}
              {q.options.map((o, optIdx) => {
                const displayLabel = ["A", "B", "C", "D"][optIdx] ?? String(optIdx + 1);
                const isSel = o.id === sel;
                const isAns = o.id === correctOpt?.id;
                return (
                  <View key={o.id}>
                    <View
                      style={[
                        styles.optRow,
                        isAns && styles.optCorrect,
                        isSel && !isAns && styles.optWrong,
                      ]}
                    >
                      <Text style={styles.optLabel}>{displayLabel}.</Text>
                      <Text style={styles.optText}>{o.text}</Text>
                      {isAns && <Text style={styles.optTag}>正確</Text>}
                      {isSel && !isAns && <Text style={[styles.optTag, { color: colors.danger }]}>你選</Text>}
                    </View>
                    {o.explanation ? (
                      <View style={[
                        styles.optExplainBox,
                        isAns && styles.optExplainCorrect,
                        isSel && !isAns && styles.optExplainWrong,
                      ]}>
                        <Text style={styles.optExplainText}>{o.explanation}</Text>
                        <TouchableOpacity style={styles.askAIBtn} onPress={() => askAI(q, o, displayLabel, correctOpt)}>
                          <Text style={styles.askAIText}>🤖 問AI</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.askAIBtnInline} onPress={() => askAI(q, o, displayLabel, correctOpt)}>
                        <Text style={styles.askAIText}>🤖 問AI</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {/* Legacy question-level explanation fallback (for older questions without per-option explanations) */}
              {q.explanation && q.options.every((o) => !o.explanation) && (
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
  optExplainBox: { marginLeft: 28, marginBottom: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  optExplainCorrect: { borderLeftWidth: 2, borderLeftColor: colors.success },
  optExplainWrong: { borderLeftWidth: 2, borderLeftColor: colors.danger },
  optExplainText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  explainBox: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: 8 },
  explainTitle: { color: colors.accent, fontWeight: "700", marginBottom: 4 },
  explainText: { color: colors.textSecondary, lineHeight: 20 },
  skippedBanner: { backgroundColor: "rgba(199,93,78,0.12)", borderLeftWidth: 3, borderLeftColor: colors.danger, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginBottom: spacing.sm },
  skippedText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  askAIBtn: { alignSelf: "flex-end", marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  askAIBtnInline: { alignSelf: "flex-start", marginLeft: 28, marginTop: 2, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  askAIText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
});

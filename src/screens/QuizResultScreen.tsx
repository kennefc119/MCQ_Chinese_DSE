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
import SealStamp from "../components/SealStamp";
import Icon from "../components/Icon";
import SealMark from "../components/SealMark";
import InkDivider from "../components/InkDivider";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList, "QuizResult">;
type Rt = RouteProp<AppStackParamList, "QuizResult">;

export default function QuizResultScreen() {
  const nav = useNavigation<Nav>();
  const { quizId, attemptId, attemptSnapshot } = useRoute<Rt>().params;
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(
    attemptSnapshot ? (JSON.parse(attemptSnapshot) as Attempt) : null,
  );

  useEffect(() => {
    (async () => {
      const q = await getQuiz(quizId);
      if (!q) return;
      setQuiz(q);
      setQuestions(await getQuestionsForResult(q, attemptId));
      // Only fetch attempt from DB if we don't already have a snapshot
      if (!attemptSnapshot && user) {
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
      <SealStamp shown={passed} char="優" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: passed ? colors.success : colors.warning }]}>
          {passed ? "已過此關" : "再來一次"}
        </Text>
        <Text style={styles.score}>{attempt.score} / {attempt.total}</Text>
        <Text style={styles.percent}>{pct}%</Text>
        {passed && (
          <View style={styles.rewardRow}>
            <SealMark char="淵" size={22} />
            <Text style={styles.reward}>+{quiz.points_reward} 文淵點</Text>
          </View>
        )}

        <InkDivider />
        <Text style={styles.sectionTitle}>逐題回顧</Text>

        {displayQuestions.map((q, i) => {
          const sel = attempt.answers[q.id];
          const correctOpt = q.options.find((o) => o.is_correct);
          const skipped = sel == null;
          const isCorrect = !skipped && sel === correctOpt?.id;
          return (
            <View key={q.id} style={styles.qBlock}>
              <View style={styles.qHeaderRow}>
                <Text style={styles.qHeader}>第 {i + 1} 題</Text>
                {isCorrect ? (
                  <View style={[styles.qBadge, styles.qBadgeOk]}>
                    <Icon name="checkmark" size="xs" color={colors.success} />
                    <Text style={[styles.qBadgeText, { color: colors.success }]}>正確</Text>
                  </View>
                ) : (
                  <View style={[styles.qBadge, styles.qBadgeBad]}>
                    <Icon name="close" size="xs" color={colors.danger} />
                    <Text style={[styles.qBadgeText, { color: colors.danger }]}>{skipped ? "未答" : "錯誤"}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.qStem}>{q.stem}</Text>
              {skipped && (
                <View style={styles.skippedBanner}>
                  <Icon name="alert-circle-outline" size="xs" color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={styles.skippedText}>未作答，計為錯誤。</Text>
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
                          <Icon name="sparkles-outline" size="xs" color={colors.primary} style={{ marginRight: 4 }} />
                          <Text style={styles.askAIText}>請教 AI</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.askAIBtnInline} onPress={() => askAI(q, o, displayLabel, correctOpt)}>
                        <Icon name="sparkles-outline" size="xs" color={colors.primary} style={{ marginRight: 4 }} />
                        <Text style={styles.askAIText}>請教 AI</Text>
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
  title: { ...typography.heading, textAlign: "center", marginTop: spacing.xl },
  score: { ...typography.display, color: colors.ink, textAlign: "center", marginTop: spacing.sm },
  percent: { ...typography.body, color: colors.inkSoft, textAlign: "center", marginTop: 4 },
  rewardRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.sm },
  reward: { ...typography.bodyEmphasis, color: colors.primary },
  sectionTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.md },
  qBlock: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.hairline },
  qHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  qHeader: { ...typography.bodyEmphasis, color: colors.inkSoft },
  qBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  qBadgeOk: { backgroundColor: colors.successSoft },
  qBadgeBad: { backgroundColor: colors.errorSoft },
  qBadgeText: { ...typography.micro, fontWeight: "700" },
  qStem: { ...typography.body, color: colors.ink, marginBottom: spacing.sm, lineHeight: 22 },
  optRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  optCorrect: { backgroundColor: colors.successSoft, paddingHorizontal: 8, borderRadius: 6 },
  optWrong: { backgroundColor: colors.errorSoft, paddingHorizontal: 8, borderRadius: 6 },
  optLabel: { ...typography.bodyEmphasis, color: colors.inkSoft, marginRight: spacing.sm, width: 20 },
  optText: { flex: 1, ...typography.body, color: colors.ink },
  optTag: { ...typography.micro, color: colors.success, fontWeight: "700", marginLeft: spacing.sm },
  optExplainBox: { marginLeft: 28, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  optExplainCorrect: { borderLeftWidth: 2, borderLeftColor: colors.success },
  optExplainWrong: { borderLeftWidth: 2, borderLeftColor: colors.danger },
  optExplainText: { ...typography.caption, color: colors.inkSoft, lineHeight: 18 },
  explainBox: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: 8 },
  explainTitle: { ...typography.bodyEmphasis, color: colors.primary, marginBottom: 4 },
  explainText: { ...typography.body, color: colors.inkSoft, lineHeight: 20 },
  skippedBanner: { flexDirection: "row", alignItems: "center", backgroundColor: colors.errorSoft, borderLeftWidth: 3, borderLeftColor: colors.danger, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginBottom: spacing.sm },
  skippedText: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  askAIBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  askAIBtnInline: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginLeft: 28, marginTop: 2, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  askAIText: { ...typography.micro, color: colors.primary, fontWeight: "700" },
});

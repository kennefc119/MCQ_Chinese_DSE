import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList, Modal, BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { Passage, Question, Quiz } from "../types/database";
import { getPassagesByIds, getQuestionsForQuiz, getQuiz, saveAnswer, submitAttempt } from "../lib/dataService";
import { shuffleOptionsForAttempt } from "../lib/shuffleUtils";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import LoadingScreen from "../components/LoadingScreen";
import Icon from "../components/Icon";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList, "QuizRunner">;
type Rt = RouteProp<AppStackParamList, "QuizRunner">;


export default function QuizRunnerScreen() {
  const nav = useNavigation<Nav>();
  const { quizId, attemptId } = useRoute<Rt>().params;
  const { user, updateProfile } = useAuth();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const startedAt = useRef(Date.now());

  const [loading, setLoading] = useState(true);

  // Passage reference (exercises only)
  const [passageMap, setPassageMap] = useState<Record<string, Passage>>({});
  const [passageModal, setPassageModal] = useState<{ visible: boolean; passage: Passage | null }>({
    visible: false,
    passage: null,
  });

  // Shuffled display order: deterministic per attempt (seed = attemptId + questionId).
  // Using the same seed in QuizResultScreen guarantees A/B/C/D labels are identical.
  // Answers are stored by option.id (not label), so scoring is unaffected by shuffling.
  const displayQuestions = useMemo(
    () => (questions.length === 0 ? [] : shuffleOptionsForAttempt(questions, attemptId)),
    [questions, attemptId],
  );

  const safeGoBack = () => {
    if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const q = await getQuiz(quizId);
        if (!q) {
          Alert.alert("錯誤", "無法讀取測驗內容，請稍後再試", [{ text: "返回", onPress: safeGoBack }]);
          return;
        }
        setQuiz(q);
        const qs = await getQuestionsForQuiz(q);
        if (!qs || qs.length === 0) {
          Alert.alert("錯誤", "沒有可用的題目，請聯絡管理員", [{ text: "返回", onPress: safeGoBack }]);
          return;
        }
        setQuestions(qs);
        if (q.duration_seconds) setSecondsLeft(q.duration_seconds);

        // Preload passages for exercises only
        if (q.type === "exercise") {
          const ids = new Set<string>();
          if (q.passage_id) ids.add(q.passage_id);
          for (const qst of qs) {
            if (qst.passage_id) ids.add(qst.passage_id);
          }
          if (ids.size > 0) {
            const passages = await getPassagesByIds([...ids]);
            const map: Record<string, Passage> = {};
            for (const p of passages) map[p.id] = p;
            setPassageMap(map);
          }
        }
      } catch (err: any) {
        console.warn("[dsemcq] QuizRunner load error:", err?.message ?? err);
        Alert.alert("錯誤", err?.message ?? "無法載入題目", [{ text: "返回", onPress: safeGoBack }]);
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  // Timer
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      onSubmit(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // Block hardware back during quiz
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      confirmExit();
      return true;
    });
    return () => sub.remove();
  }, []);

  const confirmExit = () => {
    Alert.alert("離開作答？", "未提交的作答將會遺失。", [
      { text: "繼續作答", style: "cancel" },
      { text: "確定離開", style: "destructive", onPress: safeGoBack },
    ]);
  };

  // Passages relevant to the current question (exercise mode only).
  // Must be declared BEFORE any early returns to satisfy Rules of Hooks.
  const curPassages = useMemo<Passage[]>(() => {
    if (!quiz || quiz.type !== "exercise") return [];
    const cur = displayQuestions[idx];
    if (!cur) return [];
    const ids = new Set<string>();
    if (cur.passage_id) ids.add(cur.passage_id);
    if (quiz.passage_id) ids.add(quiz.passage_id);
    return [...ids].map((id) => passageMap[id]).filter(Boolean) as Passage[];
  }, [quiz, displayQuestions, idx, passageMap]);

  if (!quiz || displayQuestions.length === 0) return <LoadingScreen />;

  const cur = displayQuestions[idx];

  const onChoose = (optionId: string) => {
    setAnswers((p) => ({ ...p, [cur.id]: optionId }));
    saveAnswer(attemptId, cur.id, optionId).catch(() => {});
  };

  const onSubmit = async (auto = false) => {
    const unanswered = displayQuestions.filter((q) => !answers[q.id]).length;
    if (unanswered > 0 && !auto) {
      Alert.alert("尚有未作答題目", `仍有 ${unanswered} 題未作答，是否提交？`, [
        { text: "繼續作答", style: "cancel" },
        { text: "提交", style: "destructive", onPress: () => doSubmit() },
      ]);
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
    setSubmitting(true);
    const elapsed = Math.round((Date.now() - startedAt.current) / 1000);
    const result = await submitAttempt(attemptId, answers, questions, elapsed);
    // Award points if passed
    if (user && result.score !== null && quiz) {
      const pct = (result.score / result.total) * 100;
      if (pct >= quiz.pass_score) {
        await updateProfile({ wenyuan_points: (user.wenyuan_points ?? 0) + quiz.points_reward });
      }
    }
    setSubmitting(false);
    nav.replace("QuizResult", { attemptId, quizId });
  };

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={confirmExit} style={styles.headerBtn}>
          <Icon name="close" size="md" color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>{idx + 1} / {displayQuestions.length}</Text>
          <Text style={styles.answeredText}>已答 {Object.keys(answers).length}</Text>
        </View>
        {secondsLeft !== null ? (
          <View style={[styles.timer, secondsLeft < 60 && { backgroundColor: colors.danger }]}>
            <Text style={styles.timerText}>{fmtTime(secondsLeft)}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowGrid(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>⊞</Text>
          </TouchableOpacity>
        )}
      </View>

      {secondsLeft !== null && (
        <TouchableOpacity onPress={() => setShowGrid(true)} style={styles.gridLink}>
          <Text style={styles.gridLinkText}>顯示題目導覽 ⊞</Text>
        </TouchableOpacity>
      )}

      {/* Question */}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.qNumber}>第 {idx + 1} 題</Text>
        <Text style={styles.stem}>{cur.stem}</Text>
        {cur.options.map((opt) => {
          const sel = answers[cur.id] === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.85}
              onPress={() => onChoose(opt.id)}
              style={[styles.opt, sel && styles.optSelected]}
            >
              <View style={[styles.optBadge, sel && styles.optBadgeSel]}>
                <Text style={[styles.optBadgeText, sel && styles.optBadgeTextSel]}>{opt.label}</Text>
              </View>
              <Text style={styles.optText}>{opt.text}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Passage reference links — exercises only */}
        {curPassages.length > 0 && (
          <View style={styles.passageRefRow}>
            <Text style={styles.passageRefHint}>📖 參考文章：</Text>
            {curPassages.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPassageModal({ visible: true, passage: p })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.passageRefLink}>《{p.title}》</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom navigation */}
      <View style={styles.bottomBar}>
        <Button
          title="上一題"
          variant="ghost"
          onPress={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        />
        {idx < displayQuestions.length - 1 ? (
          <Button title="下一題" onPress={() => setIdx((i) => Math.min(displayQuestions.length - 1, i + 1))} />
        ) : (
          <Button title="檢查並提交" onPress={() => setShowReview(true)} />
        )}
      </View>

      {/* Question grid sheet */}
      <Modal visible={showGrid} transparent animationType="slide" onRequestClose={() => setShowGrid(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>題目導覽</Text>
            <FlatList
              data={displayQuestions}
              numColumns={5}
              keyExtractor={(q) => q.id}
              renderItem={({ item, index }) => {
                const answered = !!answers[item.id];
                const current = index === idx;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setIdx(index);
                      setShowGrid(false);
                    }}
                    style={[styles.dot, answered && styles.dotAnswered, current && styles.dotCurrent]}
                  >
                    <Text style={[styles.dotText, answered && { color: "#1A1208" }]}>{index + 1}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            <Button title="關閉" variant="ghost" onPress={() => setShowGrid(false)} />
          </View>
        </View>
      </Modal>

      {/* Review modal */}
      <Modal visible={showReview} animationType="slide" onRequestClose={() => setShowReview(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ padding: spacing.md, flex: 1 }}>
            <Text style={[typography.title, { color: colors.primary, marginBottom: spacing.md }]}>檢查答案</Text>
            <ScrollView>
              {displayQuestions.map((q, i) => {
                const sel = answers[q.id];
                const opt = q.options.find((o) => o.id === sel);
                return (
                  <TouchableOpacity
                    key={q.id}
                    style={styles.reviewRow}
                    onPress={() => {
                      setIdx(i);
                      setShowReview(false);
                    }}
                  >
                    <Text style={styles.reviewIdx}>{i + 1}.</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewStem} numberOfLines={2}>{q.stem}</Text>
                      <Text style={[styles.reviewAns, !opt && { color: colors.danger }]}>
                        {opt ? `${opt.label ?? "?"}. ${opt.text}` : "未作答"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Button title={submitting ? "提交中…" : "確認提交"} onPress={() => onSubmit()} loading={submitting} />
            <Button title="返回作答" variant="ghost" onPress={() => setShowReview(false)} />
          </View>
        </SafeAreaView>
      </Modal>
      {/* Passage reference modal */}
      <Modal
        visible={passageModal.visible}
        animationType="slide"
        onRequestClose={() => setPassageModal({ visible: false, passage: null })}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.passageModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.passageModalTitle}>
                {passageModal.passage ? `《${passageModal.passage.title}》` : ""}
              </Text>
              {passageModal.passage?.dynasty || passageModal.passage?.author ? (
                <Text style={styles.passageModalMeta}>
                  {[passageModal.passage.dynasty, passageModal.passage.author].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => setPassageModal({ visible: false, passage: null })}
              style={styles.passageModalClose}
            >
              <Icon name="close" size="md" color={colors.ink} />
            </TouchableOpacity>
          </View>
          <View style={styles.passageRefBanner}>
            <Text style={styles.passageRefBannerText}>以下為原文全文，供本題參考之用</Text>
          </View>
          <ScrollView contentContainerStyle={styles.passageModalBody}>
            <Text style={styles.passageBodyText}>
              {passageModal.passage?.body ?? ""}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.surface },
  headerBtnText: { color: colors.textPrimary, fontSize: 18 },
  progressWrap: { flex: 1, alignItems: "center" },
  progressText: { ...typography.heading, color: colors.primary },
  answeredText: { color: colors.textMuted, fontSize: 12 },
  timer: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surface },
  timerText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  gridLink: { padding: spacing.xs, alignItems: "center" },
  gridLinkText: { color: colors.textMuted, fontSize: 12 },
  body: { padding: spacing.md, paddingBottom: spacing.xl },
  qNumber: { color: colors.accent, fontWeight: "700", marginBottom: spacing.sm },
  stem: { ...typography.heading, color: colors.textPrimary, lineHeight: 28, marginBottom: spacing.lg },
  opt: {
    flexDirection: "row", alignItems: "flex-start", padding: spacing.md,
    borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  optSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  optBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  optBadgeSel: { backgroundColor: colors.primary },
  optBadgeText: { color: colors.textSecondary, fontWeight: "700" },
  optBadgeTextSel: { color: "#1A1208" },
  optText: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
  bottomBar: { flexDirection: "row", padding: spacing.md, borderTopWidth: 1, borderColor: colors.border, gap: spacing.sm as any },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.md, maxHeight: "70%" },
  sheetTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.md, textAlign: "center" },
  dot: { flex: 1 / 5, aspectRatio: 1, margin: 4, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  dotAnswered: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCurrent: { borderColor: colors.accent, borderWidth: 2 },
  dotText: { color: colors.textPrimary, fontWeight: "600" },
  reviewRow: { flexDirection: "row", padding: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  reviewIdx: { color: colors.primary, fontWeight: "700", marginRight: spacing.sm, width: 28 },
  reviewStem: { color: colors.textPrimary },
  reviewAns: { color: colors.accent, marginTop: 4, fontSize: 13 },
  // Passage reference
  passageRefRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: spacing.md, gap: 4 },
  passageRefHint: { fontSize: 11, color: colors.textMuted },
  passageRefLink: { fontSize: 11, color: colors.primary, textDecorationLine: "underline", marginRight: 6 },
  // Passage modal
  passageModalHeader: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  passageModalTitle: { ...typography.heading, color: colors.primary, fontSize: 16 },
  passageModalMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  passageModalClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.surface },
  passageRefBanner: { backgroundColor: colors.surfaceAlt, paddingVertical: 7, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  passageRefBannerText: { color: colors.textMuted, fontSize: 12, fontStyle: "italic" },
  passageModalBody: { padding: spacing.md, paddingBottom: 40 },
  passageBodyText: { color: colors.textPrimary, fontSize: 16, lineHeight: 30, letterSpacing: 0.5 },
});

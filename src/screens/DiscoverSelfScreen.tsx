import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { PsychTest, Attempt, Quiz, Passage, MetricBoxStats, PremiumUserComparison } from "../types/database";
import { listPsychTests, listUserAttempts, listQuizzesByIds, listPassages, listUserPsychResults, fetchQuestionAnalyticsData, QuestionAnalyticsMeta, fetchPremiumUserComparison } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import RadarChart from "../components/RadarChart";
import CollapsibleSection from "../components/CollapsibleSection";
import Treemap from "../components/Treemap";
import { TABLET_BREAKPOINT, CONTENT_MAX_WIDTH } from "../hooks/useDeviceType";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const PSYCH_ICON_MAP: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  "person.fill.questionmark": "help-circle",
  "books.vertical.fill": "library",
  "graduationcap.fill": "school",
};

const SKILL_TAGS = [
  { id: "t-meaning",      label: "字詞解釋" },
  { id: "t-comprehension",label: "內容理解" },
  { id: "t-theme",        label: "主旨歸納" },
  { id: "t-rhetoric",     label: "修辭手法" },
  { id: "t-character",    label: "人物分析" },
  { id: "t-grammar",      label: "句式語法" },
  { id: "t-context",      label: "背景知識" },
  { id: "t-comparison",   label: "跨篇章比較" },
] as const;

export default function DiscoverSelfScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= TABLET_BREAKPOINT;
  // On iPad, the sidebar takes 220px. Clamp chart container to CONTENT_MAX_WIDTH.
  const contentWidth = isTablet ? Math.min(screenWidth, CONTENT_MAX_WIDTH) : screenWidth;
  // Available width inside analyticsCard (FlatList padding + card padding = 4×spacing.md)
  const CHART_W = contentWidth - spacing.md * 4;
  const TREEMAP_W = Math.max(130, Math.min(200, CHART_W * 0.42));
  const TREEMAP_H = Math.max(120, Math.min(160, TREEMAP_W * 0.82));

  const [tests, setTests]       = useState<PsychTest[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [quizzes, setQuizzes]   = useState<Quiz[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [userPsychResults, setUserPsychResults] = useState<Record<string, { result_code: string; completed_at: string }>>({});
  const [questionMeta, setQuestionMeta] = useState<Record<string, QuestionAnalyticsMeta>>({});
  const [premiumComparison, setPremiumComparison] = useState<PremiumUserComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonUnavailable, setComparisonUnavailable] = useState(false);

  const isPremiumUser = user?.subscription_tier === "premium";
  const hasPremiumComparison = Boolean(premiumComparison?.allowed);

  useEffect(() => {
    listPsychTests().then(setTests);
    listPassages().then(setPassages);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    let cancelled = false;

    const loadCoreAnalytics = async () => {
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("load_timeout")), 8000)
    );
    Promise.race([
      Promise.all([listUserAttempts(user.id), listUserPsychResults(user.id)]),
      deadline,
    ]).then(async ([as, pr]) => {
      if (cancelled) return;
      const submitted = as.filter((a) => a.status === "submitted");
      const quizIds = [...new Set(submitted.map((a) => a.quiz_id))];
      const qs = await listQuizzesByIds(quizIds);
      if (cancelled) return;
      setAttempts(submitted);
      setQuizzes(qs);
      setUserPsychResults(pr);
      const allQuestionIds = [...new Set(submitted.flatMap((a) => Object.keys(a.answers ?? {})))];
      if (allQuestionIds.length > 0) {
        const meta = await fetchQuestionAnalyticsData(allQuestionIds);
        if (cancelled) return;
        setQuestionMeta(meta);
      }
    }).catch(() => {
      // Timed out or network error — analytics stay empty; screen remains usable
    });
    };

    const loadPremiumComparison = async () => {
      if (user.subscription_tier !== "premium") {
        if (!cancelled) {
          setPremiumComparison(null);
          setComparisonLoading(false);
          setComparisonUnavailable(false);
        }
        return;
      }

      if (!cancelled) {
        setComparisonLoading(true);
        setComparisonUnavailable(false);
      }

      try {
        const comparison = await fetchPremiumUserComparison(user.id);
        if (cancelled) return;
        setPremiumComparison(comparison);
        setComparisonUnavailable(!comparison || !comparison.allowed);
      } catch {
        if (cancelled) return;
        setPremiumComparison(null);
        setComparisonUnavailable(true);
      } finally {
        if (!cancelled) setComparisonLoading(false);
      }
    };

    void loadCoreAnalytics();
    void loadPremiumComparison();

    return () => {
      cancelled = true;
    };
  }, [user]));

  const quizMap = useMemo(
    () => quizzes.reduce<Record<string, Quiz>>((m, q) => ({ ...m, [q.id]: q }), {}),
    [quizzes],
  );

  // ── Passage radar (12 axes) ──────────────────────────────────────────
  const { passageAxes, passageValues } = useMemo(() => {
    // Use actual passage titles from DB, stripping "(節錄)" suffix
    const axes = passages.map((p) => p.title.replace(/（節錄）$/, ""));
    // Aggregate: sum correct / sum total across all attempts for each passage
    const values = passages.map((p) => {
      const pa = attempts.filter((a) => quizMap[a.quiz_id]?.passage_id === p.id);
      if (pa.length === 0) return 0;
      const totalCorrect = pa.reduce((s, a) => s + (a.score ?? 0), 0);
      const totalAnswered = pa.reduce((s, a) => s + (a.total ?? 0), 0);
      if (totalAnswered === 0) return 0;
      return Math.round((totalCorrect / totalAnswered) * 100);
    });
    return { passageAxes: axes, passageValues: values };
  }, [passages, attempts, quizMap]);

  // ── Skills radar (8 axes) via per-question answer analysis ───────────
  const { skillAxes, skillValues } = useMemo(() => {
    const correct: Record<string, number> = {};
    const total:   Record<string, number> = {};

    for (const attempt of attempts) {
      for (const [questionId, selectedOptionId] of Object.entries(attempt.answers ?? {})) {
        const meta = questionMeta[questionId];
        if (!meta) continue;
        const isCorrect = meta.correctOptionId === selectedOptionId;
        for (const tagId of meta.tagIds) {
          correct[tagId] = (correct[tagId] ?? 0) + (isCorrect ? 1 : 0);
          total[tagId]   = (total[tagId]   ?? 0) + 1;
        }
      }
    }

    const axes   = SKILL_TAGS.map((t) => t.label);
    const values = SKILL_TAGS.map((t) => {
      const tot = total[t.id] ?? 0;
      if (tot === 0) return 0;
      return Math.round((correct[t.id] ?? 0) / tot * 100);
    });
    return { skillAxes: axes, skillValues: values };
  }, [attempts, questionMeta]);

  // ── Summary metrics ──────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalQuestions = attempts.reduce((s, a) => s + (a.total ?? 0), 0);
    const totalCorrect = attempts.reduce((s, a) => s + (a.score ?? 0), 0);
    const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const quizzesCompleted = attempts.length;

    // Best pass streak
    let bestStreak = 0;
    let currentStreak = 0;
    for (const a of [...attempts].sort((x, y) => (x.submitted_at ?? "").localeCompare(y.submitted_at ?? ""))) {
      const quiz = quizMap[a.quiz_id];
      const passed = quiz && a.score != null && a.total > 0 && (a.score / a.total) >= ((quiz.pass_score ?? 60) / 100);
      if (passed) { currentStreak++; bestStreak = Math.max(bestStreak, currentStreak); }
      else { currentStreak = 0; }
    }

    return { totalQuestions, totalCorrect, avgAccuracy, quizzesCompleted, bestStreak };
  }, [attempts, quizMap]);

  const passageBaselineValues = useMemo(() => {
    const baseline = premiumComparison?.allowed ? (premiumComparison.passage_avg_by_id ?? {}) : {};
    return passages.map((p) => Number(baseline[p.id] ?? 0));
  }, [premiumComparison, passages]);

  const skillBaselineValues = useMemo(() => {
    const baseline = premiumComparison?.allowed ? (premiumComparison.skill_avg_by_tag ?? {}) : {};
    return SKILL_TAGS.map((t) => Number(baseline[t.id] ?? 0));
  }, [premiumComparison]);

  const hasPassageBaseline = useMemo(
    () => isPremiumUser && hasPremiumComparison && passageBaselineValues.some((v) => v > 0),
    [isPremiumUser, hasPremiumComparison, passageBaselineValues],
  );

  const hasSkillBaseline = useMemo(
    () => isPremiumUser && hasPremiumComparison && skillBaselineValues.some((v) => v > 0),
    [isPremiumUser, hasPremiumComparison, skillBaselineValues],
  );

  // ── Accuracy trend (last 20 attempts, chronological) ─────────────────
  const accuracyTrendData = useMemo(() => {
    const sorted = [...attempts]
      .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""))
      .slice(-20);
    return sorted.map((a, i) => ({
      value: a.total > 0 ? Math.round(((a.score ?? 0) / a.total) * 100) : 0,
      label: `${i + 1}`,
      frontColor: a.total > 0 && (a.score ?? 0) / a.total >= ((quizMap[a.quiz_id]?.pass_score ?? 60) / 100)
        ? colors.success
        : colors.primary,
    }));
  }, [attempts, quizMap]);

  // ── Quiz type distribution by questions (pie) ────────────────────────
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of attempts) {
      const type = quizMap[a.quiz_id]?.type ?? "exercise";
      counts[type] = (counts[type] ?? 0) + Object.keys(a.answers ?? {}).length;
    }
    const pieColors: Record<string, string> = { exercise: QUIZ_TYPE_COLORS.exercise, quiz: QUIZ_TYPE_COLORS.quiz, exam: QUIZ_TYPE_COLORS.exam };
    return Object.entries(counts).map(([type, count]) => ({
      value: count,
      color: pieColors[type] ?? colors.primary,
      text: QUIZ_TYPE_LABEL[type] ?? type,
    }));
  }, [attempts, quizMap]);

  const totalQuestionsAnswered = useMemo(
    () => attempts.reduce((sum, attempt) => sum + Object.keys(attempt.answers ?? {}).length, 0),
    [attempts],
  );

  // ── Passage distribution by questions (pie) ──────────────────────────
  const PASSAGE_PIE_COLORS = [
    "#B23A2E", "#B68A3E", "#5C8A50", "#4A7CA8", "#8B5E3C",
    "#C28A1E", "#7B6B8D", "#D9847A", "#3E8A7A", "#A85C4A",
    "#6B8A3E", "#8A5C7A",
  ];
  const passageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of attempts) {
      for (const questionId of Object.keys(a.answers ?? {})) {
        const meta = questionMeta[questionId];
        if (!meta) {
          counts["__uncategorized__"] = (counts["__uncategorized__"] ?? 0) + 1;
          continue;
        }
        if (meta.passageId) {
          counts[meta.passageId] = (counts[meta.passageId] ?? 0) + 1;
        } else if (meta.crossPassageId) {
          counts["__cross_passage__"] = (counts["__cross_passage__"] ?? 0) + 1;
        } else {
          counts["__uncategorized__"] = (counts["__uncategorized__"] ?? 0) + 1;
        }
      }
    }
    const passageMap = passages.reduce<Record<string, string>>((m, p) => ({ ...m, [p.id]: p.title.replace(/（節錄）$/, "") }), {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([pid, count], i) => ({
        value: count,
        color: PASSAGE_PIE_COLORS[i % PASSAGE_PIE_COLORS.length],
        text: pid === "__cross_passage__"
          ? "跨篇章"
          : pid === "__uncategorized__"
            ? "未分類"
            : (passageMap[pid] ?? pid),
        id: pid,
      }));
  }, [attempts, questionMeta, passages]);

  // ── Skill distribution (pie) ─────────────────────────────────────────
  const SKILL_PIE_COLORS = [
    "#B23A2E", "#B68A3E", "#5C8A50", "#4A7CA8",
    "#8B5E3C", "#C28A1E", "#7B6B8D", "#D9847A",
  ];
  const skillDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const attempt of attempts) {
      for (const [questionId] of Object.entries(attempt.answers ?? {})) {
        const meta = questionMeta[questionId];
        if (!meta) continue;
        for (const tagId of meta.tagIds) {
          counts[tagId] = (counts[tagId] ?? 0) + 1;
        }
      }
    }
    return SKILL_TAGS
      .filter((t) => (counts[t.id] ?? 0) > 0)
      .map((t, i) => ({
        value: counts[t.id],
        color: SKILL_PIE_COLORS[i % SKILL_PIE_COLORS.length],
        text: t.label,
      }));
  }, [attempts, questionMeta]);

  // ── Accuracy by question difficulty (bar) ─────────────────────────────
  const difficultyPassRate = useMemo(() => {
    const correct: Record<number, number> = {};
    const total: Record<number, number> = {};
    for (const attempt of attempts) {
      for (const [questionId, selectedOptionId] of Object.entries(attempt.answers ?? {})) {
        const meta = questionMeta[questionId];
        if (!meta) continue;
        const diff = Math.round(meta.difficulty) || 1;
        total[diff] = (total[diff] ?? 0) + 1;
        if (meta.correctOptionId === selectedOptionId) {
          correct[diff] = (correct[diff] ?? 0) + 1;
        }
      }
    }
    return [1, 2, 3, 4, 5].map((d) => ({
      value: total[d] ? Math.round(((correct[d] ?? 0) / total[d]) * 100) : 0,
      label: "★".repeat(d),
      frontColor: colors.gold,
    }));
  }, [attempts, questionMeta]);

  // ── Daily activity (last 14 days) ────────────────────────────────────
  const dailyActivity = useMemo(() => {
    const now = new Date();
    const days: { date: string; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    const counts: Record<string, number> = {};
    for (const a of attempts) {
      const day = (a.submitted_at ?? a.started_at).slice(0, 10);
      counts[day] = (counts[day] ?? 0) + (a.total ?? 0);
    }
    return days.map((d) => ({
      value: counts[d.date] ?? 0,
      label: d.label,
      frontColor: (counts[d.date] ?? 0) > 0 ? colors.success : colors.surfaceAlt,
    }));
  }, [attempts]);

  const chartBarWidth = Math.max(contentWidth - spacing.md * 4 - 40, 200);

  const percentileBand = (percentile?: number) => {
    const p = percentile ?? 0;
    if (p >= 90) return "Top 10%";
    if (p >= 80) return "Top 20%";
    if (p >= 50) return "Top 50%";
    return "低於 50%";
  };

  const ListHeader = (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>認識自己</Text>
        <Text style={styles.subtitle}>輕鬆小測驗　・　了解學習風格與職涯傾向</Text>
      </View>

      {/* ── Metric cards ──────────────────────────── */}
      {attempts.length > 0 && (
        <>
          <View style={styles.metricGrid}>
            <MetricCompareCard
              label="總作答題數"
              value={metrics.totalQuestions}
              suffix=""
              accentColor={colors.ink}
              isPremium={isPremiumUser}
              percentile={premiumComparison?.metrics?.completed_questions?.percentile}
              box={premiumComparison?.metrics?.completed_questions?.box}
            />
            <MetricCompareCard
              label="平均正確率"
              value={metrics.avgAccuracy}
              suffix="%"
              accentColor={colors.success}
              isPremium={isPremiumUser}
              percentile={premiumComparison?.metrics?.accuracy?.percentile}
              box={premiumComparison?.metrics?.accuracy?.box}
            />
            <MetricCompareCard
              label="文淵點"
              value={user?.wenyuan_points ?? 0}
              suffix=""
              accentColor={colors.gold}
              isPremium={isPremiumUser}
              percentile={premiumComparison?.metrics?.points?.percentile}
              box={premiumComparison?.metrics?.points?.box}
            />
            <MetricCompareCard
              label="完成測驗數"
              value={metrics.quizzesCompleted}
              suffix=""
              accentColor={colors.primary}
              isPremium={isPremiumUser}
              percentile={premiumComparison?.metrics?.completed_quizzes?.percentile}
              box={premiumComparison?.metrics?.completed_quizzes?.box}
            />
            <View style={styles.metricCard}>
              <Text style={[styles.metricValue, { color: colors.primary }]}>{metrics.bestStreak}</Text>
              <Text style={styles.metricLabel}>最佳連勝</Text>
            </View>
          </View>
          {!isPremiumUser && (
            <View style={styles.premiumTeaser}>
              <Text style={styles.premiumTeaserTitle}>升級學士版解鎖進階比較</Text>
              <Text style={styles.premiumTeaserBody}>查看你屬於 Top 幾%，掌握與同儕差距。</Text>
            </View>
          )}
        </>
      )}

      {/* ── Passage radar ─────────────────────────── */}
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsTitle}>篇章掌握度</Text>
        <Text style={styles.analyticsHint}>各篇章答題平均得分率</Text>
        {passages.length === 12 ? (
          <View style={styles.chartCenter}>
            <RadarChart
              axes={passageAxes}
              values={passageValues}
              color={colors.primary}
              baselineValues={hasPassageBaseline ? passageBaselineValues : undefined}
              baselineColor="rgba(52, 152, 219, 0.30)"
              width={CHART_W}
              height={CHART_W}
            />
            {isPremiumUser && (
              <Text style={styles.baselineHint}>
                {comparisonLoading
                  ? "同儕平均基準載入中…"
                  : comparisonUnavailable
                    ? "暫時未能取得同儕平均基準"
                    : !hasPassageBaseline
                      ? "同儕基準資料不足，稍後再試"
                      : "同儕平均基準已套用（淡色虛線）"}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>載入篇章中…</Text>
          </View>
        )}
      </View>

      {/* ── Skills radar ──────────────────────────── */}
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsTitle}>能力分析</Text>
        <Text style={styles.analyticsHint}>各語文能力答題正確率（基於種子題庫）</Text>
        <View style={styles.chartCenter}>
          <RadarChart
            axes={skillAxes}
            values={skillValues}
            color={colors.accent}
            baselineValues={hasSkillBaseline ? skillBaselineValues : undefined}
            baselineColor="rgba(46, 204, 113, 0.28)"
            width={CHART_W}
            height={Math.round(CHART_W * 0.85)}
          />
          {isPremiumUser && (
            <Text style={styles.baselineHint}>
              {comparisonLoading
                ? "同儕平均基準載入中…"
                : comparisonUnavailable
                  ? "暫時未能取得同儕平均基準"
                  : !hasSkillBaseline
                    ? "同儕基準資料不足，稍後再試"
                    : "同儕平均基準已套用（淡色虛線）"}
            </Text>
          )}
        </View>
      </View>

      {/* ── Detailed analysis charts ──────────────── */}
      {attempts.length > 0 && (
        <>
          {/* Accuracy trend */}
          <CollapsibleSection title="答題正確率趨勢" subtitle={`最近 ${accuracyTrendData.length} 次`}>
            <Text style={styles.analyticsHint}>綠色＝及格，紅色＝未及格</Text>
            <BarChart
              data={accuracyTrendData}
              width={chartBarWidth}
              barWidth={Math.max(8, Math.min(20, chartBarWidth / accuracyTrendData.length - 4))}
              spacing={Math.max(4, chartBarWidth / accuracyTrendData.length - 20)}
              maxValue={100}
              noOfSections={5}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
              yAxisSuffix="%"
              hideRules={false}
              rulesColor={colors.hairline}
              barBorderRadius={3}
              isAnimated
            />
          </CollapsibleSection>

          {/* Distribution: 3 pie charts */}
          {(typeDistribution.length > 0 || passageDistribution.length > 0 || skillDistribution.length > 0) && (
            <CollapsibleSection title="題型分佈" subtitle={`按題目統計・${totalQuestionsAnswered} 題`}>

              {/* 1. By quiz type */}
              {typeDistribution.length > 0 && (
                <>
                  <Text style={styles.pieSubtitle}>按類型</Text>
                  <Text style={styles.analyticsHint}>練習 / 測驗 / 模擬試（題數）</Text>
                  <View style={styles.pieRow}>
                    <PieChart
                      data={typeDistribution.map((d, i) => ({ ...d, text: `${i + 1}` }))}
                      radius={60}
                      showText
                      textColor="#fff"
                      textSize={11}
                      focusOnPress
                      innerRadius={30}
                      innerCircleColor={colors.surface}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: "center" }}>
                          <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 15 }}>{totalQuestionsAnswered}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 9 }}>題</Text>
                        </View>
                      )}
                    />
                    <View style={styles.pieSideLegend}>
                      {typeDistribution.map((d, i) => (
                        <View key={d.text} style={styles.pieSideLegendRow}>
                          <View style={[styles.pieSideLegendIdx, { backgroundColor: d.color }]}>
                            <Text style={styles.pieSideLegendIdxText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.pieSideLegendLabel} numberOfLines={1}>{d.text}</Text>
                          <Text style={styles.pieSideLegendValue}>{d.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* 2. By passage */}
              {passageDistribution.length > 0 && (
                <>
                  <View style={styles.pieDivider} />
                  <Text style={styles.pieSubtitle}>按篇章</Text>
                  <Text style={styles.analyticsHint}>各篇章的答題數量</Text>
                  <View style={styles.pieRow}>
                    <View style={styles.treemapWrap}>
                      <Treemap
                        data={passageDistribution.map((d) => ({ id: d.id, label: d.text, value: d.value, color: d.color }))}
                        width={TREEMAP_W}
                        height={TREEMAP_H}
                      />
                    </View>
                    <View style={styles.pieSideLegend}>
                      {passageDistribution.map((d, i) => (
                        <View key={d.text} style={styles.pieSideLegendRow}>
                          <View style={[styles.pieSideLegendIdx, { backgroundColor: d.color }]}>
                            <Text style={styles.pieSideLegendIdxText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.pieSideLegendLabel} numberOfLines={1}>{d.text}</Text>
                          <Text style={styles.pieSideLegendValue}>{d.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* 3. By skill */}
              {skillDistribution.length > 0 && (
                <>
                  <View style={styles.pieDivider} />
                  <Text style={styles.pieSubtitle}>按考核能力</Text>
                  <Text style={styles.analyticsHint}>各技能的答題數量</Text>
                  <View style={styles.pieRow}>
                    <PieChart
                      data={skillDistribution.map((d, i) => ({ ...d, text: `${i + 1}` }))}
                      radius={60}
                      showText
                      textColor="#fff"
                      textSize={9}
                      focusOnPress
                      innerRadius={30}
                      innerCircleColor={colors.surface}
                    />
                    <View style={styles.pieSideLegend}>
                      {skillDistribution.map((d, i) => (
                        <View key={d.text} style={styles.pieSideLegendRow}>
                          <View style={[styles.pieSideLegendIdx, { backgroundColor: d.color }]}>
                            <Text style={styles.pieSideLegendIdxText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.pieSideLegendLabel}>{d.text}</Text>
                          <Text style={styles.pieSideLegendValue}>{d.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}

            </CollapsibleSection>
          )}

          {/* Pass rate by difficulty */}
          <CollapsibleSection title="難度突破" subtitle="按題目難度統計正確率">
            <BarChart
              data={difficultyPassRate}
              width={chartBarWidth}
              barWidth={30}
              spacing={20}
              maxValue={100}
              noOfSections={5}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              yAxisSuffix="%"
              hideRules={false}
              rulesColor={colors.hairline}
              barBorderRadius={4}
              isAnimated
            />
          </CollapsibleSection>

          {/* Daily activity */}
          <CollapsibleSection title="每日作答量" subtitle="最近 14 天">
            <BarChart
              data={dailyActivity}
              width={chartBarWidth}
              barWidth={Math.max(6, Math.min(16, chartBarWidth / 14 - 4))}
              spacing={Math.max(2, chartBarWidth / 14 - 16)}
              noOfSections={4}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 8, width: 30, textAlign: "center" }}
              hideRules={false}
              rulesColor={colors.hairline}
              barBorderRadius={3}
              isAnimated
            />
          </CollapsibleSection>
        </>
      )}

      <Text style={styles.sectionLabel}>心理小測驗</Text>
    </View>
  );

  function MetricCompareCard(props: {
    label: string;
    value: number;
    suffix: string;
    accentColor: string;
    isPremium: boolean;
    percentile?: number;
    box?: MetricBoxStats;
  }) {
    const { label, value, suffix, accentColor, isPremium, percentile, box } = props;
    return (
      <View style={styles.metricCard}>
        <Text style={[styles.metricValue, { color: accentColor }]}>{value}{suffix}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
        {isPremium && typeof percentile === "number" && box ? (
          <>
            <Text style={styles.percentileBadge}>{percentileBand(percentile)}</Text>
            <MiniBoxPlot box={box} value={value} />
          </>
        ) : null}
      </View>
    );
  }

  function MiniBoxPlot({ box, value }: { box: MetricBoxStats; value: number }) {
    const range = Math.max(box.max - box.min, 1);
    const q1Pct = ((box.q1 - box.min) / range) * 100;
    const q3Pct = ((box.q3 - box.min) / range) * 100;
    const medPct = ((box.median - box.min) / range) * 100;
    const userPct = Math.min(100, Math.max(0, ((value - box.min) / range) * 100));
    return (
      <View style={styles.boxPlotWrap}>
        <View style={styles.boxPlotTrack}>
          <View style={[styles.boxPlotIqr, { left: `${q1Pct}%`, width: `${Math.max(q3Pct - q1Pct, 1)}%` }]} />
          <View style={[styles.boxPlotMedian, { left: `${medPct}%` }]} />
          <View style={[styles.boxPlotUser, { left: `${userPct}%` }]} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={tests}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.md }}
        ListHeaderComponent={ListHeader}
        renderItem={({ item: test }) => {
          const pastResult = userPsychResults[test.id];
          const resultMapping = pastResult
            ? test.results.find((r) => r.code === pastResult.result_code)
            : null;
          return (
            <TouchableOpacity
              style={[styles.card, test.color_hex ? { backgroundColor: test.color_hex + "22" } : null]}
              activeOpacity={0.85}
              onPress={() => nav.navigate("PsychTest", { testId: test.id })}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={PSYCH_ICON_MAP[test.icon_name] ?? "sparkles"}
                  size={24}
                  color={test.color_hex ?? colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{test.title}</Text>
                <Text style={styles.cardDesc}>{test.description}</Text>
                <Text style={styles.cardMeta}>{test.question_count} 題　・　約 {test.estimated_minutes} 分鐘</Text>
                {resultMapping && (
                  <View style={styles.resultBadge}>
                    <Text style={styles.resultBadgeLabel}>上次結果</Text>
                    <Text style={styles.resultBadgeText} numberOfLines={2}>{resultMapping.title}</Text>
                  </View>
                )}
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
  header: { marginBottom: spacing.md },
  title: { ...typography.title, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  analyticsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyticsTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 15, marginBottom: 2 },
  analyticsHint: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm },
  chartCenter: { alignItems: "center" },
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  placeholderText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  resultBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "100%",
  },
  resultBadgeLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  resultBadgeText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  // ── Metric cards ──
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricValue: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 20,
    marginBottom: 2,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  percentileBadge: {
    marginTop: 4,
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
  },
  boxPlotWrap: {
    marginTop: 6,
    width: "100%",
    paddingHorizontal: 6,
  },
  boxPlotTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    position: "relative",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  boxPlotIqr: {
    position: "absolute",
    top: 1,
    bottom: 1,
    backgroundColor: "rgba(206, 170, 75, 0.45)",
    borderRadius: 4,
  },
  boxPlotMedian: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.ink,
  },
  boxPlotUser: {
    position: "absolute",
    top: -2,
    width: 6,
    height: 16,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  premiumTeaser: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  premiumTeaserTitle: {
    ...typography.bodyEmphasis,
    color: colors.primary,
  },
  premiumTeaserBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  baselineHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  // ── Pie legend ──
  pieLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  pieLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pieLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pieLegendLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  pieLegendValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  pieLegendWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pieSubtitle: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  pieDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: spacing.md,
  },
  // ── Side-by-side pie + legend layout ──
  pieRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  treemapWrap: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  pieSideLegend: {
    flex: 1,
    gap: 3,
  },
  pieSideLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pieSideLegendIdx: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pieSideLegendIdxText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  pieSideLegendLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    flex: 1,
  },
  pieSideLegendValue: {
    color: colors.ink,
    fontSize: 9,
    fontWeight: "700",
  },
});


/**
 * UsageInsightsPanel — Dashboard with collapsible sections.
 * Order: summary → trends → AI → skipping → passages → difficulty → exercises → students
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { colors, spacing, typography } from "../../theme";
import CollapsibleSection from "../../components/CollapsibleSection";
import {
  fetchDailyUsageMetrics,
  fetchAIUsageStats,
  fetchPassageSuccessRates,
  fetchDifficultySuccessRates,
  fetchSkippingRate,
  fetchExerciseChoiceDistribution,
  fetchPerStudentExerciseCounts,
  fetchUsageMetrics,
} from "../../lib/adminService";
import {
  DailyUsageMetric,
  AIUsageStats,
  PassageSuccessRate,
  DifficultySuccessRate,
  ExerciseChoiceItem,
  StudentExerciseCount,
  UsageWindowMetrics,
} from "../../types/database";

const DAY_OPTIONS = [7, 14, 21, 31, 60, 90, 120] as const;
const METRIC_COLORS = {
  activeUsers: colors.primary,
  newUsers: colors.gold,
  loginEvents: colors.success,
  visitorDevices: colors.inkSoft,
};
type MetricKey = keyof typeof METRIC_COLORS;
const METRIC_KEYS: MetricKey[] = ["activeUsers", "newUsers", "loginEvents", "visitorDevices"];
const METRIC_LABELS: Record<MetricKey, string> = {
  activeUsers: "活躍用戶",
  newUsers: "新用戶",
  loginEvents: "登入次數",
  visitorDevices: "訪客裝置",
};
const METRIC_DESCS: Record<MetricKey, string> = {
  activeUsers: "在此時段內至少做過一次練習的獨立用戶數",
  newUsers: "在此時段內首次註冊的帳號數",
  loginEvents: "所有用戶的登入事件總次數（含重複）",
  visitorDevices: "未登入狀態下瀏覽的獨立裝置數",
};

const screenWidth = Dimensions.get("window").width;

export default function UsageInsightsPanel() {
  const [days, setDays] = useState<number>(7);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("activeUsers");
  const [daily, setDaily] = useState<DailyUsageMetric[]>([]);
  const [totals, setTotals] = useState<UsageWindowMetrics | null>(null);
  const [aiStats, setAIStats] = useState<AIUsageStats | null>(null);
  const [passageRates, setPassageRates] = useState<PassageSuccessRate[]>([]);
  const [diffRates, setDiffRates] = useState<DifficultySuccessRate[]>([]);
  const [skipping, setSkipping] = useState<{ total: number; skipped: number; rate: number } | null>(null);
  const [exerciseDist, setExerciseDist] = useState<ExerciseChoiceItem[]>([]);
  const [studentCounts, setStudentCounts] = useState<StudentExerciseCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, t, ai] = await Promise.all([
        fetchDailyUsageMetrics(days).catch(() => []),
        fetchUsageMetrics(days).catch(() => null),
        fetchAIUsageStats(days).catch(() => null),
      ]);
      if (cancelled) return;
      setDaily(d);
      setTotals(t);
      setAIStats(ai);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSectionLoading(true);
      const [pr, dr, sk, ed, sc] = await Promise.all([
        fetchPassageSuccessRates().catch(() => []),
        fetchDifficultySuccessRates().catch(() => []),
        fetchSkippingRate().catch(() => ({ total: 0, skipped: 0, rate: 0 })),
        fetchExerciseChoiceDistribution().catch(() => []),
        fetchPerStudentExerciseCounts().catch(() => []),
      ]);
      if (cancelled) return;
      setPassageRates(pr);
      setDiffRates(dr);
      setSkipping(sk);
      setExerciseDist(ed);
      setStudentCounts(sc);
      setSectionLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading && sectionLoading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const barChartWidth = Math.max(screenWidth - 80, 300);
  const barData = daily.map((d, i) => ({
    value: d[selectedMetric],
    label: days <= 14 ? d.date.slice(5) : (i % Math.ceil(days / 10) === 0 ? d.date.slice(5) : ""),
    frontColor: METRIC_COLORS[selectedMetric],
    onPress: () => Alert.alert(d.date, `${METRIC_LABELS[selectedMetric]}: ${d[selectedMetric]}`),
  }));
  const maxVal = Math.max(...barData.map((b) => b.value), 1);

  return (
    <View>
      {/* Day toggle */}
      <View style={styles.toggleRow}>
        {DAY_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.togglePill, days === d && styles.togglePillActive]}
            onPress={() => setDays(d)}
          >
            <Text style={[styles.toggleLabel, days === d && styles.toggleLabelActive]}>{d}天</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 1. KPI Summary (always visible) */}
      <CollapsibleSection title={`過去 ${days} 天 — 總覽`} subtitle="核心指標摘要" defaultExpanded>
        {totals && (
          <View style={styles.kpiGrid}>
            {METRIC_KEYS.map((mk) => (
              <TouchableOpacity
                key={mk}
                style={[styles.kpiPill, selectedMetric === mk && styles.kpiPillActive]}
                onPress={() => setSelectedMetric(mk)}
                activeOpacity={0.7}
              >
                <View style={[styles.kpiDot, { backgroundColor: METRIC_COLORS[mk] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.kpiValue}>{totals[mk].toLocaleString()}</Text>
                  <Text style={styles.kpiLabel}>{METRIC_LABELS[mk]}</Text>
                  <Text style={styles.kpiDesc}>{METRIC_DESCS[mk]}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </CollapsibleSection>

      {/* 2. AI Advisor */}
      <CollapsibleSection title="AI 顧問用量" subtitle={`過去 ${days} 天`}>
        {aiStats ? (
          <View style={styles.kpiGrid}>
            <MetricPill label="獨立用戶數" value={aiStats.uniqueUsers} desc="至少與 AI 顧問對話一次的獨立用戶" color={colors.primary} />
            <MetricPill label="總對話回覆數" value={aiStats.totalConversations} desc="AI 顧問回覆的總訊息數量" color={colors.gold} />
            <MetricPill label="平均回覆字數" value={aiStats.avgOutputLength} desc="每條 AI 回覆的平均字符數" color={colors.success} />
          </View>
        ) : (
          <Text style={styles.empty}>載入中…</Text>
        )}
      </CollapsibleSection>

      {/* 3. Skipping rate */}
      <CollapsibleSection title="練習跳過率" subtitle="未作答直接提交的比例">
        {skipping ? (
          <View style={styles.kpiGrid}>
            <MetricPill label="已提交練習" value={skipping.total} desc="所有學生已提交的練習實例總數" color={colors.success} />
            <MetricPill label="被跳過練習" value={skipping.skipped} desc="提交時未作答任何題目" color={colors.primary} />
            <MetricPill label="跳過率" value={`${(skipping.rate * 100).toFixed(1)}%`} desc="跳過數 ÷ 提交數" color={colors.gold} />
          </View>
        ) : (
          <Text style={styles.empty}>載入中…</Text>
        )}
      </CollapsibleSection>

      {/* 4. Daily trend chart */}
      <CollapsibleSection title="每日趨勢" subtitle={METRIC_LABELS[selectedMetric]}>
        <Text style={styles.cardDesc}>{METRIC_DESCS[selectedMetric]}（點擊柱形查看數值）</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : barData.length === 0 ? (
          <Text style={styles.empty}>尚無資料</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={barData}
              width={barChartWidth}
              height={180}
              barWidth={days <= 14 ? 20 : days <= 31 ? 12 : 6}
              spacing={days <= 14 ? 12 : days <= 31 ? 6 : 3}
              noOfSections={4}
              maxValue={maxVal + Math.ceil(maxVal * 0.1)}
              yAxisTextStyle={styles.axisText}
              xAxisLabelTextStyle={styles.axisText}
              barBorderRadius={3}
              isAnimated
              rulesColor={colors.hairline}
              backgroundColor={colors.surface}
              yAxisColor={colors.hairline}
              xAxisColor={colors.hairline}
            />
          </ScrollView>
        )}
      </CollapsibleSection>

      {/* 5. Passage success rates */}
      {sectionLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        <>
          <CollapsibleSection title="篇章答題正確率" subtitle="各篇章全體學生正確率">
            {passageRates.length === 0 ? (
              <Text style={styles.empty}>尚無資料</Text>
            ) : (
              <>
                <Text style={styles.cardDesc}>點擊柱形查看詳情</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={passageRates.map((p) => ({
                      value: Math.round(p.rate * 100),
                      label: p.passage_title.length > 4 ? p.passage_title.slice(0, 4) + "…" : p.passage_title,
                      frontColor: p.rate >= 0.7 ? colors.success : p.rate >= 0.4 ? colors.gold : colors.primary,
                      topLabelComponent: () => (
                        <Text style={styles.barTopLabel}>{Math.round(p.rate * 100)}%</Text>
                      ),
                      onPress: () => Alert.alert(p.passage_title, `答對 ${p.correct} / 共 ${p.total}\n正確率 ${Math.round(p.rate * 100)}%`),
                    }))}
                    width={Math.max(passageRates.length * 50, barChartWidth)}
                    height={200}
                    barWidth={30}
                    spacing={16}
                    noOfSections={5}
                    maxValue={100}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={{ ...styles.axisText, fontSize: 9 }}
                    barBorderRadius={3}
                    isAnimated
                    rulesColor={colors.hairline}
                    backgroundColor={colors.surface}
                    yAxisColor={colors.hairline}
                    xAxisColor={colors.hairline}
                    yAxisSuffix="%"
                  />
                </ScrollView>
                <View style={styles.legendCol}>
                  {passageRates.map((p) => (
                    <View key={p.passage_id} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: p.rate >= 0.7 ? colors.success : p.rate >= 0.4 ? colors.gold : colors.primary }]} />
                      <Text style={styles.legendLabel} numberOfLines={1}>{p.passage_title}</Text>
                      <Text style={styles.legendValue}>{p.correct}/{p.total} ({Math.round(p.rate * 100)}%)</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </CollapsibleSection>

          {/* 6. Difficulty success rate */}
          <CollapsibleSection title="難度等級答題正確率" subtitle="各星級難度全體正確率">
            {diffRates.length === 0 ? (
              <Text style={styles.empty}>尚無資料</Text>
            ) : (
              <>
                <Text style={styles.cardDesc}>點擊柱形查看詳情</Text>
                <BarChart
                  data={diffRates.map((d) => ({
                    value: Math.round(d.rate * 100),
                    label: `${"★".repeat(d.difficulty)}`,
                    frontColor: d.difficulty <= 2 ? colors.success : d.difficulty <= 3 ? colors.gold : colors.primary,
                    topLabelComponent: () => (
                      <Text style={styles.barTopLabel}>{Math.round(d.rate * 100)}%</Text>
                    ),
                    onPress: () => Alert.alert(`難度 ${d.difficulty}`, `答對 ${d.correct} / 共 ${d.total}\n正確率 ${Math.round(d.rate * 100)}%`),
                  }))}
                  width={barChartWidth}
                  height={180}
                  barWidth={40}
                  spacing={20}
                  noOfSections={5}
                  maxValue={100}
                  yAxisTextStyle={styles.axisText}
                  xAxisLabelTextStyle={styles.axisText}
                  barBorderRadius={3}
                  isAnimated
                  rulesColor={colors.hairline}
                  backgroundColor={colors.surface}
                  yAxisColor={colors.hairline}
                  xAxisColor={colors.hairline}
                  yAxisSuffix="%"
                />
                <View style={styles.legendCol}>
                  {diffRates.map((d) => (
                    <View key={d.difficulty} style={styles.legendRow}>
                      <Text style={styles.legendLabel}>難度 {d.difficulty}（{"★".repeat(d.difficulty)}）</Text>
                      <Text style={styles.legendValue}>{d.correct}/{d.total} ({Math.round(d.rate * 100)}%)</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </CollapsibleSection>

          {/* 7. Exercise choice distribution */}
          <CollapsibleSection title="練習選擇分佈" subtitle="各練習被選做的次數與佔比">
            {exerciseDist.length === 0 ? (
              <Text style={styles.empty}>尚無資料</Text>
            ) : (
              <>
                <Text style={styles.cardDesc}>點擊柱形查看詳情</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={exerciseDist.slice(0, 20).map((e, i) => ({
                      value: e.instanceCount,
                      label: e.quiz_title.length > 6 ? e.quiz_title.slice(0, 6) + "…" : e.quiz_title,
                      frontColor: [colors.primary, colors.gold, colors.success, colors.inkSoft][i % 4],
                      onPress: () => Alert.alert(e.quiz_title, `${e.instanceCount} 次 (${e.percentage.toFixed(1)}%)\n篇章：${e.passage_title ?? "—"}`),
                    }))}
                    width={Math.max(exerciseDist.slice(0, 20).length * 55, barChartWidth)}
                    height={180}
                    barWidth={32}
                    spacing={16}
                    noOfSections={4}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={{ ...styles.axisText, fontSize: 9 }}
                    barBorderRadius={3}
                    isAnimated
                    rulesColor={colors.hairline}
                    backgroundColor={colors.surface}
                    yAxisColor={colors.hairline}
                    xAxisColor={colors.hairline}
                  />
                </ScrollView>
                <View style={styles.legendCol}>
                  {exerciseDist.map((e) => (
                    <View key={e.quiz_id} style={styles.legendRow}>
                      <Text style={styles.legendLabel} numberOfLines={1}>{e.quiz_title}</Text>
                      <Text style={styles.legendValue}>{e.instanceCount} 次 ({e.percentage.toFixed(1)}%)</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </CollapsibleSection>

          {/* 8. Per-student exercise counts */}
          <CollapsibleSection title="學生個人練習次數" subtitle="每位學生歷來完成的練習總數">
            {studentCounts.length === 0 ? (
              <Text style={styles.empty}>尚無資料</Text>
            ) : (
              <>
                <View style={styles.statRow}>
                  <StatBox label="總學生數" value={studentCounts.length} />
                  <StatBox label="平均次數" value={(studentCounts.reduce((s, c) => s + c.count, 0) / studentCounts.length).toFixed(1)} />
                  <StatBox label="最多" value={studentCounts[0]?.count ?? 0} />
                  <StatBox label="中位數" value={studentCounts[Math.floor(studentCounts.length / 2)]?.count ?? 0} />
                </View>
                <Text style={[styles.cardDesc, { marginTop: spacing.sm }]}>點擊柱形查看學生</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={studentCounts.slice(0, 30).map((s) => ({
                      value: s.count,
                      label: s.username.length > 4 ? s.username.slice(0, 4) + "…" : s.username,
                      frontColor: colors.primary,
                      onPress: () => Alert.alert(s.username, `完成 ${s.count} 次練習`),
                    }))}
                    width={Math.max(studentCounts.slice(0, 30).length * 40, barChartWidth)}
                    height={180}
                    barWidth={20}
                    spacing={12}
                    noOfSections={4}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={{ ...styles.axisText, fontSize: 9 }}
                    barBorderRadius={3}
                    isAnimated
                    rulesColor={colors.hairline}
                    backgroundColor={colors.surface}
                    yAxisColor={colors.hairline}
                    xAxisColor={colors.hairline}
                  />
                </ScrollView>
              </>
            )}
          </CollapsibleSection>
        </>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function MetricPill({ label, value, desc, color }: { label: string; value: number | string; desc: string; color: string }) {
  return (
    <View style={styles.metricPill}>
      <View style={[styles.kpiDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.kpiValue}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Text style={styles.kpiDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statBoxVal}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
  togglePill: { paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  togglePillActive: { backgroundColor: colors.primary },
  toggleLabel: { ...typography.caption, color: colors.inkSoft, fontWeight: "600" },
  toggleLabelActive: { color: colors.primaryOnDark },
  cardDesc: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.inkMuted },
  kpiGrid: { gap: spacing.xs },
  kpiPill: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, paddingHorizontal: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  kpiPillActive: { borderColor: colors.primary },
  kpiDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm, marginTop: 4 },
  kpiValue: { ...typography.body, color: colors.ink, fontWeight: "700", fontSize: 18 },
  kpiLabel: { ...typography.caption, color: colors.inkSoft },
  kpiDesc: { ...typography.caption, color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  metricPill: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, paddingHorizontal: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: 8 },
  axisText: { ...typography.caption, color: colors.inkMuted, fontSize: 10 },
  barTopLabel: { ...typography.caption, color: colors.ink, fontSize: 9, fontWeight: "600" },
  legendCol: { marginTop: spacing.sm, gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingHorizontal: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.xs },
  legendLabel: { ...typography.caption, color: colors.inkSoft, flex: 1 },
  legendValue: { ...typography.caption, color: colors.ink, fontWeight: "600" },
  statRow: { flexDirection: "row", gap: spacing.xs },
  statBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: spacing.sm, alignItems: "center" },
  statBoxVal: { ...typography.body, color: colors.ink, fontWeight: "700" },
  statBoxLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});

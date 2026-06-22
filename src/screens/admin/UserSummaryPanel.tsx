/**
 * UserSummaryPanel — Collapsible aggregate user statistics.
 * Order: overview → performance → subscription → gender → DSE year → psych → edu emails
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Alert,
} from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { colors, spacing, typography } from "../../theme";
import CollapsibleSection from "../../components/CollapsibleSection";
import { fetchUserSummaryStats, fetchEduEmailStats } from "../../lib/adminService";
import { UserSummaryStats, EduDomainStat, EduDomainMonthly } from "../../types/database";
import { useAuth } from "../../context/AuthContext";
import { useAppResume } from "../../hooks/useAppResume";
import { withTimeout } from "../../lib/asyncTimeout";
import { TIMEOUT_MS } from "../../lib/timeoutConfig";

const screenWidth = Dimensions.get("window").width;

const GENDER_LABELS: Record<string, string> = { male: "男", female: "女", other: "其他" };
const GENDER_COLORS: Record<string, string> = { male: colors.primary, female: colors.gold, other: colors.inkSoft };

export default function UserSummaryPanel() {
  const { loading: authLoading, isSupabaseReady } = useAuth();
  const [stats, setStats] = useState<UserSummaryStats | null>(null);
  const [eduDomains, setEduDomains] = useState<EduDomainStat[]>([]);
  const [eduMonthly, setEduMonthly] = useState<EduDomainMonthly[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!isSupabaseReady) return;
    let cancelled = false;
    try {
      setLoading(true);
      const [s, edu] = await withTimeout(
        Promise.all([
          fetchUserSummaryStats().catch(() => null),
          fetchEduEmailStats().catch(() => ({ domains: [], monthly: [] })),
        ]),
        TIMEOUT_MS.adminPanelLoad,
        "admin_user_summary_load",
      ).catch(() => [null, { domains: [], monthly: [] }] as [UserSummaryStats | null, { domains: EduDomainStat[]; monthly: EduDomainMonthly[] }]);
      if (!cancelled) {
        setStats(s);
        setEduDomains(edu.domains);
        setEduMonthly(edu.monthly);
        setLoading(false);
      }
    } finally {
      cancelled = true;
    }
  }, [isSupabaseReady]);

  useEffect(() => {
    if (authLoading || !isSupabaseReady) return;
    void loadData();
  }, [authLoading, isSupabaseReady, loadData]);

  useAppResume(() => {
    void loadData();
  }, isSupabaseReady);

  if (loading || !stats) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const barChartWidth = Math.max(screenWidth - 80, 300);

  // Pie data builders with onPress
  const genderPieData = Object.entries(stats.genderBreakdown).map(([g, count]) => ({
    value: count,
    color: GENDER_COLORS[g] ?? colors.inkMuted,
    text: `${GENDER_LABELS[g] ?? g}\n${count}`,
    textColor: "#fff",
    textSize: 9,
    textBackgroundColor: GENDER_COLORS[g] ?? colors.inkMuted,
    textBackgroundRadius: 4,
    focused: false,
    onPress: () => Alert.alert(GENDER_LABELS[g] ?? g, `${count} 人 (${((count / stats.totalUsers) * 100).toFixed(1)}%)`),
  }));

  const dseYearData = Object.entries(stats.dseYearBreakdown)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, count]) => ({
      value: count,
      label: year,
      frontColor: colors.primary,
      onPress: () => Alert.alert(`DSE ${year}`, `${count} 人`),
    }));

  const psychCountData = Object.entries(stats.psychTestCountBreakdown)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([cnt, users]) => ({
      value: users,
      label: `${cnt}個`,
      frontColor: colors.gold,
      onPress: () => Alert.alert(`完成 ${cnt} 個心理測驗`, `${users} 位用戶`),
    }));

  return (
    <View>
      {/* 1. Population overview — always expanded */}
      <CollapsibleSection title="用戶總覽" subtitle="核心指標" defaultExpanded>
        <View style={styles.summaryGrid}>
          <SummaryCard label="總用戶數" value={stats.totalUsers} desc="已註冊帳號總數" />
          <SummaryCard label="平均文苑點數" value={stats.avgWenyuanPoints} desc="所有用戶的平均積分" />
          <SummaryCard label="平均正確率" value={`${stats.avgSuccessRate}%`} desc="答題正確率平均值" />
          <SummaryCard label="中位正確率" value={`${stats.medianSuccessRate}%`} desc="正確率分佈中位數" />
        </View>
      </CollapsibleSection>

      {/* 2. Performance */}
      <CollapsibleSection title="答題表現分佈" subtitle="全體學生正確率">
        <View style={styles.summaryGrid}>
          <SummaryCard label="平均" value={`${stats.avgSuccessRate}%`} desc="算術平均" />
          <SummaryCard label="中位" value={`${stats.medianSuccessRate}%`} desc="50% 低於此值" />
        </View>
        <View style={styles.rangeBar}>
          <View style={styles.rangeTrack}>
            <View style={[styles.rangeMarker, { left: `${Math.min(stats.avgSuccessRate, 100)}%`, backgroundColor: colors.primary }]} />
            <View style={[styles.rangeMarker, { left: `${Math.min(stats.medianSuccessRate, 100)}%`, backgroundColor: colors.gold }]} />
          </View>
          <View style={styles.rangeLabels}>
            <Text style={styles.rangeLabel}>0%</Text>
            <Text style={styles.rangeLabel}>50%</Text>
            <Text style={styles.rangeLabel}>100%</Text>
          </View>
        </View>
      </CollapsibleSection>

      {/* 3. Subscription */}
      <CollapsibleSection title="訂閱狀態" subtitle="等級分佈">
        <View style={styles.summaryGrid}>
          <SummaryCard label="庶民版" value={stats.subscriptionBreakdown.free} desc="免費用戶" />
          <SummaryCard label="學士版" value={stats.subscriptionBreakdown.premium} desc="付費用戶" />
        </View>
      </CollapsibleSection>

      {/* 4. Gender */}
      <CollapsibleSection title="性別分佈" subtitle="所有用戶性別組成">
        <View style={{ alignItems: "center" }}>
          <PieChart
            data={genderPieData}
            radius={100}
            innerRadius={40}
            focusOnPress
            showText
            textColor="#fff"
            textSize={9}
            fontWeight="700"
            centerLabelComponent={() => <Text style={styles.pieCenter}>{stats.totalUsers}</Text>}
          />
        </View>
      </CollapsibleSection>

      {/* 5. DSE year */}
      <CollapsibleSection title="DSE 年份分佈" subtitle="各預計應考年份人數">
        {dseYearData.length === 0 ? (
          <Text style={styles.empty}>尚無資料</Text>
        ) : (
          <BarChart
            data={dseYearData}
            width={barChartWidth}
            height={160}
            barWidth={30}
            spacing={16}
            noOfSections={4}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            barBorderRadius={3}
            isAnimated
            rulesColor={colors.hairline}
            backgroundColor={colors.surface}
            yAxisColor={colors.hairline}
            xAxisColor={colors.hairline}
          />
        )}
      </CollapsibleSection>

      {/* 6. Psych test completion */}
      <CollapsibleSection title="心理測驗完成率" subtitle={`${stats.psychTestCompletionRate}% 用戶完成≥1個`}>
        <View style={styles.summaryGrid}>
          <SummaryCard label="完成率" value={`${stats.psychTestCompletionRate}%`} desc="至少做過一個心理測驗" />
        </View>
        {psychCountData.length > 0 && (
          <>
            <Text style={[styles.cardDesc, { marginTop: spacing.sm }]}>各用戶完成測驗數量分佈</Text>
            <BarChart
              data={psychCountData}
              width={barChartWidth}
              height={140}
              barWidth={30}
              spacing={16}
              noOfSections={4}
              yAxisTextStyle={styles.axisText}
              xAxisLabelTextStyle={styles.axisText}
              barBorderRadius={3}
              isAnimated
              rulesColor={colors.hairline}
              backgroundColor={colors.surface}
              yAxisColor={colors.hairline}
              xAxisColor={colors.hairline}
            />
          </>
        )}
      </CollapsibleSection>

      {/* 7. Education email analysis */}
      <CollapsibleSection title="教育機構電郵分析" subtitle={`${eduDomains.reduce((s, d) => s + d.count, 0)} 教育用戶 / ${eduDomains.length} 機構`}>
        {eduDomains.length === 0 ? (
          <Text style={styles.empty}>尚無教育電郵用戶</Text>
        ) : (
          <>
            <View style={styles.summaryGrid}>
              <SummaryCard label="教育電郵用戶" value={eduDomains.reduce((s, d) => s + d.count, 0)} desc="符合教育機構域名" />
              <SummaryCard label="獨立機構數" value={eduDomains.length} desc="不同域名數量" />
            </View>
            <Text style={[styles.cardDesc, { marginTop: spacing.sm }]}>點擊柱形查看詳情</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={eduDomains.slice(0, 20).map((d, i) => ({
                  value: d.count,
                  label: d.domain.length > 12 ? d.domain.slice(0, 12) + "…" : d.domain,
                  frontColor: [colors.primary, colors.gold, colors.success, colors.inkSoft][i % 4],
                  onPress: () => Alert.alert(d.domain, `${d.count} 位用戶`),
                }))}
                width={Math.max(eduDomains.slice(0, 20).length * 60, barChartWidth)}
                height={180}
                barWidth={36}
                spacing={18}
                noOfSections={4}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={{ ...styles.axisText, fontSize: 8 }}
                barBorderRadius={3}
                isAnimated
                rulesColor={colors.hairline}
                backgroundColor={colors.surface}
                yAxisColor={colors.hairline}
                xAxisColor={colors.hairline}
              />
            </ScrollView>
            <View style={styles.legendCol}>
              {eduDomains.map((d, i) => (
                <View key={d.domain} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: [colors.primary, colors.gold, colors.success, colors.inkSoft][i % 4] }]} />
                  <Text style={styles.legendLabel}>{d.domain}</Text>
                  <Text style={styles.legendValue}>{d.count} 人</Text>
                </View>
              ))}
            </View>

            {/* Monthly trend */}
            {eduMonthly.length > 0 && (
              <>
                <Text style={[styles.cardDesc, { marginTop: spacing.md }]}>月度趨勢（前 5 機構）</Text>
                {(() => {
                  const topDomains = [...new Set(eduMonthly.map((m) => m.domain))].slice(0, 5);
                  const allMonths = [...new Set(eduMonthly.map((m) => m.month))].sort();
                  const lineColors = [colors.primary, colors.gold, colors.success, "#7B68EE", "#20B2AA"];
                  return topDomains.map((domain, di) => {
                    const domainData = allMonths.map((m) => {
                      const entry = eduMonthly.find((e) => e.domain === domain && e.month === m);
                      return { value: entry?.count ?? 0, label: m.slice(5), frontColor: lineColors[di % lineColors.length] };
                    });
                    return (
                      <View key={domain} style={{ marginBottom: spacing.sm }}>
                        <LegendItem color={lineColors[di % lineColors.length]} label={domain} />
                        <BarChart
                          data={domainData}
                          width={barChartWidth}
                          height={80}
                          barWidth={14}
                          spacing={6}
                          noOfSections={3}
                          yAxisTextStyle={styles.axisText}
                          xAxisLabelTextStyle={{ ...styles.axisText, fontSize: 8 }}
                          barBorderRadius={2}
                          rulesColor={colors.hairline}
                          backgroundColor={colors.surface}
                          yAxisColor={colors.hairline}
                          xAxisColor={colors.hairline}
                        />
                      </View>
                    );
                  });
                })()}
              </>
            )}
          </>
        )}
      </CollapsibleSection>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, desc }: { label: string; value: string | number; desc: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryVal}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryDesc}>{desc}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardDesc: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.inkMuted },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  summaryCard: { flex: 1, minWidth: 140, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: spacing.sm, alignItems: "center" },
  summaryVal: { ...typography.heading, color: colors.ink, fontWeight: "700" },
  summaryLabel: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  summaryDesc: { ...typography.caption, color: colors.inkMuted, fontSize: 11, textAlign: "center", marginTop: 2 },
  pieRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", gap: spacing.md, flexWrap: "wrap" },
  pieLegend: { gap: 4 },
  miniLegend: { marginTop: spacing.xs, gap: 2 },
  pieCenter: { ...typography.body, color: colors.ink, fontWeight: "700" },
  pieSubtitle: { ...typography.caption, color: colors.inkSoft, fontWeight: "600", marginBottom: spacing.xs },
  legendCol: { marginTop: spacing.sm, gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.xs },
  legendLabel: { ...typography.caption, color: colors.inkSoft, flex: 1 },
  legendValue: { ...typography.caption, color: colors.ink, fontWeight: "600" },
  axisText: { ...typography.caption, color: colors.inkMuted, fontSize: 10 },
  rangeBar: { marginTop: spacing.sm },
  rangeTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, position: "relative", marginBottom: 4 },
  rangeMarker: { position: "absolute", width: 12, height: 12, borderRadius: 6, top: -1, marginLeft: -6, borderWidth: 2, borderColor: colors.surface },
  rangeLabels: { flexDirection: "row", justifyContent: "space-between" },
  rangeLabel: { ...typography.caption, color: colors.inkMuted, fontSize: 10 },
});

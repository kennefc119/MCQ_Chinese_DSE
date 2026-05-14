/**
 * UsageInsightsPanel — Dashboard for activity over 7 / 14 / 31-day windows.
 *
 * For each window we show four KPI pills:
 *   • activeUsers     — distinct user_ids with at least one attempt in window
 *   • newUsers        — profiles created in window
 *   • loginEvents     — rows in dsemcq_login_events in window
 *   • visitorDevices  — distinct device_ids in dsemcq_visit_events in window
 *
 * The relative composition of those four metrics is also rendered as a small
 * SVG pie chart (4 slices). The pie is illustrative — users are encouraged to
 * read the pill numbers for accurate counts.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { colors, spacing, typography } from "../../theme";
import { fetchUsageMetrics } from "../../lib/adminService";
import { UsageWindowMetrics } from "../../types/database";

const WINDOWS = [7, 14, 31] as const;
const SLICE_COLORS = [colors.primary, colors.gold, colors.success, colors.inkSoft];

export default function UsageInsightsPanel() {
  const [data, setData] = useState<Record<number, UsageWindowMetrics | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const results = await Promise.all(WINDOWS.map((d) => fetchUsageMetrics(d).catch(() => null)));
      if (cancelled) return;
      const next: Record<number, UsageWindowMetrics | null> = {};
      WINDOWS.forEach((d, i) => { next[d] = results[i]; });
      setData(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View>
      {WINDOWS.map((d) => {
        const m = data[d];
        if (!m) {
          return (
            <View key={d} style={styles.card}>
              <Text style={styles.windowTitle}>過去 {d} 天</Text>
              <Text style={styles.note}>讀取失敗</Text>
            </View>
          );
        }
        const slices = [m.activeUsers, m.newUsers, m.loginEvents, m.visitorDevices];
        return (
          <View key={d} style={styles.card}>
            <Text style={styles.windowTitle}>過去 {d} 天</Text>

            <View style={styles.row}>
              <View style={styles.pieWrap}>
                <PieChart values={slices} colors={SLICE_COLORS} size={120} />
              </View>

              <View style={styles.pills}>
                <Pill label="活躍用戶" value={m.activeUsers} color={SLICE_COLORS[0]} />
                <Pill label="新用戶" value={m.newUsers} color={SLICE_COLORS[1]} />
                <Pill label="登入次數" value={m.loginEvents} color={SLICE_COLORS[2]} />
                <Pill label="訪客裝置" value={m.visitorDevices} color={SLICE_COLORS[3]} />
              </View>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>AI 顧問聊天</Text>
            <View style={styles.chatRow}>
              <Pill label="使用用戶" value={m.chatUsers} color={colors.inkSoft} />
              <Pill label="對話次數" value={m.chatMessages} color={colors.inkSoft} />
              {m.chatUsers > 0 && (
                <Pill
                  label="平均次數/人"
                  value={Math.round(m.chatMessages / m.chatUsers)}
                  color={colors.inkSoft}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value.toLocaleString()}</Text>
    </View>
  );
}

/** Simple SVG pie. When all values are 0, draws a hollow ring. */
function PieChart({ values, colors: sliceColors, size }: { values: number[]; colors: string[]; size: number }) {
  const total = values.reduce((s, v) => s + v, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  if (total === 0) {
    return (
      <Svg width={size} height={size}>
        <G>
          <Path
            d={describeCircle(cx, cy, r)}
            fill="none"
            stroke={colors.hairline}
            strokeWidth={2}
          />
        </G>
      </Svg>
    );
  }

  let startAngle = -Math.PI / 2;
  const arcs = values.map((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    const endAngle = startAngle + sweep;
    const d = describeArc(cx, cy, r, startAngle, endAngle);
    const path = <Path key={i} d={d} fill={sliceColors[i % sliceColors.length]} />;
    startAngle = endAngle;
    return path;
  });

  return (
    <Svg width={size} height={size}>
      <G>{arcs}</G>
    </Svg>
  );
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  // Handle full-circle edge case (one slice = 100%): split into two arcs.
  if (Math.abs(endAngle - startAngle - Math.PI * 2) < 1e-6) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} L ${cx} ${cy} Z`;
  }
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function describeCircle(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  windowTitle: { ...typography.subheading, color: colors.ink, marginBottom: spacing.sm, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pieWrap: { width: 120, height: 120, justifyContent: "center", alignItems: "center" },
  pills: { flex: 1, gap: spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
  pillDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  pillLabel: { ...typography.caption, color: colors.inkSoft, flex: 1 },
  pillValue: { ...typography.body, color: colors.ink, fontWeight: "700" },
  note: { ...typography.body, color: colors.inkMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: spacing.sm },
  sectionLabel: { ...typography.caption, color: colors.inkSoft, marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  chatRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
});

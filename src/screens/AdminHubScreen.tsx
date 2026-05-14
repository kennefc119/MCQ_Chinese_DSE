/**
 * AdminHubScreen — Admin-only landing page.
 *
 * Renders a top sub-tab bar with four panels:
 *   • announce  — broadcast announcements / push notifications
 *   • usage     — usage insights (active / new / logins / visitors)
 *   • users     — search & manage registered users
 *   • gen       — MCQ generator proxy (calls the FastAPI backend)
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme";
import AnnouncementsPanel from "./admin/AnnouncementsPanel";
import UsageInsightsPanel from "./admin/UsageInsightsPanel";
import UserCheckerPanel from "./admin/UserCheckerPanel";
import GeneratorPanel from "./admin/GeneratorPanel";

type AdminTab = "announce" | "usage" | "users" | "gen";

const TABS: { key: AdminTab; label: string }[] = [
  { key: "announce", label: "公告" },
  { key: "usage", label: "用量" },
  { key: "users", label: "用戶" },
  { key: "gen", label: "出題" },
];

export default function AdminHubScreen() {
  const [tab, setTab] = useState<AdminTab>("announce");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>管理後台</Text>
        <Text style={styles.subtitle}>內部工具・僅管理員可見</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        {tab === "announce" && <AnnouncementsPanel />}
        {tab === "usage" && <UsageInsightsPanel />}
        {tab === "users" && <UserCheckerPanel />}
        {tab === "gen" && <GeneratorPanel />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { ...typography.heading, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    paddingBottom: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabLabel: { ...typography.body, color: colors.inkSoft, fontWeight: "600" },
  tabLabelActive: { color: colors.primaryOnDark },
  body: { flex: 1 },
});

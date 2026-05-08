import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";

const PERKS_FREE = ["每月 5 份練習配額", "基本 AI 顧問問答", "標準題庫", "個人化學習日曆"];
const PERKS_PREMIUM = ["無限練習與模擬試", "AI 顧問深度分析（含寫作建議）", "全部題庫＋過往試題", "錯題本進階分析", "通過模擬試獲雙倍文淵點"];

export default function SubscriptionScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const isPremium = user?.subscription_tier === "premium";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>訂閱方案</Text>
        <Text style={styles.subtitle}>解鎖完整 DSE 文言文備考體驗</Text>

        <View style={[styles.plan, !isPremium && styles.planActive]}>
          <Text style={styles.planName}>免費版</Text>
          <Text style={styles.planPrice}>HK$0 / 月</Text>
          {PERKS_FREE.map((p) => <Text key={p} style={styles.perk}>• {p}</Text>)}
          {!isPremium && <Text style={styles.currentTag}>目前方案</Text>}
        </View>

        <View style={[styles.plan, isPremium && styles.planActive, { borderColor: colors.primary }]}>
          <Text style={[styles.planName, { color: colors.primary }]}>高級版 💎</Text>
          <Text style={styles.planPrice}>HK$48 / 月</Text>
          {PERKS_PREMIUM.map((p) => <Text key={p} style={styles.perk}>• {p}</Text>)}
          {isPremium ? (
            <Text style={styles.currentTag}>目前方案</Text>
          ) : (
            <Button title="升級至高級版（即將推出）" onPress={() => {}} disabled />
          )}
        </View>

        <Text style={styles.note}>* 訂閱功能為 Phase 2 開發項目，現階段所有用戶皆享免費版功能。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primary },
  subtitle: { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  plan: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  planActive: { borderColor: colors.success },
  planName: { ...typography.heading, color: colors.textPrimary },
  planPrice: { color: colors.textSecondary, marginVertical: spacing.xs },
  perk: { color: colors.textPrimary, marginVertical: 2, lineHeight: 22 },
  currentTag: { color: colors.success, fontWeight: "700", marginTop: spacing.sm },
  note: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, lineHeight: 18 },
});

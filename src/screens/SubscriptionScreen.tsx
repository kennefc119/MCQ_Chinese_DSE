import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import SUB from "../content/subscriptionContent.json";

export default function SubscriptionScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const isPremium = user?.subscription_tier === "premium";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>{SUB.pageTitle}</Text>
        <Text style={styles.subtitle}>{SUB.pageSubtitle}</Text>

        <View style={[styles.plan, !isPremium && styles.planActive]}>
          <Text style={styles.planName}>{SUB.freePlan.name}</Text>
          <Text style={styles.planPrice}>{SUB.freePlan.price}</Text>
          {SUB.freePlan.perks.map((p) => <Text key={p} style={styles.perk}>• {p}</Text>)}
          {!isPremium && <Text style={styles.currentTag}>{SUB.currentPlanLabel}</Text>}
        </View>

        <View style={[styles.plan, isPremium && styles.planActive, { borderColor: colors.primary }]}>
          <Text style={[styles.planName, { color: colors.primary }]}>{SUB.premiumPlan.name}</Text>
          <Text style={styles.planPrice}>{SUB.premiumPlan.price}</Text>
          {SUB.premiumPlan.perks.map((p) => <Text key={p} style={styles.perk}>• {p}</Text>)}
          {isPremium ? (
            <Text style={styles.currentTag}>{SUB.currentPlanLabel}</Text>
          ) : (
            <Button title={SUB.upgradeButtonLabel} onPress={() => {}} disabled />
          )}
        </View>

        <Text style={styles.note}>{SUB.note}</Text>
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

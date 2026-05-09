import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { TERMS_SECTIONS, TERMS_LAST_UPDATED } from "../content/termsContent";
import { PRIVACY_SECTIONS, PRIVACY_LAST_UPDATED } from "../content/privacyContent";

type LegalRouteParams = { type: "terms" | "privacy" };

export default function LegalScreen() {
  const nav = useNavigation();
  const params = useRoute().params as LegalRouteParams;
  const isTerms = params.type === "terms";

  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = isTerms ? "使用條款" : "私隱政策";
  const lastUpdated = isTerms ? TERMS_LAST_UPDATED : PRIVACY_LAST_UPDATED;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.company}>Keeonz Limited</Text>
        <Text style={styles.meta}>最後更新：{lastUpdated}</Text>

        <View style={styles.divider} />

        {sections.map((sec, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <Text style={styles.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <View style={styles.contactBox}>
          <Text style={styles.contactLabel}>如有查詢，請聯絡我們：</Text>
          <TouchableOpacity onPress={() => Linking.openURL("mailto:cs@keeonz.ai")}>
            <Text style={styles.contactEmail}>cs@keeonz.ai</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { paddingHorizontal: 4 },
  backText: { color: colors.primary, fontSize: 17 },
  headerTitle: { ...typography.heading, color: colors.textPrimary, textAlign: "center", flex: 1 },
  content: { padding: spacing.lg },
  company: { ...typography.body, color: colors.primary, fontWeight: "700", marginBottom: 4 },
  meta: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionBody: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  contactBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  contactLabel: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  contactEmail: { ...typography.body, color: colors.primary, fontWeight: "600" },
});

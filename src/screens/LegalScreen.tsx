import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import Icon from "../components/Icon";
import InkDivider from "../components/InkDivider";
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
          <Icon name="chevron-back" size="md" color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.company}>Keeonz Limited</Text>
        <Text style={styles.meta}>最後更新　{lastUpdated}</Text>

        <InkDivider style={{ marginVertical: spacing.md }} />

        {sections.map((sec, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <Text style={styles.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <View style={styles.contactBox}>
          <Text style={styles.contactLabel}>有任何疑問，歡迎聯絡：</Text>
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
    borderBottomColor: colors.hairline,
  },
  backBtn: { paddingHorizontal: 4, width: 40 },
  headerTitle: { ...typography.heading, color: colors.ink, textAlign: "center", flex: 1 },
  content: { padding: spacing.lg },
  company: { ...typography.bodyEmphasis, color: colors.primary, marginBottom: 4 },
  meta: { ...typography.micro, color: colors.inkMuted },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.subheading,
    color: colors.ink,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  sectionBody: {
    ...typography.body,
    color: colors.inkSoft,
    lineHeight: 23,
  },
  contactBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
  },
  contactLabel: { ...typography.caption, color: colors.inkMuted, marginBottom: 4 },
  contactEmail: { ...typography.bodyEmphasis, color: colors.primary },
});

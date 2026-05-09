import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import rawData from "../content/schoolPartner.json";

type Feature = { emoji: string; title: string; desc: string };
type Step = { num: string; title: string; desc: string };
type SchoolData = {
  hero: { emoji: string; title: string; subtitle: string };
  whySection: { header: string; paragraph1: string; paragraph2: string };
  featuresHeader: string;
  features: Feature[];
  stepsHeader: string;
  steps: Step[];
  pricing: { tag: string; title: string; desc: string; points: string[] };
  cta: { title: string; desc: string; email: string; address: string };
};

const D = rawData as SchoolData;

export default function SchoolPartnerScreen() {
  const nav = useNavigation();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>學校合作計劃</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{D.hero.emoji}</Text>
          <Text style={styles.heroTitle}>{D.hero.title}</Text>
          <Text style={styles.heroSubtitle}>{D.hero.subtitle}</Text>
        </View>

        <View style={styles.divider} />

        {/* Why section */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>{D.whySection.header}</Text>
          <Text style={styles.bodyText}>{D.whySection.paragraph1}</Text>
          <Text style={[styles.bodyText, { marginTop: spacing.sm }]}>{D.whySection.paragraph2}</Text>
        </View>

        {/* Features */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>{D.featuresHeader}</Text>
          <View style={styles.featureGrid}>
            {D.features.map((f: Feature, i: number) => (
              <View key={i} style={styles.featureCard}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Steps */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>{D.stepsHeader}</Text>
          {D.steps.map((s: Step, i: number) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNumBox}>
                <Text style={styles.stepNum}>{s.num}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Pricing */}
        <View style={styles.pricingCard}>
          <Text style={styles.pricingTag}>{D.pricing.tag}</Text>
          <Text style={styles.pricingTitle}>{D.pricing.title}</Text>
          <Text style={styles.pricingDesc}>{D.pricing.desc}</Text>
          <View style={styles.pricingPoints}>
            {D.pricing.points.map((p: string, i: number) => (
              <View key={i} style={styles.pointRow}>
                <Text style={styles.pointCheck}>✓</Text>
                <Text style={styles.pointText}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA */}
        <View style={styles.ctaBlock}>
          <Text style={styles.ctaTitle}>{D.cta.title}</Text>
          <Text style={styles.ctaDesc}>{D.cta.desc}</Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => Linking.openURL(`mailto:${D.cta.email}?subject=學校合作查詢&body=學校名稱：%0D%0A聯絡人：%0D%0A查詢內容：`)}
          >
            <Text style={styles.ctaBtnText}>📧 發送合作查詢</Text>
          </TouchableOpacity>
          <Text style={styles.ctaEmail}>{D.cta.email}</Text>
          <Text style={styles.ctaAddress}>{D.cta.address}</Text>
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
  headerTitle: { ...typography.heading, color: colors.textPrimary, flex: 1, textAlign: "center" },

  content: { padding: spacing.lg },

  hero: { alignItems: "center", paddingVertical: spacing.lg },
  heroEmoji: { fontSize: 56, marginBottom: spacing.md },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 36,
    marginBottom: spacing.md,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },

  sectionBlock: { marginBottom: spacing.lg },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  bodyText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  featureGrid: { gap: spacing.sm },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureEmoji: { fontSize: 28, marginBottom: spacing.xs },
  featureTitle: { ...typography.heading, color: colors.textPrimary, fontWeight: "700", marginBottom: 4 },
  featureDesc: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  stepNumBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNum: { color: colors.background, fontWeight: "800", fontSize: 13 },
  stepContent: { flex: 1 },
  stepTitle: { ...typography.heading, color: colors.textPrimary, fontWeight: "700", marginBottom: 4 },
  stepDesc: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },

  pricingCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
  },
  pricingTag: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  pricingTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  pricingDesc: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  pricingPoints: { gap: spacing.sm },
  pointRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  pointCheck: { color: colors.primary, fontWeight: "700", fontSize: 16, lineHeight: 22 },
  pointText: { ...typography.body, color: colors.textSecondary, flex: 1, lineHeight: 22 },

  ctaBlock: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  ctaTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  ctaDesc: { ...typography.body, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: spacing.lg },
  ctaBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    width: "100%",
    alignItems: "center",
  },
  ctaBtnText: { ...typography.button, color: colors.background, fontWeight: "700" },
  ctaEmail: { color: colors.primary, fontWeight: "600", marginBottom: spacing.sm },
  ctaAddress: { ...typography.caption, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
});

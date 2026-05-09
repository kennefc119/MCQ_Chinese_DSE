import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";

const FEATURES = [
  {
    emoji: "📊",
    title: "全面學習分析",
    desc: "即時追蹤每位學生的答題表現、弱項分析及學習趨勢，讓老師一目了然。",
  },
  {
    emoji: "🤖",
    title: "AI 顧問無限使用",
    desc: "學生可無限次使用 AI 文言文顧問，24小時隨時獲得個人化學習建議。",
  },
  {
    emoji: "📚",
    title: "豐富題庫與自訂功能",
    desc: "涵蓋 DSE 12 篇指定文言文的精選題庫，學校亦可申請自訂題目集。",
  },
  {
    emoji: "🏆",
    title: "班級進度管理",
    desc: "教師後台一站式管理全班進度，輕鬆掌握學生學習情況。",
  },
  {
    emoji: "🧠",
    title: "心理測試 · 自我認識",
    desc: "以古典文學為主題的趣味心理測試，協助學生了解學習風格，提升學習動機。",
  },
  {
    emoji: "📣",
    title: "優先支援",
    desc: "學校合作客戶享有專屬客戶服務支援，由我們的教育顧問團隊直接服務。",
  },
];

const STEPS = [
  {
    num: "01",
    title: "聯絡我們",
    desc: "發送電郵至 cs@keeonz.ai，告訴我們貴校的規模及需求，我們將於 2 個工作日內回覆。",
  },
  {
    num: "02",
    title: "度身訂造方案",
    desc: "我們的教育顧問將與貴校代表深入了解需求，為貴校設計最合適的學校套餐。",
  },
  {
    num: "03",
    title: "快速部署・全年支援",
    desc: "簽署協議後，最快一個工作週即可完成部署。整個學年均有專人跟進服務。",
  },
];

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
          <Text style={styles.heroEmoji}>🏫</Text>
          <Text style={styles.heroTitle}>讓每位學生都能{"\n"}達到最大潛能</Text>
          <Text style={styles.heroSubtitle}>
            Keeonz Limited 深信科技可以讓優質中文教育更普及。我們與學校並肩同行，以數據驅動的教育科技，協助學生在 DSE 中文科取得更佳成績。
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Problem statement */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>為什麼選擇 Keeonz？</Text>
          <Text style={styles.bodyText}>
            DSE 中文科文言文向來是學生的最大難關。傳統備試方法耗時費力，學生難以得到即時回饋，老師亦難以在繁重的工作中逐一跟進每位學生的學習進度。
          </Text>
          <Text style={[styles.bodyText, { marginTop: spacing.sm }]}>
            我們的平台結合人工智能技術與精心設計的練習題庫，令學生能夠自主學習，老師亦能更有效地分配教學資源。
          </Text>
        </View>

        {/* Features */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>學校套餐功能</Text>
          <View style={styles.featureGrid}>
            {FEATURES.map((f, i) => (
              <View key={i} style={styles.featureCard}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Steps */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>三步開始合作</Text>
          {STEPS.map((s, i) => (
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

        {/* Divider */}
        <View style={styles.divider} />

        {/* Pricing */}
        <View style={styles.pricingCard}>
          <Text style={styles.pricingTag}>學校年費計劃</Text>
          <Text style={styles.pricingTitle}>靈活定價，按校而異</Text>
          <Text style={styles.pricingDesc}>
            我們明白每所學校的規模及需求各有不同。我們提供按班級人數、功能需求及合作年期量身訂製的年費方案，確保貴校以最合理的投資獲得最大效益。
          </Text>
          <View style={styles.pricingPoints}>
            {[
              "學生人數無上限（按計劃而定）",
              "全年平台存取及功能更新",
              "教師管理後台及數據報告",
              "優先技術支援服務",
              "定期回顧及服務優化",
            ].map((p, i) => (
              <View key={i} style={styles.pointRow}>
                <Text style={styles.pointCheck}>✓</Text>
                <Text style={styles.pointText}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA */}
        <View style={styles.ctaBlock}>
          <Text style={styles.ctaTitle}>立即開始合作</Text>
          <Text style={styles.ctaDesc}>
            歡迎學校代表、老師或教育機構與我們聯絡。我們的教育顧問團隊將親切、專業地解答您的所有問題。
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => Linking.openURL("mailto:cs@keeonz.ai?subject=學校合作查詢&body=學校名稱：%0D%0A聯絡人：%0D%0A查詢內容：")}
          >
            <Text style={styles.ctaBtnText}>📧 發送合作查詢</Text>
          </TouchableOpacity>
          <Text style={styles.ctaEmail}>cs@keeonz.ai</Text>
          <Text style={styles.ctaAddress}>
            Keeonz Limited{"\n"}
            香港中環雅柏道3號環球商業中心29樓2904-05室
          </Text>
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

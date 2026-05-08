import React from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import Button from "../components/Button";
import { AppStackParamList } from "../navigation/types";
import { SEED_PASSAGES } from "../data/seedPassages";
import { SEED_QUESTIONS } from "../data/seedQuestions";
import { SEED_QUIZZES } from "../data/seedQuizzes";

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function AdminHubScreen() {
  const nav = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>🛠 管理後台</Text>
        <Text style={styles.subtitle}>內容管理與使用者管理（Phase 2 將提供完整 CRUD）</Text>

        <View style={styles.statRow}>
          <Stat label="篇章" value={SEED_PASSAGES.length} />
          <Stat label="題目" value={SEED_QUESTIONS.length} />
          <Stat label="測驗" value={SEED_QUIZZES.length} />
        </View>

        <Section title="📚 篇章管理">
          {SEED_PASSAGES.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={styles.rowText}>{p.order_no}. {p.title}　<Text style={styles.rowMeta}>{p.dynasty}・{p.author}</Text></Text>
            </View>
          ))}
        </Section>

        <Section title="🗒 題目庫">
          <Text style={styles.note}>共 {SEED_QUESTIONS.length} 條題目，每篇章 4 條（示範資料）。</Text>
          <Text style={styles.note}>未來版本將支援新增／編輯／停用題目，並可標籤化分類。</Text>
        </Section>

        <Section title="📋 測驗管理">
          {SEED_QUIZZES.map((q) => (
            <View key={q.id} style={styles.row}>
              <Text style={styles.rowText}>{q.title}</Text>
              <Text style={styles.rowMeta}>{q.type}　・　{q.question_ids.length} 題</Text>
            </View>
          ))}
        </Section>

        <Section title="📣 公告">
          <Button title="發送全體公告（即將推出）" onPress={() => Alert.alert("即將推出")} variant="ghost" />
        </Section>

        <Section title="👥 使用者">
          <Text style={styles.note}>本頁面為示範介面。連接 Supabase 後可管理使用者角色、文淵點、訂閱狀態。</Text>
        </Section>

        <Button title="返回" variant="ghost" onPress={() => nav.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Stat = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primary },
  subtitle: { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.md },
  statRow: { flexDirection: "row", marginBottom: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, alignItems: "center", marginHorizontal: 4, borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.primary, fontSize: 28, fontWeight: "800" },
  statLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  section: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.sm },
  row: { paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border },
  rowText: { color: colors.textPrimary },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  note: { color: colors.textSecondary, lineHeight: 20, marginVertical: 4 },
});

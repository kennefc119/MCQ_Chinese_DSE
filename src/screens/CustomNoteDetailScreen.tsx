import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useRoute } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { AppStackParamList } from "../navigation/types";
import { CustomNote } from "../types/database";
import { getCustomNote } from "../lib/customNotesService";
import LoadingScreen from "../components/LoadingScreen";
import CollapsibleSection from "../components/CollapsibleSection";
import ScreenHeader from "../components/ScreenHeader";

type Rt = RouteProp<AppStackParamList, "CustomNoteDetail">;

export default function CustomNoteDetailScreen() {
  const { noteId } = useRoute<Rt>().params;
  const [note, setNote] = useState<CustomNote | null>(null);
  useEffect(() => { getCustomNote(noteId).then(setNote).catch(() => setNote(null)); }, [noteId]);
  if (!note) return <LoadingScreen />;
  const content = note.semantic_content as { student_profile_summary?: string; sections?: Array<{ section_id?: string; title?: string; purpose?: string; blocks?: Array<{ text?: string; items?: string[] }> }> };
  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}><ScreenHeader title="AI度身訂造筆記" /><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>{note.title}</Text>
    {note.verification_status === "unverified" && <View style={styles.warning}><Text style={styles.warningTitle}>未通過完整審核</Text><Text style={styles.warningText}>此版本已完成三輪修訂，但仍有待教師覆核。請以課堂教材及官方資料作最後核對。</Text></View>}
    <Text style={styles.score}>事實審核 {note.fact_check_score}　教學配對 {note.pedagogy_score}</Text>
    {content.student_profile_summary ? <View style={styles.summary}><Text style={styles.summaryLabel}>你的溫習重點</Text><Text style={styles.body}>{content.student_profile_summary}</Text></View> : null}
    {(content.sections ?? []).map((section, index) => <CollapsibleSection key={section.section_id ?? String(index)} title={section.title ?? "重點內容"} subtitle={section.purpose} defaultExpanded={index === 0}>{(section.blocks ?? []).map((block, blockIndex) => <View key={blockIndex} style={styles.block}>{block.text ? <Text style={styles.body}>{block.text}</Text> : null}{block.items?.map((item, itemIndex) => <Text key={itemIndex} style={styles.item}>• {item}</Text>)}</View>)}</CollapsibleSection>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.md, paddingBottom: 36 }, title: { ...typography.heading, color: colors.ink, fontSize: 22, marginBottom: spacing.sm }, score: { color: colors.inkMuted, fontSize: 12, marginBottom: spacing.md }, warning: { backgroundColor: colors.warningSoft, borderLeftWidth: 3, borderLeftColor: colors.warning, padding: spacing.md, marginBottom: spacing.md }, warningTitle: { color: colors.warning, fontWeight: "700", marginBottom: 4 }, warningText: { color: colors.inkSoft, fontSize: 12, lineHeight: 19 }, summary: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md }, summaryLabel: { color: colors.primary, fontWeight: "700", fontSize: 12, marginBottom: 7 }, body: { color: colors.inkSoft, fontSize: 15, lineHeight: 24 }, block: { marginBottom: spacing.sm }, item: { color: colors.inkSoft, fontSize: 15, lineHeight: 24, paddingLeft: 3 }, });
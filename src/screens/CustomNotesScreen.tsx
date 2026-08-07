import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { Passage, CustomNoteEligibility, CustomNoteJob, CustomNoteSummary } from "../types/database";
import { listPassages } from "../lib/dataService";
import { createCustomNoteJob, getCustomNoteEligibility, getCustomNoteJob, listCustomNotes } from "../lib/customNotesService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const stageLabel: Record<string, string> = {
  queued: "正在排隊", analyses: "分析作答紀錄", generator: "編寫筆記", review: "教師審閱", optimizer: "修訂筆記", formatter: "整理版面", completed: "已完成",
};

export default function CustomNotesScreen() {
  const nav = useNavigation<Nav>();
  const { user, isSupabaseReady } = useAuth();
  const [passages, setPassages] = useState<Passage[]>([]);
  const [notes, setNotes] = useState<CustomNoteSummary[]>([]);
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<CustomNoteEligibility | null>(null);
  const [request, setRequest] = useState("");
  const [job, setJob] = useState<CustomNoteJob | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedPassage = useMemo(() => passages.find((passage) => passage.id === selectedPassageId), [passages, selectedPassageId]);
  const load = useCallback(async () => {
    if (!user || !isSupabaseReady) return;
    try {
      const [allPassages, savedNotes] = await Promise.all([listPassages(), listCustomNotes()]);
      setPassages(allPassages);
      setNotes(savedNotes);
      setSelectedPassageId((current) => current ?? allPassages[0]?.id ?? null);
    } catch {
      Alert.alert("暫時未能載入", "請檢查網絡後重試。");
    } finally {
      setLoading(false);
    }
  }, [isSupabaseReady, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!selectedPassageId || !user) return;
    setEligibility(null);
    getCustomNoteEligibility(selectedPassageId).then(setEligibility).catch(() => setEligibility(null));
  }, [selectedPassageId, user]);

  useEffect(() => {
    if (!job || ["completed", "completed_unverified", "failed"].includes(job.status)) return;
    const timer = setInterval(() => {
      getCustomNoteJob(job.id).then((nextJob) => {
        setJob(nextJob);
        if (["completed", "completed_unverified"].includes(nextJob.status)) void load();
      }).catch(() => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [job, load]);

  const generate = async () => {
    if (!selectedPassageId || !eligibility?.eligible) return;
    try {
      const result = await createCustomNoteJob(selectedPassageId, request);
      setJob(result.job);
    } catch (error) {
      Alert.alert("未能開始生成", error instanceof Error ? error.message : "請稍後再試。");
    }
  };

  const eligibilityText = !eligibility ? "正在檢查資格..."
    : eligibility.eligible ? `已完成 ${eligibility.answered_question_count} / 51 題，可生成筆記`
    : eligibility.reason === "PREMIUM_REQUIRED" ? "此功能只供有效學士版會員使用"
    : `此篇尚需 ${Math.max(0, 51 - eligibility.answered_question_count)} 道不同題目`;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => void load()}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={styles.header}><View><Text style={styles.eyebrow}>學士版專屬</Text><Text style={styles.title}>AI度身訂造筆記</Text></View><Ionicons name="book-outline" size={30} color={colors.primary} /></View>
          <View style={styles.generator}>
            <Text style={styles.sectionTitle}>建立新筆記</Text>
            <Text style={styles.help}>按你的指定篇章作答紀錄，製作針對性溫習筆記。</Text>
            <FlatList horizontal data={passages} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={styles.chips}
              renderItem={({ item }) => <TouchableOpacity onPress={() => setSelectedPassageId(item.id)} style={[styles.chip, selectedPassageId === item.id && styles.chipActive]}><Text style={[styles.chipText, selectedPassageId === item.id && styles.chipTextActive]} numberOfLines={1}>{item.title.replace(/^p\d+\s*[-—–：:]?\s*/i, "")}</Text></TouchableOpacity>} />
            <Text style={[styles.eligibility, eligibility?.eligible ? styles.eligible : styles.ineligible]}>{eligibilityText}</Text>
            <TextInput value={request} onChangeText={setRequest} placeholder="可選：想加強的範圍、筆記長度或目標" placeholderTextColor={colors.inkMuted} multiline maxLength={1000} style={styles.input} />
            <TouchableOpacity style={[styles.generateButton, !eligibility?.eligible && styles.disabledButton]} disabled={!eligibility?.eligible || Boolean(job && !["completed", "completed_unverified", "failed"].includes(job.status))} onPress={() => void generate()}>
              <Ionicons name="sparkles" size={17} color={colors.primaryOnDark} /><Text style={styles.generateText}>生成 {selectedPassage?.title ?? ""} 筆記</Text>
            </TouchableOpacity>
            {job && <View style={styles.jobRow}><Ionicons name={job.status === "failed" ? "alert-circle-outline" : "hourglass-outline"} size={17} color={job.status === "failed" ? colors.error : colors.gold} /><Text style={styles.jobText}>{job.status === "failed" ? (job.error_message ?? "生成未能完成") : stageLabel[job.current_stage] ?? "正在處理"}{job.review_round > 0 ? ` · 第 ${job.review_round} 輪審閱` : ""}</Text></View>}
          </View>
          <Text style={styles.listTitle}>已生成筆記</Text>
        </>}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>完成合資格篇章練習後，首份筆記會在這裡出現。</Text> : null}
        renderItem={({ item }) => <TouchableOpacity style={styles.noteCard} onPress={() => nav.navigate("CustomNoteDetail", { noteId: item.id })}><View style={styles.noteTop}><Text style={styles.noteTitle}>{item.title}</Text><Text style={[styles.badge, item.verification_status === "approved" ? styles.approved : styles.unverified]}>{item.verification_status === "approved" ? "已審核" : "未驗證"}</Text></View><Text style={styles.noteMeta}>事實 {item.fact_check_score} · 教學配對 {item.pedagogy_score}</Text><Text style={styles.noteDate}>{new Date(item.created_at).toLocaleDateString("zh-HK")}</Text></TouchableOpacity>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.md, paddingBottom: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }, eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "700" }, title: { ...typography.heading, color: colors.ink, fontSize: 22, marginTop: 2 },
  generator: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1, borderRadius: 8, padding: spacing.md, marginBottom: spacing.lg }, sectionTitle: { ...typography.subheading, color: colors.ink }, help: { color: colors.inkSoft, fontSize: 13, lineHeight: 20, marginTop: 4 }, chips: { gap: 8, paddingVertical: spacing.md }, chip: { maxWidth: 132, borderWidth: 1, borderColor: colors.hairline, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.inkSoft, fontSize: 12 }, chipTextActive: { color: colors.primaryOnDark, fontWeight: "700" }, eligibility: { fontSize: 12, marginBottom: spacing.sm }, eligible: { color: colors.success }, ineligible: { color: colors.warning }, input: { minHeight: 68, borderWidth: 1, borderColor: colors.hairline, borderRadius: 6, backgroundColor: colors.surfaceAlt, color: colors.ink, padding: 10, textAlignVertical: "top", fontSize: 13 }, generateButton: { marginTop: spacing.sm, backgroundColor: colors.primary, minHeight: 42, borderRadius: 6, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, disabledButton: { opacity: 0.45 }, generateText: { color: colors.primaryOnDark, fontWeight: "700", fontSize: 13 }, jobRow: { flexDirection: "row", gap: 7, marginTop: spacing.sm, alignItems: "center" }, jobText: { flex: 1, color: colors.inkSoft, fontSize: 12 }, listTitle: { ...typography.subheading, color: colors.ink, marginBottom: spacing.sm }, empty: { color: colors.inkMuted, textAlign: "center", paddingVertical: 30, lineHeight: 20 }, noteCard: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm }, noteTop: { flexDirection: "row", gap: 8, alignItems: "flex-start" }, noteTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "700" }, badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, fontWeight: "700", overflow: "hidden" }, approved: { backgroundColor: colors.successSoft, color: colors.success }, unverified: { backgroundColor: colors.warningSoft, color: colors.warning }, noteMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 9 }, noteDate: { color: colors.inkMuted, fontSize: 11, marginTop: 3 },
});
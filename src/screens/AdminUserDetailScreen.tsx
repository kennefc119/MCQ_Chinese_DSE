/**
 * AdminUserDetailScreen — Drilldown for a single user.
 *
 * Sections (top → bottom):
 *   1. Profile card        — read-only basics (email/username/gender/dse_year/role/created_at)
 *   2. Editable fields     — wenyuan_points (numeric) + subscription_tier toggle +
 *                            subscription_status toggle
 *   3. Performance digest  — by skill, by difficulty, by passage (bars)
 *   4. Attempt history     — paginated list of recent attempts (20 per page)
 *   5. Psychology results  — list of psych tests completed
 *
 * Route param: { userId: string }
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import Button from "../components/Button";
import ScreenHeader from "../components/ScreenHeader";
import {
  getUserProfile,
  updateUserProfile,
  fetchUserAttemptHistory,
  fetchUserPerformanceBreakdown,
  fetchUserPsychResults,
  sendDirectMessage,
} from "../lib/adminService";
import {
  Profile,
  AttemptHistoryItem,
  UserSkillStat,
  UserDifficultyStat,
  UserPassageStat,
  PsychResult,
  AnnouncementType,
} from "../types/database";
import { AppStackParamList } from "../navigation/types";
import { withTimeout } from "../lib/asyncTimeout";
import { TIMEOUT_MS } from "../lib/timeoutConfig";

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Rt = RouteProp<AppStackParamList, "AdminUserDetail">;

const PAGE_SIZE = 20;

export default function AdminUserDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable mirrors
  const [points, setPoints] = useState("0");
  const [tier, setTier] = useState<"free" | "premium">("free");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  // Sub-data
  const [skills, setSkills] = useState<UserSkillStat[]>([]);
  const [difficulties, setDifficulties] = useState<UserDifficultyStat[]>([]);
  const [passages, setPassages] = useState<UserPassageStat[]>([]);

  const [history, setHistory] = useState<AttemptHistoryItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [psych, setPsych] = useState<PsychResult[]>([]);

  // Direct message state
  const [dmTitle, setDmTitle] = useState("");
  const [dmBody, setDmBody] = useState("");
  const [dmType, setDmType] = useState<AnnouncementType>("info");
  const [dmSending, setDmSending] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const [p, perf, ps] = await withTimeout(
      Promise.all([
        getUserProfile(userId),
        fetchUserPerformanceBreakdown(userId).catch(() => ({ skills: [], difficulties: [], passages: [] })),
        fetchUserPsychResults(userId).catch(() => []),
      ]),
      TIMEOUT_MS.adminPanelLoad,
      "admin_user_detail_profile_load",
    ).catch(() => [
      null,
      { skills: [], difficulties: [], passages: [] },
      [],
    ] as [
      Profile | null,
      { skills: UserSkillStat[]; difficulties: UserDifficultyStat[]; passages: UserPassageStat[] },
      PsychResult[],
    ]);
    if (p) {
      setProfile(p);
      setPoints(String(p.wenyuan_points ?? 0));
      setTier(p.subscription_tier ?? "free");
      setStatus(p.subscription_status ?? "active");
    }
    setSkills(perf.skills);
    setDifficulties(perf.difficulties);
    setPassages(perf.passages);
    setPsych(ps);
    setLoading(false);
  }, [userId]);

  const loadMoreHistory = useCallback(async () => {
    if (!hasMore || historyLoading) return;
    setHistoryLoading(true);
    const next = await withTimeout(
      fetchUserAttemptHistory(userId, page, PAGE_SIZE).then((r) => r.items),
      TIMEOUT_MS.adminHistoryLoad,
      "admin_user_detail_history_load",
    ).catch(() => [] as AttemptHistoryItem[]);
    setHistory((prev) => [...prev, ...next]);
    if (next.length < PAGE_SIZE) setHasMore(false);
    setPage((p) => p + 1);
    setHistoryLoading(false);
  }, [userId, page, hasMore, historyLoading]);

  useEffect(() => {
    loadProfile();
    loadMoreHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onSave = async () => {
    if (!profile) return;
    const n = parseInt(points, 10);
    if (!Number.isFinite(n) || n < 0) {
      Alert.alert("分數錯誤", "請輸入非負整數");
      return;
    }
    setSaving(true);
    const res = await updateUserProfile(userId, {
      wenyuan_points: n,
      subscription_tier: tier,
      subscription_status: status,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert("儲存失敗", res.error ?? "請稍後再試");
      return;
    }
    setProfile({ ...profile, wenyuan_points: n, subscription_tier: tier, subscription_status: status });
    Alert.alert("已儲存");
  };

  const onSendDM = async () => {
    if (!dmTitle.trim() || !dmBody.trim()) {
      Alert.alert("缺少資料", "請填寫標題與內容");
      return;
    }
    Alert.alert(
      "確認發送",
      `將直接傳送訊息給 ${profile?.username || profile?.email}，並推送通知，確定嗎？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "確定發送",
          onPress: async () => {
            setDmSending(true);
            const res = await sendDirectMessage({
              target_user_id: userId,
              title: dmTitle.trim(),
              body: dmBody.trim(),
              type: dmType,
            });
            setDmSending(false);
            if (!res.ok) {
              Alert.alert("發送失敗", res.error ?? "未知錯誤");
              return;
            }
            Alert.alert("已發送", res.pushed ? "訊息已送達收件箱，推送通知已發出" : "訊息已送達收件箱（用戶無裝置 token，無法推送）");
            setDmTitle("");
            setDmBody("");
            setDmType("info");
          },
        },
      ]
    );
  };

  const summary = useMemo(() => {
    const totalAttempts = history.length;
    const avgScore =
      totalAttempts === 0
        ? 0
        : history.reduce((s, h) => s + (h.percentage ?? 0), 0) / totalAttempts;
    return { totalAttempts, avgScore };
  }, [history]);

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader title="用戶詳情" onBack={() => nav.goBack()} />
        <View style={{ padding: spacing.lg }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="用戶詳情" subtitle={profile.username || profile.email} onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        {/* Result card */}
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>成績卡</Text>
            <Text style={styles.resultSubtitle}>由文苑學員系統匯出・可分享予老師</Text>
          </View>
          <View style={styles.resultRowGrid}>
            <KV k="用戶名稱" v={profile.username || "—"} />
            <KV k="電郵" v={profile.email} />
            <KV k="性別" v={genderLabel(profile.gender)} />
            <KV k="DSE 年份" v={String(profile.dse_year)} />
            <KV k="文苑點數" v={(profile.wenyuan_points ?? 0).toLocaleString()} />
            <KV k="訂閱" v={`${profile.subscription_tier === "premium" ? "學士版" : "庶民版"} / ${profile.subscription_status === "active" ? "生效中" : "未生效"}`} />
            <KV k="身分" v={profile.role === "admin" ? "管理員" : "一般用戶"} />
            <KV k="註冊日期" v={new Date(profile.created_at).toLocaleDateString("zh-Hant")} />
          </View>
          <View style={styles.resultStatRow}>
            <Stat label="已答測驗" value={summary.totalAttempts} />
            <Stat label="平均分" value={`${summary.avgScore.toFixed(1)}%`} />
            <Stat label="心理測驗" value={psych.length} />
          </View>
        </View>

        {/* Editable section */}
        <Text style={styles.sectionTitle}>編輯欄位</Text>
        <View style={styles.card}>
          <Text style={styles.label}>文苑點數</Text>
          <TextInput value={points} onChangeText={setPoints} keyboardType="number-pad" style={styles.input} />

          <Text style={[styles.label, { marginTop: spacing.md }]}>訂閱等級</Text>
          <Toggle
            options={[{ k: "free", l: "庶民版" }, { k: "premium", l: "學士版" }]}
            value={tier}
            onChange={(v) => setTier(v as "free" | "premium")}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>訂閱狀態</Text>
          <Toggle
            options={[{ k: "active", l: "Active" }, { k: "inactive", l: "Inactive" }]}
            value={status}
            onChange={(v) => setStatus(v as "active" | "inactive")}
          />

          <Button title="儲存" icon="save-outline" onPress={onSave} loading={saving} style={{ marginTop: spacing.lg }} />
        </View>

        {/* Direct message */}
        <Text style={styles.sectionTitle}>直接發送訊息</Text>
        <View style={styles.card}>
          <Text style={styles.label}>標題</Text>
          <TextInput
            value={dmTitle}
            onChangeText={setDmTitle}
            placeholder="訊息標題"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>內容</Text>
          <TextInput
            value={dmBody}
            onChangeText={setDmBody}
            placeholder="訊息內容…"
            placeholderTextColor={colors.inkMuted}
            multiline
            style={[styles.input, styles.textarea]}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>類型</Text>
          <View style={styles.toggleRow}>
            {(["info", "success", "warning"] as AnnouncementType[]).map((t) => {
              const labels: Record<AnnouncementType, string> = { info: "資訊", success: "好消息", warning: "重要" };
              const active = t === dmType;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.togglePill, active && styles.togglePillActive]}
                  onPress={() => setDmType(t)}
                >
                  <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{labels[t]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            title="發送至收件箱 + 推送通知"
            icon="send"
            onPress={onSendDM}
            loading={dmSending}
            style={{ marginTop: spacing.lg }}
          />
        </View>

        {/* Performance breakdown */}
        <Text style={styles.sectionTitle}>表現分析</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>按技能</Text>
          {skills.length === 0 ? <Text style={styles.empty}>尚無資料</Text> : skills.map((s) => (
            <BarRow key={s.tag_id} label={s.tag_label} correct={s.correct} total={s.attempted} accuracy={s.accuracy} />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>按難度</Text>
          {difficulties.length === 0 ? <Text style={styles.empty}>尚無資料</Text> : difficulties.map((d) => (
            <BarRow key={d.difficulty} label={`難度 ${d.difficulty}`} correct={d.correct} total={d.attempted} accuracy={d.accuracy} />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>按篇章</Text>
          {passages.length === 0 ? <Text style={styles.empty}>尚無資料</Text> : passages.map((p) => (
            <BarRow key={p.passage_id} label={p.passage_title} correct={p.correct} total={p.attempted} accuracy={p.accuracy} />
          ))}
        </View>

        {/* History */}
        <Text style={styles.sectionTitle}>測驗歷史</Text>
        {historyLoading && history.length === 0 && (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
        )}
        {!historyLoading && history.length === 0 && page > 0 && (
          <Text style={styles.empty}>尚無測驗紀錄</Text>
        )}
        {history.map((h) => (
          <View key={h.attempt_id} style={styles.historyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histTitle}>{h.quiz_title}</Text>
              <Text style={styles.histSub}>{h.passage_title} ・ {new Date(h.submitted_at ?? h.started_at).toLocaleDateString("zh-Hant")}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.histScore}>{h.score}/{h.total}</Text>
              <Text style={styles.histPct}>{(h.percentage ?? 0).toFixed(0)}%</Text>
            </View>
          </View>
        ))}
        {hasMore && (
          <Button
            title={historyLoading ? "載入中…" : "載入更多"}
            variant="ghost"
            onPress={loadMoreHistory}
            loading={historyLoading}
            style={{ marginTop: spacing.sm }}
          />
        )}

        {/* Psych results */}
        <Text style={styles.sectionTitle}>心理測驗結果</Text>
        {psych.length === 0 ? (
          <Text style={styles.empty}>尚未完成任何心理測驗</Text>
        ) : psych.map((r) => (
          <View key={r.id} style={styles.psychRow}>
            <Text style={styles.psychTest}>{r.test_id}</Text>
            <Text style={styles.psychCode}>{r.result_code}</Text>
            <Text style={styles.psychDate}>{new Date(r.completed_at).toLocaleDateString("zh-Hant")}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

function genderLabel(g: string): string {
  return g === "male" ? "男" : g === "female" ? "女" : "其他";
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal} numberOfLines={1}>{v}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { k: string; l: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      {options.map((o) => {
        const active = o.k === value;
        return (
          <TouchableOpacity
            key={o.k}
            style={[styles.togglePill, active && styles.togglePillActive]}
            onPress={() => onChange(o.k)}
          >
            <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{o.l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function BarRow({ label, correct, total, accuracy }: { label: string; correct: number; total: number; accuracy: number }) {
  const pct = Math.max(0, Math.min(100, accuracy));
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelRow}>
        <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.barMeta}>{correct}/{total} ・ {pct.toFixed(0)}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { ...typography.subheading, color: colors.ink, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.body, color: colors.ink, fontWeight: "700", marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.inkMuted },
  label: { ...typography.caption, color: colors.inkSoft },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.ink,
    marginTop: spacing.xs,
    ...typography.body,
  },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  // Result card -------------------------------------------------------------
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    marginBottom: spacing.md,
  },
  resultHeader: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, paddingBottom: spacing.sm, marginBottom: spacing.sm },
  resultTitle: { ...typography.heading, color: colors.primary },
  resultSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  resultRowGrid: { flexDirection: "row", flexWrap: "wrap" },
  kv: { width: "50%", paddingVertical: 4 },
  kvKey: { ...typography.caption, color: colors.inkMuted },
  kvVal: { ...typography.body, color: colors.ink, fontWeight: "600" },
  resultStatRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  stat: { flex: 1, alignItems: "center" },
  statVal: { ...typography.heading, color: colors.ink, fontWeight: "700" },
  statLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  // Toggle ------------------------------------------------------------------
  toggleRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  togglePill: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  togglePillActive: { backgroundColor: colors.primary },
  toggleLabel: { ...typography.body, color: colors.inkSoft, fontWeight: "600" },
  toggleLabelActive: { color: colors.primaryOnDark },
  // Bars --------------------------------------------------------------------
  barRow: { marginBottom: spacing.sm },
  barLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { ...typography.body, color: colors.ink, flex: 1, marginRight: spacing.sm },
  barMeta: { ...typography.caption, color: colors.inkMuted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
  // History -----------------------------------------------------------------
  historyRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.xs,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  histTitle: { ...typography.body, color: colors.ink, fontWeight: "600" },
  histSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  histScore: { ...typography.body, color: colors.ink, fontWeight: "700" },
  histPct: { ...typography.caption, color: colors.inkMuted },
  // Psych -------------------------------------------------------------------
  psychRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  psychTest: { ...typography.body, color: colors.ink, fontWeight: "600", flex: 1 },
  psychCode: { ...typography.body, color: colors.primary, fontWeight: "700", marginRight: spacing.sm },
  psychDate: { ...typography.caption, color: colors.inkMuted },
});

/**
 * SettingsPanel — Collapsible admin settings + inventory summary.
 * Order: Save → AI limits → exempt passages → inventory overview → by passage → by difficulty → by skill
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { BarChart } from "react-native-gifted-charts";
import { colors, spacing, typography } from "../../theme";
import CollapsibleSection from "../../components/CollapsibleSection";
import {
  fetchAppSettings,
  updateAppSetting,
  fetchInventorySummary,
  refreshPeerBaselines,
  fetchPeerBaselineSnapshotStatus,
} from "../../lib/adminService";
import { listPassages } from "../../lib/dataService";
import { AppSetting, InventorySummary, Passage, AdminPeerBaselineSnapshotStatus } from "../../types/database";
import { useAuth } from "../../context/AuthContext";
import { useAppResume } from "../../hooks/useAppResume";
import { reliableLoad } from "../../lib/reliableLoad";
import { TIMEOUT_MS } from "../../lib/timeoutConfig";

const screenWidth = Dimensions.get("window").width;

export default function SettingsPanel() {
  const { user, loading: authLoading, isSupabaseReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [maxAIChatGuest, setMaxAIChatGuest] = useState("10");
  const [maxAIChatBasic, setMaxAIChatBasic] = useState("20");
  const [maxAIChatPremium, setMaxAIChatPremium] = useState("300");
  const [bonusCost, setBonusCost] = useState("100");
  const [bonusMax, setBonusMax] = useState("20");
  const [exemptPassageIds, setExemptPassageIds] = useState<Set<string>>(new Set());
  const [exploreBannerMessage, setExploreBannerMessage] = useState("");
  const [exploreBannerPause, setExploreBannerPause] = useState("2");
  const [minAppVersion, setMinAppVersion] = useState("1.0.0");
  const [refreshingBaselines, setRefreshingBaselines] = useState(false);
  const [baselineStatus, setBaselineStatus] = useState<AdminPeerBaselineSnapshotStatus | null>(null);

  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [allPassages, setAllPassages] = useState<Passage[]>([]);

  const loadData = useCallback(async () => {
    if (!isSupabaseReady) return;
    setLoading(true);
    const [settings, passages, inv, status] = await reliableLoad({
      task: () => Promise.all([
        fetchAppSettings(),
        listPassages(),
        fetchInventorySummary(),
        fetchPeerBaselineSnapshotStatus(),
      ]),
      timeoutMs: TIMEOUT_MS.adminPanelLoad,
      label: "admin_settings_load",
      fallback: [[], [], null, null] as [AppSetting[], Passage[], InventorySummary | null, AdminPeerBaselineSnapshotStatus | null],
    });
    const settingsMap: Record<string, unknown> = {};
    for (const s of settings) settingsMap[s.key] = s.value;
    if (settingsMap.max_ai_chat_guest != null) setMaxAIChatGuest(String(settingsMap.max_ai_chat_guest));
    if (settingsMap.max_ai_chat_basic != null) setMaxAIChatBasic(String(settingsMap.max_ai_chat_basic));
    if (settingsMap.max_ai_chat_premium != null) setMaxAIChatPremium(String(settingsMap.max_ai_chat_premium));
    if (settingsMap.bonus_ai_chat_cost != null) setBonusCost(String(settingsMap.bonus_ai_chat_cost));
    if (settingsMap.bonus_ai_chat_max != null) setBonusMax(String(settingsMap.bonus_ai_chat_max));
    if (Array.isArray(settingsMap.exempt_passage_ids)) setExemptPassageIds(new Set(settingsMap.exempt_passage_ids as string[]));
    if (typeof settingsMap.explore_banner_message === "string") setExploreBannerMessage(settingsMap.explore_banner_message);
    if (settingsMap.explore_banner_pause != null) setExploreBannerPause(String(settingsMap.explore_banner_pause));
    if (typeof settingsMap.min_app_version === "string") setMinAppVersion(settingsMap.min_app_version);
    setAllPassages(passages);
    setInventory(inv);
    setBaselineStatus(status ?? null);
    setLoading(false);
  }, [isSupabaseReady]);

  const handleRefreshPeerBaselines = async () => {
    Alert.alert("重算同儕基準", "將重新計算全站同儕平均與百分位，過程可能需要數十秒，是否繼續？", [
      { text: "取消", style: "cancel" },
      {
        text: "開始重算",
        style: "destructive",
        onPress: async () => {
          setRefreshingBaselines(true);
          const result = await refreshPeerBaselines();
          setRefreshingBaselines(false);
          if (!result.ok) {
            Alert.alert("重算失敗", result.error ?? "未知錯誤");
            return;
          }
          setBaselineStatus({
            generated_at: result.generated_at ?? new Date().toISOString(),
            generated_by: user?.id ?? null,
            users_counted: result.users_counted ?? 0,
            attempts_counted: result.attempts_counted ?? 0,
          });
          Alert.alert("重算完成", `用戶 ${result.users_counted ?? 0} 人，提交紀錄 ${result.attempts_counted ?? 0} 筆`);
        },
      },
    ]);
  };

  useEffect(() => {
    if (authLoading || !isSupabaseReady) return;
    void loadData();
  }, [authLoading, isSupabaseReady, loadData]);

  useFocusEffect(useCallback(() => {
    if (authLoading || !isSupabaseReady) return;
    void loadData();
  }, [authLoading, isSupabaseReady, loadData]));

  useAppResume(() => {
    void loadData();
  }, isSupabaseReady);

  const handleSave = async () => {
    Alert.alert("確認儲存", "儲存後設定將即時生效於所有用戶，確定要繼續嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "確定儲存",
        style: "destructive",
        onPress: async () => {
          const uid = user?.id;
          if (!uid) return;
          const guestN = parseInt(maxAIChatGuest, 10);
          const basicN = parseInt(maxAIChatBasic, 10);
          const premiumN = parseInt(maxAIChatPremium, 10);
          const costN = parseInt(bonusCost, 10);
          const maxN = parseInt(bonusMax, 10);
          if ([guestN, basicN, premiumN, costN, maxN].some((v) => !Number.isFinite(v) || v < 0)) {
            Alert.alert("錯誤", "所有數值請輸入非負整數");
            return;
          }
          // Validate semver format for min_app_version
          const semverRe = /^\d+\.\d+\.\d+$/;
          if (!semverRe.test(minAppVersion.trim())) {
            Alert.alert("格式錯誤", "最低版本號格式應為 x.y.z，例如 1.3.0");
            return;
          }
          setSaving(true);
          const results = await Promise.all([
            updateAppSetting("max_ai_chat_guest", guestN, uid),
            updateAppSetting("max_ai_chat_basic", basicN, uid),
            updateAppSetting("max_ai_chat_premium", premiumN, uid),
            updateAppSetting("bonus_ai_chat_cost", costN, uid),
            updateAppSetting("bonus_ai_chat_max", maxN, uid),
            updateAppSetting("exempt_passage_ids", [...exemptPassageIds], uid),
            updateAppSetting("explore_banner_message", exploreBannerMessage.trim(), uid),
            updateAppSetting("explore_banner_pause", parseInt(exploreBannerPause, 10) || 2, uid),
            updateAppSetting("min_app_version", minAppVersion.trim(), uid),
          ]);
          setSaving(false);
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) Alert.alert("部分儲存失敗", failed.map((f) => f.error).join("\n"));
          else Alert.alert("已儲存", "設定已即時生效");
        },
      },
    ]);
  };

  const toggleExempt = (passageId: string) => {
    setExemptPassageIds((prev) => {
      const next = new Set(prev);
      if (next.has(passageId)) next.delete(passageId);
      else next.add(passageId);
      return next;
    });
  };

  if (loading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const barChartWidth = Math.max(screenWidth - 80, 300);

  return (
    <View>
      {/* Save button at top for easy access */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryOnDark} />
        ) : (
          <Text style={styles.saveBtnText}>儲存設定</Text>
        )}
      </TouchableOpacity>

      {/* 1. AI Chat Limits */}
      <CollapsibleSection title="AI 顧問每月對話上限" subtitle="各等級用戶的對話次數限制">
        <Text style={styles.label}>訪客（未登入）上限</Text>
        <TextInput style={styles.input} value={maxAIChatGuest} onChangeText={setMaxAIChatGuest} keyboardType="number-pad" placeholder="10" />
        <Text style={styles.hint}>訪客每次開啟 app 的對話次數限制（非按月）</Text>

        <Text style={[styles.label, { marginTop: spacing.sm }]}>庶民版（Basic）每月上限</Text>
        <TextInput style={styles.input} value={maxAIChatBasic} onChangeText={setMaxAIChatBasic} keyboardType="number-pad" placeholder="20" />

        <Text style={[styles.label, { marginTop: spacing.sm }]}>學士版（Premium）每月上限</Text>
        <TextInput style={styles.input} value={maxAIChatPremium} onChangeText={setMaxAIChatPremium} keyboardType="number-pad" placeholder="300" />
      </CollapsibleSection>

      {/* 1b. Bonus AI Chat */}
      <CollapsibleSection title="文淵點兌換 AI 配額" subtitle="用戶以文淵點換取額外配額">
        <Text style={styles.label}>兌換比率（文淵點 / 1次額外配額）</Text>
        <TextInput style={styles.input} value={bonusCost} onChangeText={setBonusCost} keyboardType="number-pad" placeholder="100" />
        <Text style={styles.hint}>用戶需消耗多少文淵點才能兌換 1 次永久額外月度配額</Text>

        <Text style={[styles.label, { marginTop: spacing.sm }]}>額外配額上限</Text>
        <TextInput style={styles.input} value={bonusMax} onChangeText={setBonusMax} keyboardType="number-pad" placeholder="20" />
        <Text style={styles.hint}>任何用戶可累積的最大額外配額次數</Text>
      </CollapsibleSection>

      {/* 1c. Explore Banner */}
      <CollapsibleSection title="探索頁橫幅公告" subtitle={exploreBannerMessage ? "已設定" : "未設定"}>
        <Text style={styles.label}>公告文字</Text>
        <TextInput
          style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
          value={exploreBannerMessage}
          onChangeText={setExploreBannerMessage}
          placeholder="留空則不顯示橫幅"
          placeholderTextColor={colors.inkMuted}
          multiline
        />
        <Text style={styles.hint}>文字將以跑馬燈形式顯示於探索頁標題下方。留空則不顯示。</Text>

        <Text style={[styles.label, { marginTop: spacing.sm }]}>重複間隔（秒）</Text>
        <TextInput
          style={styles.input}
          value={exploreBannerPause}
          onChangeText={setExploreBannerPause}
          keyboardType="number-pad"
          placeholder="2"
        />
        <Text style={styles.hint}>每次跑馬燈播完後等待幾秒再重新播放</Text>
      </CollapsibleSection>

      {/* 1d. Force Update */}
      <CollapsibleSection title="強制更新版本控制" subtitle={`目前最低版本：${minAppVersion}`}>
        <Text style={styles.label}>最低必需版本號</Text>
        <TextInput
          style={styles.input}
          value={minAppVersion}
          onChangeText={setMinAppVersion}
          placeholder="1.0.0"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.hint}>
          住用舊於此版本的用戶將在啟動時被封鎖屏幕，強制前往 App Store / Google Play 更新。
          格式： x.y.z（例 1.3.0）。調高此值前先確認新版本已上店。
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="同儕基準快照" subtitle="手動重算雷達圖同儕平均">
        <Text style={styles.cardDesc}>DiscoverSelf 的同儕雷達 underlay 會讀取此快照，不再每次即時計算全站資料。</Text>
        <TouchableOpacity
          style={[styles.refreshBtn, refreshingBaselines && { opacity: 0.6 }]}
          onPress={handleRefreshPeerBaselines}
          disabled={refreshingBaselines}
          activeOpacity={0.8}
        >
          {refreshingBaselines ? (
            <ActivityIndicator color={colors.primaryOnDark} />
          ) : (
            <Text style={styles.refreshBtnText}>立即重算同儕基準</Text>
          )}
        </TouchableOpacity>
        <View style={styles.snapshotMetaWrap}>
          <Text style={styles.snapshotMetaText}>
            最近重算：{baselineStatus?.generated_at ? new Date(baselineStatus.generated_at).toLocaleString() : "尚未建立快照"}
          </Text>
          <Text style={styles.snapshotMetaText}>計算用戶數：{baselineStatus?.users_counted ?? 0}</Text>
          <Text style={styles.snapshotMetaText}>提交紀錄數：{baselineStatus?.attempts_counted ?? 0}</Text>
        </View>
      </CollapsibleSection>

      <CollapsibleSection title="庶民版免費開放篇章" subtitle={`已選 ${exemptPassageIds.size} 篇`}>
        <Text style={styles.cardDesc}>
          勾選篇章後，該篇章下所有測驗及考試將允許庶民版用戶免費存取。練習已預設全部免費。
        </Text>
        {allPassages.length === 0 ? (
          <Text style={styles.empty}>尚無篇章資料</Text>
        ) : (
          allPassages.map((p) => {
            const checked = exemptPassageIds.has(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.checkRow, checked && styles.checkRowActive]}
                onPress={() => toggleExempt(p.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel} numberOfLines={1}>{p.title}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </CollapsibleSection>

      {/* 3. Inventory Overview */}
      {inventory && (
        <>
          <CollapsibleSection title="題庫概況" subtitle={`${inventory.totalQuestions} 題 / ${inventory.totalExercises} 練習`}>
            <View style={styles.summaryGrid}>
              <SummaryCard label="總測驗數" value={inventory.totalQuizzes} />
              <SummaryCard label="練習數" value={inventory.totalExercises} />
              <SummaryCard label="總題目數" value={inventory.totalQuestions} />
              <SummaryCard label="啟用題目" value={inventory.activeQuestions} />
              <SummaryCard label="標記題目" value={inventory.flaggedQuestions} />
            </View>
          </CollapsibleSection>

          {/* 4. By passage */}
          <CollapsibleSection title="題庫 — 按篇章" subtitle="各篇章題目數與練習數">
            {inventory.byPassage.length === 0 ? (
              <Text style={styles.empty}>尚無資料</Text>
            ) : (
              <>
                <Text style={styles.cardDesc}>點擊柱形查看詳情</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={inventory.byPassage.map((p) => ({
                      value: p.questionCount,
                      label: p.passage_title.length > 4 ? p.passage_title.slice(0, 4) + "…" : p.passage_title,
                      frontColor: colors.primary,
                      onPress: () => Alert.alert(p.passage_title, `${p.questionCount} 題 ・ ${p.exerciseCount} 練習`),
                    }))}
                    width={Math.max(inventory.byPassage.length * 50, barChartWidth)}
                    height={180}
                    barWidth={28}
                    spacing={14}
                    noOfSections={4}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={{ ...styles.axisText, fontSize: 9 }}
                    barBorderRadius={3}
                    isAnimated
                    rulesColor={colors.hairline}
                    backgroundColor={colors.surface}
                    yAxisColor={colors.hairline}
                    xAxisColor={colors.hairline}
                  />
                </ScrollView>
                <View style={styles.legendCol}>
                  {inventory.byPassage.map((p) => (
                    <View key={p.passage_id} style={styles.legendRow}>
                      <Text style={styles.legendLabel} numberOfLines={1}>{p.passage_title}</Text>
                      <Text style={styles.legendValue}>{p.questionCount} 題 ・ {p.exerciseCount} 練習</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </CollapsibleSection>

          {/* 5. By difficulty */}
          <CollapsibleSection title="題庫 — 按難度" subtitle="各星級題目數量">
            <Text style={styles.cardDesc}>點擊柱形查看數量</Text>
            <BarChart
              data={inventory.byDifficulty.map((d) => ({
                value: d.count,
                label: `${"★".repeat(d.difficulty)}`,
                frontColor: d.difficulty <= 2 ? colors.success : d.difficulty <= 3 ? colors.gold : colors.primary,
                onPress: () => Alert.alert(`難度 ${d.difficulty}`, `${d.count} 題`),
              }))}
              width={barChartWidth}
              height={160}
              barWidth={40}
              spacing={20}
              noOfSections={4}
              yAxisTextStyle={styles.axisText}
              xAxisLabelTextStyle={styles.axisText}
              barBorderRadius={3}
              isAnimated
              rulesColor={colors.hairline}
              backgroundColor={colors.surface}
              yAxisColor={colors.hairline}
              xAxisColor={colors.hairline}
            />
          </CollapsibleSection>

          {/* 6. By skill tag */}
          <CollapsibleSection title="題庫 — 按技能標籤" subtitle={`${inventory.byTag.length} 個標籤`}>
            {inventory.byTag.length === 0 ? (
              <Text style={styles.empty}>尚無標籤</Text>
            ) : (
              <>
                <View style={styles.treemapGrid}>
                  {inventory.byTag.map((t, i) => {
                    const maxCount = inventory.byTag[0]?.count ?? 1;
                    const ratio = t.count / maxCount;
                    const blockColors = [colors.primary, colors.gold, colors.success, colors.inkSoft];
                    return (
                      <TouchableOpacity
                        key={t.tag_id}
                        style={[styles.treemapBlock, { backgroundColor: blockColors[i % blockColors.length], flex: Math.max(ratio, 0.3), minWidth: 80 }]}
                        onPress={() => Alert.alert(t.tag_label, `${t.count} 題`)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.treemapLabel} numberOfLines={1}>{t.tag_label}</Text>
                        <Text style={styles.treemapCount}>{t.count}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.legendCol}>
                  {inventory.byTag.map((t) => (
                    <View key={t.tag_id} style={styles.legendRow}>
                      <Text style={styles.legendLabel}>{t.tag_label}</Text>
                      <Text style={styles.legendValue}>{t.count} 題</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </CollapsibleSection>
        </>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryVal}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: spacing.md },
  saveBtnText: { ...typography.button, color: colors.primaryOnDark },
  refreshBtn: { backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: spacing.xs },
  refreshBtnText: { ...typography.button, color: colors.primaryOnDark },
  snapshotMetaWrap: { marginTop: spacing.sm, gap: 2 },
  snapshotMetaText: { ...typography.caption, color: colors.inkSoft },
  label: { ...typography.caption, color: colors.inkSoft },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: spacing.sm, color: colors.ink, marginTop: spacing.xs, ...typography.body },
  hint: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
  cardDesc: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.inkMuted },
  checkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: 8, marginBottom: 2 },
  checkRowActive: { backgroundColor: colors.successSoft },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.hairline, marginRight: spacing.sm, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { color: "#fff", fontWeight: "700", fontSize: 14 },
  checkLabel: { ...typography.body, color: colors.ink, flex: 1 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  summaryCard: { flex: 1, minWidth: 100, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: spacing.sm, alignItems: "center" },
  summaryVal: { ...typography.heading, color: colors.ink, fontWeight: "700", fontSize: 20 },
  summaryLabel: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  legendCol: { marginTop: spacing.sm, gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingHorizontal: spacing.xs },
  legendLabel: { ...typography.caption, color: colors.inkSoft, flex: 1 },
  legendValue: { ...typography.caption, color: colors.ink, fontWeight: "600" },
  axisText: { ...typography.caption, color: colors.inkMuted, fontSize: 10 },
  treemapGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  treemapBlock: { borderRadius: 8, padding: spacing.sm, minHeight: 60, justifyContent: "center", alignItems: "center" },
  treemapLabel: { ...typography.caption, color: "#fff", fontWeight: "600", fontSize: 11 },
  treemapCount: { ...typography.body, color: "#fff", fontWeight: "700", fontSize: 18, marginTop: 2 },
});

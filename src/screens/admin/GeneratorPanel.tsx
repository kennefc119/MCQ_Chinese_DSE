/**
 * GeneratorPanel — Trigger MCQ generation + quiz assembly via the proxy edge fn.
 *
 * Three actions:
 *   • 載入篇章/技能/統計  — refresh the dropdown options + show DB stats
 *   • 生成題目          — POST /api/generate with optional forced difficulty,
 *                          forced skill, target passage, and count
 *   • 組合測驗          — POST /api/assemble (dry-run by default)
 *
 * The backend itself does the heavy lifting (LLM calls, DB writes). This panel
 * is a thin UI wrapper that talks to the dsemcq-mcq-proxy edge function.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from "react-native";
import { colors, spacing, typography } from "../../theme";
import Button from "../../components/Button";
import {
  generatorListPassages,
  generatorListSkills,
  generatorFetchStats,
  generatorGenerate,
  generatorAssemble,
} from "../../lib/adminService";
import { withTimeout } from "../../lib/asyncTimeout";
import { TIMEOUT_MS } from "../../lib/timeoutConfig";

type Passage = { id: string; title: string; order_no: number };
type Skill = { value: string; label: string };

// Feature flag — the MCQ generator backend is not yet hosted publicly, so the
// proxy edge function would fail. Flip this to true once MCQ_GENERATOR_URL and
// MCQ_ADMIN_SECRET are configured on the dsemcq-mcq-proxy edge function.
const GENERATOR_ENABLED = false;

const DIFFICULTIES = [
  { value: null as number | null, label: "自動" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

export default function GeneratorPanel() {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const [passageId, setPassageId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [count, setCount] = useState("3");
  const [dryRun, setDryRun] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [output, setOutput] = useState<string>("");

  const refreshLookups = async () => {
    if (!GENERATOR_ENABLED) return;
    setLoading(true);
    const [p, s, st] = await withTimeout(
      Promise.all([
        generatorListPassages(),
        generatorListSkills(),
        generatorFetchStats(),
      ]),
      TIMEOUT_MS.adminPanelLoad,
      "admin_generator_refresh",
    ).catch(() => [
      { ok: false, error: "請求逾時" },
      { ok: false, error: "請求逾時" },
      { ok: false, error: "請求逾時" },
    ] as any);
    if (p.ok) setPassages(p.data);
    if (s.ok) setSkills(s.data);
    if (st.ok) setStats(st.data);
    setLoading(false);
    if (!p.ok) setOutput((o) => o + `\n[載入篇章失敗] ${p.error}`);
    if (!s.ok) setOutput((o) => o + `\n[載入技能失敗] ${s.error}`);
    if (!st.ok) setOutput((o) => o + `\n[載入統計失敗] ${st.error}`);
  };

  useEffect(() => { refreshLookups(); }, []);

  const onGenerate = async () => {
    if (!GENERATOR_ENABLED) {
      Alert.alert("功能未開啟", "出題服務尚未部署，設定完 MCQ_GENERATOR_URL 後再啟用。");
      return;
    }
    const n = parseInt(count, 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      Alert.alert("數量錯誤", "請輸入 1 至 50");
      return;
    }
    setGenerating(true);
    const res = await withTimeout(
      generatorGenerate({
        passage_id: passageId,
        forced_difficulty: difficulty,
        forced_skill: skill,
        dry_run: dryRun,
        count: n,
      }),
      TIMEOUT_MS.adminAction,
      "admin_generator_generate",
    ).catch(() => ({ ok: false, error: "請求逾時，請稍後再試" }));
    setGenerating(false);
    if (!res.ok) {
      setOutput(`[生成失敗] ${res.error}`);
      Alert.alert("生成失敗", res.error);
      return;
    }
    setOutput(JSON.stringify(res.data, null, 2));
  };

  const onAssemble = async () => {
    if (!GENERATOR_ENABLED) {
      Alert.alert("功能未開啟", "出題服務尚未部署。");
      return;
    }
    setAssembling(true);
    const res = await withTimeout(
      generatorAssemble({
        dry_run: dryRun,
        strategies: ["passage", "skill", "difficulty"],
      }),
      TIMEOUT_MS.adminAction,
      "admin_generator_assemble",
    ).catch(() => ({ ok: false, error: "請求逾時，請稍後再試" }));
    setAssembling(false);
    if (!res.ok) {
      setOutput(`[組裝失敗] ${res.error}`);
      Alert.alert("組裝失敗", res.error);
      return;
    }
    setOutput(JSON.stringify(res.data, null, 2));
  };

  return (
    <View>
      {!GENERATOR_ENABLED && (
        <View style={styles.disabledBanner}>
          <Text style={styles.disabledTitle}>出題功能暂未開啟</Text>
          <Text style={styles.disabledBody}>
            需要先部署 FastAPI 出題服務並設定 MCQ_GENERATOR_URL / MCQ_ADMIN_SECRET。
            介面仍可預覽，但不會連接后端。
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>篇章</Text>
        <Picker
          items={[{ key: "", label: "全部 / 自動" }, ...passages.map((p) => ({ key: p.id, label: `${p.order_no}. ${p.title}` }))]}
          selected={passageId ?? ""}
          onSelect={(v) => setPassageId(v === "" ? null : v)}
        />

        <Text style={[styles.label, { marginTop: spacing.md }]}>難度</Text>
        <View style={styles.row}>
          {DIFFICULTIES.map((d) => {
            const active = d.value === difficulty;
            return (
              <TouchableOpacity
                key={String(d.value)}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDifficulty(d.value)}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>技能</Text>
        <Picker
          items={[{ key: "", label: "自動" }, ...skills.map((s) => ({ key: s.value, label: s.label }))]}
          selected={skill ?? ""}
          onSelect={(v) => setSkill(v === "" ? null : v)}
        />

        <Text style={[styles.label, { marginTop: spacing.md }]}>數量</Text>
        <TextInput
          value={count}
          onChangeText={setCount}
          keyboardType="number-pad"
          style={styles.input}
        />

        <View style={[styles.row, { marginTop: spacing.md, justifyContent: "space-between" }]}>
          <Text style={styles.label}>Dry run（不寫入資料庫）</Text>
          <Switch value={dryRun} onValueChange={setDryRun} />
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title="生成題目" icon="add-circle-outline" onPress={onGenerate} loading={generating} disabled={!GENERATOR_ENABLED} style={{ flex: 1 }} />
          <Button title="組合測驗" icon="albums-outline" variant="secondary" onPress={onAssemble} loading={assembling} disabled={!GENERATOR_ENABLED} style={{ flex: 1 }} />
        </View>

        <Button
          title="重新載入篇章 / 技能 / 統計"
          variant="ghost"
          icon="refresh"
          onPress={refreshLookups}
          loading={loading}
          disabled={!GENERATOR_ENABLED}
          style={{ marginTop: spacing.sm }}
        />
      </View>

      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>資料庫統計</Text>
          <Text style={styles.codeBlock}>{JSON.stringify(stats, null, 2)}</Text>
        </View>
      )}

      {output ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>輸出</Text>
          <Text style={styles.codeBlock}>{output}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Picker({
  items,
  selected,
  onSelect,
}: {
  items: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      {items.map((it) => {
        const active = it.key === selected;
        return (
          <TouchableOpacity
            key={it.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(it.key)}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.subheading, color: colors.ink, fontWeight: "700", marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.inkSoft },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary },
  chipLabel: { ...typography.caption, color: colors.inkSoft, fontWeight: "600" },
  chipLabelActive: { color: colors.primaryOnDark },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.ink,
    marginTop: spacing.xs,
    ...typography.body,
  },
  codeBlock: {
    ...typography.caption,
    fontFamily: "Courier",
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: 8,
  },
  disabledBanner: {
    backgroundColor: colors.warningSoft,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  disabledTitle: { ...typography.bodyEmphasis, color: colors.warning, marginBottom: 4 },
  disabledBody: { ...typography.caption, color: colors.inkSoft },
});

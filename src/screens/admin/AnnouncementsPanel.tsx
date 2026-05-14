/**
 * AnnouncementsPanel — Compose and broadcast announcements.
 *
 * Form fields:
 *   • title  (required, short)
 *   • body   (required, long-form, multiline)
 *   • type   (info | warning | success) — affects the badge colour in-app
 *
 * On submit, invokes the `dsemcq-broadcast-announcement` Edge Function which:
 *   1. Inserts a row into dsemcq_announcements
 *   2. Sends an Expo push to every token in dsemcq_push_tokens
 *
 * Below the form, recent announcements are listed (most recent first).
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, RefreshControl } from "react-native";
import { colors, spacing, typography } from "../../theme";
import Button from "../../components/Button";
import { listAnnouncements, sendBroadcast } from "../../lib/adminService";
import { Announcement, AnnouncementType } from "../../types/database";

const TYPES: { key: AnnouncementType; label: string }[] = [
  { key: "info", label: "資訊" },
  { key: "success", label: "好消息" },
  { key: "warning", label: "重要" },
];

export default function AnnouncementsPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnouncementType>("info");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const list = await listAnnouncements().catch(() => []);
    setItems(list);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("缺少資料", "請填寫標題與內容");
      return;
    }
    setSubmitting(true);
    const res = await sendBroadcast({ title: title.trim(), body: body.trim(), type });
    setSubmitting(false);
    if (!res.ok) {
      Alert.alert("發送失敗", res.error ?? "未知錯誤");
      return;
    }
    Alert.alert("已發送", `已通知 ${res.recipients ?? 0} 位用戶`);
    setTitle("");
    setBody("");
    setType("info");
    load();
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>新增公告</Text>
      <View style={styles.card}>
        <Text style={styles.label}>標題</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例：新文章上線"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: spacing.md }]}>內容</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="想對所有用戶說的話…"
          placeholderTextColor={colors.inkMuted}
          multiline
          style={[styles.input, styles.textarea]}
        />

        <Text style={[styles.label, { marginTop: spacing.md }]}>類型</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => {
            const active = t.key === type;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.typePill, active && styles.typePillActive]}
                onPress={() => setType(t.key)}
              >
                <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Button
          title="發送公告 + 推送通知"
          icon="send"
          onPress={onSend}
          loading={submitting}
          style={{ marginTop: spacing.lg }}
        />
      </View>

      <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>歷史記錄</Text>
      {refreshing && <Text style={styles.note}>載入中…</Text>}
      {!refreshing && items.length === 0 && <Text style={styles.note}>尚無公告</Text>}
      {items.map((a) => (
        <View key={a.id} style={styles.card}>
          <View style={styles.histHeader}>
            <Text style={styles.histTitle}>{a.title}</Text>
            <Text style={styles.histBadge}>{labelOf(a.type)}</Text>
          </View>
          <Text style={styles.histBody}>{a.body}</Text>
          <Text style={styles.histMeta}>
            {new Date(a.sent_at).toLocaleString("zh-Hant")}
            {typeof a.recipients === "number" ? `・送達 ${a.recipients}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function labelOf(t: AnnouncementType): string {
  return TYPES.find((x) => x.key === t)?.label ?? t;
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.subheading, color: colors.ink, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  label: { ...typography.caption, color: colors.inkSoft },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.ink,
    marginTop: spacing.xs,
    ...typography.body,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  typePill: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  typePillActive: { backgroundColor: colors.primary },
  typeLabel: { ...typography.body, color: colors.inkSoft, fontWeight: "600" },
  typeLabelActive: { color: colors.primaryOnDark },
  note: { ...typography.body, color: colors.inkMuted, marginVertical: spacing.sm },
  histHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  histTitle: { ...typography.body, color: colors.ink, fontWeight: "700" },
  histBadge: {
    ...typography.caption,
    color: colors.inkSoft,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  histBody: { ...typography.body, color: colors.inkSoft, marginTop: spacing.xs },
  histMeta: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
});

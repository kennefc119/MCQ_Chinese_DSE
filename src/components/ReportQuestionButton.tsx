import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme";
import { adminFlagQuestion, userFlagQuestion } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";
import Button from "./Button";

const MAX_COMMENT_LENGTH = 50;

interface Props {
  questionId: string;
  /** Compact mode (icon-only) for use during quiz play. */
  compact?: boolean;
  /** Called after a successful flag so the parent can update its state (e.g. remove question). */
  onFlagged?: () => void;
}

export default function ReportQuestionButton({ questionId, compact, onFlagged }: Props) {
  const { user, isAdmin, isGuest } = useAuth();

  const [showModal, setShowModal] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alreadyFlagged, setAlreadyFlagged] = useState(false);

  // ── Admin flag ───────────────────────────────────────────
  const handleAdminFlag = () => {
    Alert.alert(
      "管理員停用題目",
      `確定要停用此題目嗎？\n(題目 ID: ${questionId})\n\n停用後此題將立即對所有用戶隱藏。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "確定停用",
          style: "destructive",
          onPress: async () => {
            const result = await adminFlagQuestion(questionId);
            if (result.ok) {
              Alert.alert("已停用", "此題目已被標記並停用。");
              onFlagged?.();
            } else {
              Alert.alert("錯誤", result.error ?? "操作失敗");
            }
          },
        },
      ],
    );
  };

  // ── User flag (報錯) ────────────────────────────────────
  const openReportModal = () => {
    if (isGuest) {
      Alert.alert("請先登入", "登入後才可以報告錯誤。");
      return;
    }
    setComment("");
    setShowModal(true);
  };

  const handleUserSubmit = async () => {
    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      Alert.alert("請填寫原因", "報錯時必須留下說明。");
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      Alert.alert("字數超出", `說明不能超過 ${MAX_COMMENT_LENGTH} 字。`);
      return;
    }
    setSubmitting(true);
    const result = await userFlagQuestion(questionId, trimmed);
    setSubmitting(false);
    if (result.ok) {
      setShowModal(false);
      setAlreadyFlagged(true);
      Alert.alert("已提交", "感謝你的報錯，我們會盡快處理。");
      onFlagged?.();
    } else {
      if (result.error === "你已經報錯過此題") {
        setShowModal(false);
        setAlreadyFlagged(true);
      }
      Alert.alert("提交失敗", result.error ?? "請稍後再試");
    }
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <View style={compact ? styles.compactWrap : styles.wrap}>
      {/* Admin flag button */}
      {isAdmin && (
        <TouchableOpacity
          style={compact ? styles.adminBtnCompact : styles.adminBtn}
          onPress={handleAdminFlag}
          activeOpacity={0.7}
        >
          <Icon name="flag" size="xs" color={colors.danger} style={{ marginRight: compact ? 0 : 4 }} />
          {!compact && <Text style={styles.adminBtnText}>管理員停用</Text>}
        </TouchableOpacity>
      )}

      {/* User report button */}
      {!isAdmin && (
        <TouchableOpacity
          style={[
            compact ? styles.reportBtnCompact : styles.reportBtn,
            alreadyFlagged && styles.reportBtnDisabled,
          ]}
          onPress={openReportModal}
          disabled={alreadyFlagged}
          activeOpacity={0.7}
        >
          <Icon
            name="alert-circle-outline"
            size="xs"
            color={alreadyFlagged ? colors.inkMuted : colors.warning}
            style={{ marginRight: compact ? 0 : 4 }}
          />
          {!compact && (
            <Text style={[styles.reportBtnText, alreadyFlagged && { color: colors.inkMuted }]}>
              {alreadyFlagged ? "已報錯" : "報錯"}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Report modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>報告錯誤</Text>
              <Text style={styles.modalSubtitle}>
                請說明此題的問題（必填，最多 {MAX_COMMENT_LENGTH} 字）
              </Text>

              <TextInput
                style={styles.input}
                placeholder="例：答案選項有誤 / 題目語意不清…"
                placeholderTextColor={colors.inkMuted}
                value={comment}
                onChangeText={setComment}
                maxLength={MAX_COMMENT_LENGTH}
                multiline
                autoFocus
              />

              <Text style={styles.charCount}>
                {comment.length} / {MAX_COMMENT_LENGTH}
              </Text>

              <View style={styles.modalActions}>
                <Button title="取消" variant="ghost" onPress={() => setShowModal(false)} />
                {submitting ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Button
                    title="提交報錯"
                    onPress={handleUserSubmit}
                    disabled={comment.trim().length === 0}
                  />
                )}
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactWrap: { flexDirection: "row", alignItems: "center", gap: 6 },

  // Admin button
  adminBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: colors.danger,
    backgroundColor: colors.errorSoft,
  },
  adminBtnCompact: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.errorSoft, borderWidth: 1, borderColor: colors.danger,
  },
  adminBtnText: { ...typography.micro, color: colors.danger, fontWeight: "700" },

  // User report button
  reportBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  reportBtnCompact: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning,
  },
  reportBtnDisabled: { opacity: 0.5 },
  reportBtnText: { ...typography.micro, color: colors.warning, fontWeight: "700" },

  // Modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalSafe: { width: "100%" },
  modalCard: {
    marginHorizontal: spacing.md, padding: spacing.lg,
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.hairline,
  },
  modalTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.xs },
  modalSubtitle: { ...typography.caption, color: colors.inkSoft, marginBottom: spacing.md },
  input: {
    ...typography.body, color: colors.ink,
    borderWidth: 1, borderColor: colors.hairline, borderRadius: 8,
    padding: spacing.sm, minHeight: 80, textAlignVertical: "top",
    backgroundColor: colors.background,
  },
  charCount: { ...typography.micro, color: colors.inkMuted, textAlign: "right", marginTop: 4 },
  modalActions: {
    flexDirection: "row", justifyContent: "flex-end",
    gap: spacing.sm, marginTop: spacing.md,
  },
});

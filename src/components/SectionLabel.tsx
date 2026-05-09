import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, typography } from "../theme";
import InkDivider from "./InkDivider";

// 「探索」「最近練習」 — the small label that introduces a content group.
// Set in the brand serif at a small size with wide tracking, so it reads as a
// signpost without competing with the actual content.
interface Props {
  label: string;
  /** Optional small text shown to the right of the label (e.g. "查看全部"). */
  trailing?: React.ReactNode;
  /** Render an InkDivider beneath the label for stronger section breaks. */
  divider?: boolean;
  style?: ViewStyle;
}

export default function SectionLabel({ label, trailing, divider, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {!!trailing && <View>{trailing}</View>}
      </View>
      {divider && <InkDivider style={{ marginTop: spacing.sm }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  label: { ...typography.subheading, color: colors.ink, fontWeight: "700" as const },
});

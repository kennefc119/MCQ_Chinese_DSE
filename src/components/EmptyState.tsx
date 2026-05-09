import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, typography } from "../theme";
import Icon, { IconName } from "./Icon";

interface Props {
  /** Ionicons name. Falls back to a quiet tray icon. */
  icon?: IconName;
  title: string;
  message?: string;
  subtitle?: string;
  style?: ViewStyle;
}

export default function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  subtitle,
  style,
}: Props) {
  const text = message ?? subtitle;
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size="xl" color={colors.inkMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!text && <Text style={styles.message}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  iconWrap: { opacity: 0.5, marginBottom: spacing.md },
  title: {
    ...typography.heading,
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: { ...typography.body, color: colors.inkSoft, textAlign: "center" },
});

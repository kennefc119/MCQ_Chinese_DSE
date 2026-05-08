import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, typography } from "../theme";

interface Props {
  icon?: string;
  title: string;
  message?: string;
  subtitle?: string;
  style?: ViewStyle;
}

export default function EmptyState({ icon = "📭", title, message, subtitle, style }: Props) {
  const text = message ?? subtitle;
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.icon}>{icon}</Text>
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
    padding: spacing.lg,
  },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: "center" },
  message: { ...typography.body, color: colors.textSecondary, textAlign: "center", lineHeight: 24 },
});

import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { colors, typography } from "../theme";

interface Props {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({ title, onPress, variant = "primary", loading, disabled, style }: Props) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#000" : colors.primary} />
      ) : (
        <Text style={[styles.text, variant === "primary" ? styles.textDark : styles.textLight]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center", marginVertical: 6 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.primary },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.error },
  disabled: { opacity: 0.5 },
  text: { ...typography.button },
  textDark: { color: "#1A1208" },
  textLight: { color: colors.primary },
});

import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme";
import Icon, { IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}

const TEXT_COLOUR: Record<Variant, string> = {
  primary: colors.primaryOnDark,
  secondary: colors.ink,
  ghost: colors.primary,
  danger: colors.primaryOnDark,
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const textColour = TEXT_COLOUR[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={textColour} />
      ) : (
        <View style={styles.row}>
          {!!icon && <Icon name={icon} size="sm" color={textColour} style={{ marginRight: 8 }} />}
          <Text style={[styles.text, { color: textColour }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  row: { flexDirection: "row", alignItems: "center" },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.ink },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.error },
  disabled: { opacity: 0.4 },
  text: { ...typography.button },
});

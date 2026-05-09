import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { colors, spacing, typography } from "../theme";
import Icon, { IconName } from "./Icon";

// Standard screen header. Replaces the ad-hoc <Text style={titleStyle}> patterns
// scattered across screens so every page has the same visual rhythm.
interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightIcon?: IconName;
  onRightPress?: () => void;
  style?: ViewStyle;
}

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightIcon,
  onRightPress,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.actionLeft}>
            <Icon name="chevron-back" size="md" color={colors.ink} />
          </TouchableOpacity>
        ) : (
          <View style={styles.actionLeft} />
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {rightIcon ? (
          <TouchableOpacity onPress={onRightPress} hitSlop={12} style={styles.actionRight}>
            <Icon name={rightIcon} size="md" color={colors.ink} />
          </TouchableOpacity>
        ) : (
          <View style={styles.actionRight} />
        )}
      </View>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  row: { flexDirection: "row", alignItems: "center" },
  actionLeft: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  actionRight: { width: 36, height: 36, alignItems: "flex-end", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { ...typography.heading, color: colors.ink, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.inkSoft, marginTop: spacing.xs, textAlign: "center" },
});

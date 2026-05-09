import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, fontFamilies } from "../theme";

// 印章 — the cinnabar seal motif. One or two CJK characters set in a square
// block, rounded corners, ink-on-cinnabar. Used as the brand mark, the points
// currency icon (文淵點), and as a small ornament on completion / achievement.
interface Props {
  char: string;
  size?: number;
  variant?: "filled" | "outlined";
  style?: ViewStyle;
}

export default function SealMark({ char, size = 32, variant = "filled", style }: Props) {
  const filled = variant === "filled";
  const charSize = char.length > 1 ? size * 0.42 : size * 0.62;
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: Math.max(4, size * 0.16),
          backgroundColor: filled ? colors.primary : "transparent",
          borderWidth: filled ? 0 : Math.max(1.5, size * 0.06),
          borderColor: colors.primary,
        },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: fontFamilies.serifBold,
          fontSize: charSize,
          lineHeight: charSize * 1.05,
          color: filled ? colors.primaryOnDark : colors.primary,
          letterSpacing: -0.5,
        }}
      >
        {char}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});

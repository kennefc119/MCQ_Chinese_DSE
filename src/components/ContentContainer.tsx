import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { useDeviceType, CONTENT_MAX_WIDTH } from "../hooks/useDeviceType";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * On iPad, caps content to CONTENT_MAX_WIDTH and centres it horizontally.
 * On phone, renders a transparent passthrough wrapper.
 */
export default function ContentContainer({ children, style }: Props) {
  const { isTablet } = useDeviceType();
  if (!isTablet) return <View style={[styles.passthrough, style]}>{children}</View>;
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  passthrough: { flex: 1 },
  outer: { flex: 1, alignItems: "center" },
  inner: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
});

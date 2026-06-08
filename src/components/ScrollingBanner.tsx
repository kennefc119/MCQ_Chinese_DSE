import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, StyleSheet, Easing } from "react-native";
import { colors, spacing, typography } from "../theme";

interface ScrollingBannerProps {
  message: string;
  /** Seconds to wait between each pass. Defaults to 2. */
  pauseSeconds?: number;
}

/**
 * Marquee-style scrolling banner. Text continuously loops right-to-left.
 * Renders nothing if message is empty.
 */
export default function ScrollingBanner({ message, pauseSeconds = 2 }: ScrollingBannerProps) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);

  // Every pauseSeconds, start a new scroll pass from right edge to off-screen left.
  // passDuration is tuned so the text scrolls smoothly at ~50px/s across
  // the full distance (containerW + textW) — text exits completely before restarting.
  useEffect(() => {
    if (!containerW || !textW) return;

    const totalDistance = containerW + textW;
    const passDuration = (totalDistance / 50) * 1000; // ~50 px/s

    const startPass = () => {
      scrollAnim.setValue(containerW);
      Animated.timing(scrollAnim, {
        toValue: -textW,
        duration: passDuration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    };

    startPass();
    const id = setInterval(startPass, pauseSeconds * 1000);

    return () => {
      clearInterval(id);
      scrollAnim.stopAnimation();
    };
  }, [containerW, textW, message, pauseSeconds, scrollAnim]);

  if (!message) return null;

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        setContainerW((prev) => (prev === w ? prev : w));
      }}
    >
      {/* Animated scrolling text — onTextLayout gives us the true rendered line width */}
      <Animated.Text
        style={[styles.text, { transform: [{ translateX: scrollAnim }] }]}
        numberOfLines={1}
        onTextLayout={(e: any) => {
          const lineWidth = Math.ceil(e.nativeEvent.lines?.[0]?.width ?? 0);
          if (lineWidth > 0) {
            setTextW((prev) => (prev === lineWidth ? prev : lineWidth));
          }
        }}
      >
        {message}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 32,
  },
  text: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    // Large width so the text never wraps or truncates
    width: 10000,
  },
});

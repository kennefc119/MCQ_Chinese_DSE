import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, Text } from "react-native";
import { colors, fontFamilies } from "../theme";

// The "completion" moment. A cinnabar seal stamps onto the screen — small
// scale-and-bounce, faint splash ring, brief settle. Replaces FloatingBalloons.
// One earned visual moment is more memorable than fourteen drifting emoji.
interface Props {
  /** Toggle to play the animation. */
  shown: boolean;
  /** Character(s) inside the seal. Defaults to 文 (the brand mark). */
  char?: string;
  /** Pixel size of the seal block. */
  size?: number;
  /** Position offset from the top of the parent (centred horizontally). */
  topOffset?: number;
}

export default function SealStamp({ shown, char = "文", size = 96, topOffset = 120 }: Props) {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.4)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!shown) return;
    scale.setValue(1.4);
    opacity.setValue(0);
    ringScale.setValue(0.4);
    ringOpacity.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.92,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
      ]),
      // The faint cinnabar splash — a ring that grows out and fades.
      Animated.sequence([
        Animated.delay(80),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 2.4,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(ringOpacity, { toValue: 0.35, duration: 80, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0, duration: 520, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]).start();
  }, [shown]);

  if (!shown) return null;

  const charSize = char.length > 1 ? size * 0.42 : size * 0.62;
  const radius = Math.max(6, size * 0.16);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center" }]}>
      <View style={{ marginTop: topOffset, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: radius,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.seal,
            {
              width: size,
              height: size,
              borderRadius: radius,
              opacity,
              transform: [{ scale }, { rotate: "-3deg" }],
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: fontFamilies.serifBold,
              fontSize: charSize,
              lineHeight: charSize * 1.05,
              color: colors.primaryOnDark,
              letterSpacing: -0.5,
            }}
          >
            {char}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seal: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
});

import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, useWindowDimensions } from "react-native";

const BALLOONS = ["🎈", "🎊", "🎉", "🎈", "🎊", "🎈", "🎉", "🎈", "🎊", "🎈", "🎉", "🎊", "🎈", "🎉"];

function BalloonItem({
  index,
  startX,
  screenHeight,
  emoji,
}: {
  index: number;
  startX: number;
  screenHeight: number;
  emoji: string;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.delay(index * 100),
        Animated.timing(translateY, {
          toValue: -screenHeight - 200,
          duration: 3200,
          useNativeDriver: true,
        }),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(translateX, { toValue: 18, duration: 380, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: -18, duration: 380, useNativeDriver: true }),
        ])
      ),
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.balloon,
        { left: startX, transform: [{ translateY }, { translateX }], opacity },
      ]}
    >
      <Text style={styles.balloonText}>{emoji}</Text>
    </Animated.View>
  );
}

export default function FloatingBalloons({ shown }: { shown: boolean }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const positionsRef = useRef(
    BALLOONS.map(() => Math.random() * Math.max(screenWidth - 60, 0))
  );

  if (!shown) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {positionsRef.current.map((x, i) => (
        <BalloonItem
          key={i}
          index={i}
          startX={x}
          screenHeight={screenHeight}
          emoji={BALLOONS[i % BALLOONS.length]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  balloon: { position: "absolute", bottom: 0 },
  balloonText: { fontSize: 42 },
});

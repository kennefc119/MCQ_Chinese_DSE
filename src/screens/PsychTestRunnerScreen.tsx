import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useSharedValue,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  useAnimatedStyle,
  Easing,
} from "react-native-reanimated";
import { colors, spacing, typography } from "../theme";
import { PsychTest, PsychResultMapping } from "../types/database";
import { listPsychTests, savePsychResult } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import LoadingScreen from "../components/LoadingScreen";

type Nav = NativeStackNavigationProp<AppStackParamList, "PsychTest">;
type Rt = RouteProp<AppStackParamList, "PsychTest">;

// ── FloatingBalloons ─────────────────────────────────────────────────────────

function BalloonItem({
  index,
  startX,
  screenHeight,
}: {
  index: number;
  startX: number;
  screenHeight: number;
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withDelay(
      index * 120,
      withTiming(-screenHeight - 200, { duration: 3000 })
    );
    translateX.value = withRepeat(
      withSequence(
        withTiming(15, { duration: 400 }),
        withTiming(-15, { duration: 400 })
      ),
      -1,
      true
    );
    opacity.value = withDelay(2500, withTiming(0, { duration: 500 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ position: "absolute", bottom: 0, left: startX }, animStyle]}>
      <Text style={{ fontSize: 40 }}>🎈</Text>
    </Animated.View>
  );
}

function FloatingBalloons({ shown }: { shown: boolean }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const positionsRef = useRef<number[]>(
    Array.from({ length: 8 }, () => Math.random() * Math.max(screenWidth - 50, 0))
  );

  if (!shown) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {positionsRef.current.map((x, i) => (
        <BalloonItem key={i} index={i} startX={x} screenHeight={screenHeight} />
      ))}
    </View>
  );
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({
  current,
  total,
  color,
}: {
  current: number;
  total: number;
  color: string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const barWidth = screenWidth - spacing.md * 2;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(current / total, {
      duration: 350,
      easing: Easing.out(Easing.quad),
    });
  }, [current, total]);

  const animStyle = useAnimatedStyle(() => ({
    width: progress.value * barWidth,
  }));

  return (
    <View
      style={{
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        marginHorizontal: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      <Animated.View
        style={[{ height: 6, borderRadius: 3, backgroundColor: color }, animStyle]}
      />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PsychTestRunnerScreen() {
  const nav = useNavigation<Nav>();
  const { testId } = useRoute<Rt>().params;
  const { user } = useAuth();
  const [test, setTest] = useState<PsychTest | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<{ value: number; dimension?: string }[]>([]);
  const [done, setDone] = useState<PsychResultMapping | null>(null);
  const [saving, setSaving] = useState(false);
  const [showBalloons, setShowBalloons] = useState(false);

  useEffect(() => {
    listPsychTests().then((all) => setTest(all.find((t) => t.id === testId) || null));
  }, [testId]);

  if (!test) return <LoadingScreen />;

  const accentColor = test.color_hex ?? colors.primary;

  const pickResult = (
    currentTest: PsychTest,
    selected: { value: number; dimension?: string }[]
  ): PsychResultMapping => {
    const scores = new Map<string, number>();
    selected.forEach((answer) => {
      if (!answer.dimension) return;
      scores.set(answer.dimension, (scores.get(answer.dimension) ?? 0) + answer.value);
    });

    if (scores.size > 0) {
      const [resultCode] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
      return currentTest.results.find((item) => item.code === resultCode) ?? currentTest.results[0];
    }

    const total = selected.reduce((sum, answer) => sum + answer.value, 0);
    const avg = total / Math.max(selected.length, 1);
    const fallbackIndex = Math.min(
      currentTest.results.length - 1,
      Math.max(0, Math.round(avg) - 1)
    );
    return currentTest.results[fallbackIndex] ?? currentTest.results[0];
  };

  const onAnswer = async (value: number, dimension?: string) => {
    if (saving) return;
    const next = [...answers, { value, dimension }];
    setAnswers(next);
    if (idx + 1 < test.questions.length) {
      setIdx(idx + 1);
    } else {
      const res = pickResult(test, next);
      setSaving(true);
      try {
        if (user) {
          await savePsychResult(user.id, test.id, res.code);
        }
      } finally {
        setSaving(false);
      }
      setDone(res);
      setShowBalloons(true);
    }
  };

  const handleReset = () => {
    setDone(null);
    setIdx(0);
    setAnswers([]);
    setShowBalloons(false);
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.resultBody}>
          <Text style={styles.resultEmoji}>{done.emoji}</Text>
          <Text style={styles.resultTitle}>{done.title}</Text>
          <Text style={styles.resultDesc}>{done.description}</Text>

          {(done.historical_figure || done.historical_background) && (
            <View style={styles.resultSection}>
              <Text style={styles.resultSectionTitle}>🏛️ 歷史人物介紹</Text>
              {done.historical_figure && (
                <Text style={styles.resultSectionText}>{done.historical_figure}</Text>
              )}
              {done.historical_background && (
                <Text style={styles.resultSectionText}>{done.historical_background}</Text>
              )}
            </View>
          )}

          {done.strengths && done.strengths.length > 0 && (
            <View style={styles.resultSection}>
              <Text style={styles.resultSectionTitle}>你的強項</Text>
              {done.strengths.map((s, i) => (
                <Text key={i} style={styles.resultListItem}>✅ {s}</Text>
              ))}
            </View>
          )}

          {done.weaknesses && done.weaknesses.length > 0 && (
            <View style={styles.resultSection}>
              <Text style={styles.resultSectionTitle}>需要注意</Text>
              {done.weaknesses.map((w, i) => (
                <Text key={i} style={styles.resultListItem}>⚠️ {w}</Text>
              ))}
            </View>
          )}

          {done.famous_quote && (
            <View style={[styles.resultSection, styles.quoteBox, { borderLeftColor: accentColor }]}>
              <Text style={styles.quoteText}>「{done.famous_quote}」</Text>
            </View>
          )}

          {done.study_tips && done.study_tips.length > 0 && (
            <View style={styles.resultSection}>
              <Text style={styles.resultSectionTitle}>學習小貼士</Text>
              {done.study_tips.map((tip, i) => (
                <Text key={i} style={styles.resultListItem}>💡 {tip}</Text>
              ))}
            </View>
          )}

          <View style={styles.resultButtons}>
            <TouchableOpacity
              style={[styles.resetBtn, { borderColor: accentColor }]}
              onPress={handleReset}
            >
              <Text style={[styles.resetBtnText, { color: accentColor }]}>再試一次</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: accentColor }]}
              onPress={() => nav.goBack()}
            >
              <Text style={styles.backBtnText}>返回主頁</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <FloatingBalloons shown={showBalloons} />
      </SafeAreaView>
    );
  }

  const q = test.questions[idx];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{test.title}</Text>
        <Text style={styles.progress}>{idx + 1} / {test.questions.length}</Text>
      </View>
      <ProgressBar current={idx + 1} total={test.questions.length} color={accentColor} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.qText}>{q.text}</Text>
        {q.options.map((opt, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => [styles.opt, pressed ? styles.optPressed : undefined]}
            onPress={() => onAnswer(opt.value, opt.dimension)}
            disabled={saving}
          >
            <View style={styles.optLabelWrap}>
              <Text style={styles.optLabel}>{String.fromCharCode(65 + i)}</Text>
            </View>
            <Text style={styles.optText}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: { ...typography.heading, color: colors.primary, flex: 1, marginRight: spacing.sm },
  progress: { color: colors.textSecondary, fontSize: 14 },
  body: { padding: spacing.md, paddingTop: spacing.lg },
  qText: {
    ...typography.heading,
    color: colors.textPrimary,
    lineHeight: 28,
    marginBottom: spacing.lg,
  },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optPressed: { backgroundColor: colors.surfaceAlt, borderColor: colors.primary },
  optLabelWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  optLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  optText: { color: colors.textPrimary, fontSize: 16, flex: 1, lineHeight: 22 },
  // ── Result ──────────────────────────────────────────────────────────────────
  resultBody: { padding: spacing.lg },
  resultEmoji: { fontSize: 80, textAlign: "center", marginVertical: spacing.lg },
  resultTitle: { ...typography.title, color: colors.primary, textAlign: "center", marginBottom: spacing.sm },
  resultDesc: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 26,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  resultSection: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultSectionTitle: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  resultSectionText: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 2 },
  resultListItem: { color: colors.textSecondary, fontSize: 14, lineHeight: 24, marginTop: 4 },
  quoteBox: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  quoteText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontStyle: "italic",
    lineHeight: 24,
    textAlign: "center",
  },
  resultButtons: { flexDirection: "row", gap: 12, marginTop: spacing.md },
  resetBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
  },
  resetBtnText: { fontSize: 16, fontWeight: "700" },
  backBtn: { flex: 1, padding: spacing.md, borderRadius: 12, alignItems: "center" },
  backBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

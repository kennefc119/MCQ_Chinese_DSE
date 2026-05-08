import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { PsychTest } from "../types/database";
import { listPsychTests, savePsychResult } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { AppStackParamList } from "../navigation/types";
import LoadingScreen from "../components/LoadingScreen";

type Nav = NativeStackNavigationProp<AppStackParamList, "PsychTest">;
type Rt = RouteProp<AppStackParamList, "PsychTest">;

export default function PsychTestRunnerScreen() {
  const nav = useNavigation<Nav>();
  const { testId } = useRoute<Rt>().params;
  const { user } = useAuth();
  const [test, setTest] = useState<PsychTest | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<{ value: number; dimension?: string }[]>([]);
  const [done, setDone] = useState<{ code: string; title: string; description: string; emoji: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listPsychTests().then((all) => setTest(all.find((t) => t.id === testId) || null));
  }, [testId]);

  if (!test) return <LoadingScreen />;

  const pickResult = (currentTest: PsychTest, selected: { value: number; dimension?: string }[]) => {
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
    const fallbackIndex = Math.min(currentTest.results.length - 1, Math.max(0, Math.round(avg) - 1));
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
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.resultBody}>
          <Text style={styles.resultEmoji}>{done.emoji}</Text>
          <Text style={styles.resultTitle}>{done.title}</Text>
          <Text style={styles.resultDesc}>{done.description}</Text>
          <Button title="返回" onPress={() => nav.goBack()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const q = test.questions[idx];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{test.title}</Text>
        <Text style={styles.progress}>{idx + 1} / {test.questions.length}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.qText}>{q.text}</Text>
        {q.options.map((opt, i) => (
          <TouchableOpacity key={i} style={styles.opt} onPress={() => onAnswer(opt.value, opt.dimension)} activeOpacity={0.85} disabled={saving}>
            <Text style={styles.optText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  title: { ...typography.heading, color: colors.primary },
  progress: { color: colors.textSecondary, marginTop: 4 },
  body: { padding: spacing.md },
  qText: { ...typography.heading, color: colors.textPrimary, lineHeight: 28, marginBottom: spacing.lg },
  opt: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  optText: { color: colors.textPrimary, fontSize: 16 },
  resultBody: { padding: spacing.lg, alignItems: "stretch" },
  resultEmoji: { fontSize: 80, textAlign: "center", marginVertical: spacing.lg },
  resultTitle: { ...typography.title, color: colors.primary, textAlign: "center" },
  resultDesc: { ...typography.body, color: colors.textPrimary, lineHeight: 26, textAlign: "center", marginVertical: spacing.lg },
});

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz } from "../types/database";
import { getQuiz, signUpForQuiz, startAttempt, listSignups } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import Icon, { IconName } from "../components/Icon";
import SealMark from "../components/SealMark";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList, "QuizDetail">;
type Rt = RouteProp<AppStackParamList, "QuizDetail">;

export default function QuizDetailScreen() {
  const nav = useNavigation<Nav>();
  const { quizId } = useRoute<Rt>().params;
  const { user, updateProfile, isGuest } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [signedUp, setSignedUp] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const q = await getQuiz(quizId);
      setQuiz(q);
      if (user && q) {
        const signups = await listSignups(user.id);
        setSignedUp(signups.some((s) => s.quiz_id === q.id));
      }
    })();
  }, [quizId, user]);

  if (!quiz) return (
    <SafeAreaView style={styles.safe}>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );
  const locked = quiz.min_points_required > (user?.wenyuan_points ?? 0);

  const onJoin = async () => {
    if (!user) return;
    if (isGuest) {
      Alert.alert("請先登入", "訪客模式無法作答及儲存成績。請登入或註冊以繼續。");
      return;
    }
    if (locked) {
      Alert.alert("尚未解鎖", `需要 ${quiz.min_points_required} 文淵點才能挑戰此項目`);
      return;
    }
    Alert.alert(
      `準備開始：${quiz.title}`,
      [
        `題目數　${quiz.question_ids.length} 題`,
        `時限　　${quiz.duration_seconds ? `${Math.round(quiz.duration_seconds / 60)} 分鐘` : "不限"}`,
        `次數　　${quiz.max_attempts ? `${quiz.max_attempts} 次` : "不限"}`,
        `合格　　${quiz.pass_score}%`,
        `獎勵　　${quiz.points_reward} 文淵點`,
        "",
        "作答時可前後翻頁修改答案，提交後始計分。",
      ].join("\n"),
      [
        { text: "取消", style: "cancel" },
        {
          text: "開始作答",
          onPress: async () => {
            setLoading(true);
            try {
              if (!signedUp) await signUpForQuiz(user.id, quiz.id);
              const attempt = await startAttempt(user.id, quiz);
              nav.replace("QuizRunner", { quizId: quiz.id, attemptId: attempt.id });
            } catch (err: any) {
              Alert.alert("無法開始", err?.message ?? "請稍後再試");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView>
        {quiz.cover_image_url && <Image source={{ uri: quiz.cover_image_url }} style={styles.cover} />}
        <View style={styles.body}>
          <View style={[styles.badge, { backgroundColor: QUIZ_TYPE_COLORS[quiz.type] }]}>
            <Text style={styles.badgeText}>{QUIZ_TYPE_LABEL[quiz.type]}</Text>
          </View>
          <Text style={styles.title}>{quiz.title}</Text>
          <Text style={styles.desc}>{quiz.description}</Text>

          <View style={styles.metaCard}>
            <Meta icon="document-text-outline" label="題目" value={`${quiz.question_ids.length}`} />
            <Meta icon="time-outline" label="時限" value={quiz.duration_seconds ? `${Math.round(quiz.duration_seconds / 60)} 分鐘` : "不限"} />
            <Meta icon="repeat-outline" label="次數" value={quiz.max_attempts ? `${quiz.max_attempts} 次` : "不限"} />
            <Meta icon="checkmark-circle-outline" label="合格" value={`${quiz.pass_score}%`} />
            <Meta icon="bar-chart-outline" label="難度" value={"★".repeat(quiz.difficulty)} />
            <Meta icon="ribbon-outline" label="獎勵" value={`${quiz.points_reward} 點`} />
          </View>

          {locked ? (
            <View style={styles.lockBox}>
              <View style={styles.lockTitleRow}>
                <Icon name="lock-closed-outline" size="sm" color={colors.warning} />
                <Text style={styles.lockTitle}>尚未解鎖</Text>
              </View>
              <Text style={styles.lockBody}>需累積 {quiz.min_points_required} 文淵點方可挑戰（現有 {user?.wenyuan_points ?? 0} 點）</Text>
            </View>
          ) : (
            <Button title={signedUp ? "再來一次" : "開始作答"} onPress={onJoin} loading={loading} />
          )}
          <Button title="返回" variant="ghost" onPress={() => nav.goBack()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Meta = ({ icon, label, value }: { icon: IconName; label: string; value: string }) => (
  <View style={styles.metaItem}>
    <Icon name={icon} size="md" color={colors.inkSoft} />
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  cover: { width: "100%", height: 220 },
  body: { padding: spacing.md },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: spacing.sm },
  badgeText: { color: colors.primaryOnDark, ...typography.micro, fontWeight: "700" },
  title: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
  desc: { ...typography.body, color: colors.inkSoft, lineHeight: 24, marginBottom: spacing.md },
  metaCard: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.hairline },
  metaItem: { width: "33.33%", paddingVertical: spacing.sm, alignItems: "center" },
  metaLabel: { ...typography.micro, color: colors.inkMuted, marginTop: 4 },
  metaValue: { ...typography.bodyEmphasis, color: colors.ink, marginTop: 2 },
  lockBox: { backgroundColor: colors.warningSoft, padding: spacing.md, borderRadius: 12, marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.warning },
  lockTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockTitle: { ...typography.bodyEmphasis, color: colors.warning },
  lockBody: { ...typography.caption, color: colors.inkSoft, marginTop: 4 },
});

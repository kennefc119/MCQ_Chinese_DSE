import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz } from "../types/database";
import { getQuiz, signUpForQuiz, startAttempt, listSignups } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList, "QuizDetail">;
type Rt = RouteProp<AppStackParamList, "QuizDetail">;

export default function QuizDetailScreen() {
  const nav = useNavigation<Nav>();
  const { quizId } = useRoute<Rt>().params;
  const { user, updateProfile } = useAuth();
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

  if (!quiz) return <View style={styles.safe} />;
  const locked = quiz.min_points_required > (user?.wenyuan_points ?? 0);

  const onJoin = async () => {
    if (!user) return;
    if (locked) {
      Alert.alert("尚未解鎖", `需要 ${quiz.min_points_required} 文淵點才能挑戰此項目`);
      return;
    }
    Alert.alert(
      `準備開始：${quiz.title}`,
      [
        `📝 共 ${quiz.question_ids.length} 條選擇題`,
        quiz.duration_seconds ? `⏱ 限時 ${Math.round(quiz.duration_seconds / 60)} 分鐘` : "⏱ 不限時",
        quiz.max_attempts ? `🔁 上限 ${quiz.max_attempts} 次嘗試` : "🔁 不限次數",
        `✅ 合格分數：${quiz.pass_score}%`,
        `🏆 通過可獲 ${quiz.points_reward} 文淵點`,
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
            <Meta icon="📝" label="題目數" value={`${quiz.question_ids.length}`} />
            <Meta icon="⏱" label="時限" value={quiz.duration_seconds ? `${Math.round(quiz.duration_seconds / 60)} 分鐘` : "不限"} />
            <Meta icon="🔁" label="嘗試次數" value={quiz.max_attempts ? `${quiz.max_attempts} 次` : "無限"} />
            <Meta icon="✅" label="合格" value={`${quiz.pass_score}%`} />
            <Meta icon="⭐" label="難度" value={"★".repeat(quiz.difficulty)} />
            <Meta icon="🏆" label="獎勵" value={`${quiz.points_reward} 文淵點`} />
          </View>

          {locked ? (
            <View style={styles.lockBox}>
              <Text style={styles.lockTitle}>🔒 尚未解鎖</Text>
              <Text style={styles.lockBody}>需累積 {quiz.min_points_required} 文淵點才能參加（你目前 {user?.wenyuan_points ?? 0} 點）</Text>
            </View>
          ) : (
            <Button title={signedUp ? "再次挑戰" : "加入並開始"} onPress={onJoin} loading={loading} />
          )}
          <Button title="返回" variant="ghost" onPress={() => nav.goBack()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Meta = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={styles.metaItem}>
    <Text style={styles.metaIcon}>{icon}</Text>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  cover: { width: "100%", height: 220 },
  body: { padding: spacing.md },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: spacing.sm },
  badgeText: { color: "#1A1208", fontWeight: "700" },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  desc: { ...typography.body, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.md },
  metaCard: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  metaItem: { width: "33.33%", padding: spacing.xs, alignItems: "center" },
  metaIcon: { fontSize: 22 },
  metaLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  metaValue: { color: colors.textPrimary, fontWeight: "600", marginTop: 2 },
  lockBox: { backgroundColor: colors.surfaceAlt, padding: spacing.md, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.warning },
  lockTitle: { ...typography.heading, color: colors.warning },
  lockBody: { color: colors.textSecondary, marginTop: 4 },
});

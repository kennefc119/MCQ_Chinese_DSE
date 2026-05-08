import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz, TipCard } from "../types/database";
import { listQuizzes, listTipCards, signUpForQuiz, startAttempt } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const GRID_COLS = 3;
export const GRID_GAP = 8;
export const GRID_PADDING = 12;
export const TILE_WIDTH =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
export const TILE_HEIGHT = TILE_WIDTH * 1.4;
export const FEED_IMAGE_HEIGHT = SCREEN_HEIGHT * 0.5;

export const TIP_CATEGORY_LABEL: Record<TipCard["category"], string> = {
  exam_tip: "考試貼士",
  rest: "休息",
  study: "學習法",
  wellness: "身心",
};

export type FeedItem =
  | { kind: "quiz"; data: Quiz }
  | { kind: "tip"; data: TipCard };

function interleave(quizzes: Quiz[], tips: TipCard[]): FeedItem[] {
  const out: FeedItem[] = [];
  let qi = 0;
  let ti = 0;
  while (qi < quizzes.length || ti < tips.length) {
    for (let k = 0; k < 3 && qi < quizzes.length; k++, qi++) {
      out.push({ kind: "quiz", data: quizzes[qi] });
    }
    if (ti < tips.length) {
      out.push({ kind: "tip", data: tips[ti] });
      ti++;
    }
  }
  return out;
}

function QuizTile({ item, onPress }: { item: Quiz; onPress: () => void }) {
  const { user } = useAuth();
  const locked = item.min_points_required > (user?.wenyuan_points ?? 0);
  const badgeColor = QUIZ_TYPE_COLORS[item.type] ?? colors.primary;

  return (
    <TouchableOpacity
      style={[styles.tile, { width: TILE_WIDTH, height: TILE_HEIGHT }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {item.cover_image_url ? (
        <Image source={{ uri: item.cover_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.78)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Text style={styles.badgeText}>{QUIZ_TYPE_LABEL[item.type] ?? item.type}</Text>
      </View>
      {locked && (
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={12} color={colors.ink} />
        </View>
      )}
      <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );
}

function TipTile({ item, onPress }: { item: TipCard; onPress: () => void }) {
  const label = TIP_CATEGORY_LABEL[item.category] ?? item.category;

  return (
    <TouchableOpacity
      style={[styles.tile, { width: TILE_WIDTH, height: TILE_HEIGHT }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tilePlaceholderTip]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.78)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );
}

function QuizFeedPage({ item, onClose }: { item: Quiz; onClose: () => void }) {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const locked = item.min_points_required > (user?.wenyuan_points ?? 0);
  const badgeColor = QUIZ_TYPE_COLORS[item.type] ?? colors.primary;
  const durationMins = item.duration_seconds ? Math.round(item.duration_seconds / 60) : null;
  const [loading, setLoading] = useState(false);

  const onJoin = async () => {
    if (!user) return;
    if (locked) {
      Alert.alert("尚未解鎖", `需要 ${item.min_points_required} 文淵點才能挑戰此項目`);
      return;
    }
    Alert.alert(
      `準備開始：${item.title}`,
      [
        `📝 共 ${item.question_ids.length} 條選擇題`,
        item.duration_seconds ? `⏱ 限時 ${Math.round(item.duration_seconds / 60)} 分鐘` : "⏱ 不限時",
        item.max_attempts ? `🔁 上限 ${item.max_attempts} 次嘗試` : "🔁 不限次數",
        `✅ 合格分數：${item.pass_score}%`,
        `🏆 通過可獲 ${item.points_reward} 文淵點`,
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
              onClose();
              if (!item) return;
              if (!user) return;
              // ensure signup then start attempt
              await signUpForQuiz(user.id, item.id);
              const attempt = await startAttempt(user.id, item);
              // replace to runner
              nav.replace("QuizRunner", { quizId: item.id, attemptId: attempt.id });
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
    <View style={styles.feedPage}>
      <View style={styles.feedImageWrap}>
        {item.cover_image_url ? (
          <Image source={{ uri: item.cover_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
        )}
        <LinearGradient colors={["transparent", colors.background]} style={StyleSheet.absoluteFill} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.feedInfoContent}>
        <View style={[styles.badge, { backgroundColor: badgeColor, alignSelf: "flex-start", marginBottom: spacing.sm }]}>
          <Text style={styles.badgeText}>{QUIZ_TYPE_LABEL[item.type] ?? item.type}</Text>
        </View>
        <Text style={styles.feedTitle}>{item.title}</Text>
        {item.description ? <Text style={styles.feedDesc}>{item.description}</Text> : null}
        <View style={styles.feedMeta}>
          <Text style={styles.feedMetaText}>{"★".repeat(item.difficulty)}{"☆".repeat(5 - item.difficulty)}</Text>
          {durationMins ? <Text style={styles.feedMetaText}>⏱ {durationMins} 分鐘</Text> : null}
          <Text style={styles.feedMetaText}>🏆 +{item.points_reward} 點</Text>
        </View>
        {locked ? (
          <View style={styles.feedLockPanel}>
            <Ionicons name="lock-closed" size={20} color={colors.primary} />
            <Text style={styles.feedLockText}>
              需累積 {item.min_points_required} 文淵點才能參加（你目前 {user?.wenyuan_points ?? 0} 點）
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.feedActionBtn}
            activeOpacity={0.85}
            onPress={onJoin}
            disabled={loading}
          >
            <Text style={styles.feedActionText}>{loading ? "開始中…" : "查看詳情並加入"}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function TipFeedPage({ item }: { item: TipCard }) {
  const label = TIP_CATEGORY_LABEL[item.category] ?? item.category;
  const lines = item.body.split("\n").filter(Boolean);

  return (
    <View style={styles.feedPage}>
      <View style={styles.feedImageWrap}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tilePlaceholderTip]} />
        )}
        <LinearGradient colors={["transparent", colors.background]} style={StyleSheet.absoluteFill} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.feedInfoContent}>
        <View style={[styles.badge, { backgroundColor: colors.accent, alignSelf: "flex-start", marginBottom: spacing.sm }]}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
        <Text style={styles.feedTipLabel}>學習提示卡</Text>
        <Text style={styles.feedTitle}>{item.title}</Text>
        {lines.map((line, i) => (
          <Text key={i} style={styles.feedBodyLine}>{line}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

export default function ExploreScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feedVisible, setFeedVisible] = useState(false);
  const [feedIndex, setFeedIndex] = useState(0);
  const feedRef = useRef<FlatList<FeedItem>>(null);
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    // Re-run whenever auth finishes loading (covers the session-restoration timing gap)
    if (authLoading) return;
    let mounted = true;
    const load = async () => {
      const [quizzes, tips] = await Promise.all([listQuizzes(), listTipCards()]);
      if (!mounted) return;
      setItems(interleave(quizzes, tips));
    };
    load();
    return () => {
      mounted = false;
    };
  }, [authLoading]);

  const openFeed = (index: number) => {
    setFeedIndex(index);
    setFeedVisible(true);
    setTimeout(() => {
      feedRef.current?.scrollToIndex({ index, animated: false });
    }, 60);
  };

  const closeFeed = () => setFeedVisible(false);

  const renderGridItem = ({ item, index }: { item: FeedItem; index: number }) => {
    if (item.kind === "quiz") {
      return <QuizTile item={item.data} onPress={() => openFeed(index)} />;
    }
    return <TipTile item={item.data} onPress={() => openFeed(index)} />;
  };

  const renderFeedPage = ({ item }: { item: FeedItem }) => {
    if (item.kind === "quiz") return <QuizFeedPage item={item.data} onClose={closeFeed} />;
    return <TipFeedPage item={item.data} />;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>探索</Text>
        <TouchableOpacity
          style={styles.switchBtn}
          activeOpacity={0.7}
          onPress={() => openFeed(0)}
        >
          <Text style={styles.switchBtnText}>≡</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => `${it.kind}:${it.data.id}`}
        numColumns={GRID_COLS}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderGridItem}
      />

      <Modal
        visible={feedVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeFeed}
      >
        <View style={styles.feedContainer}>
          <FlatList
            ref={feedRef}
            data={items}
            keyExtractor={(it) => `feed:${it.kind}:${it.data.id}`}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, i) => ({
              length: SCREEN_HEIGHT,
              offset: SCREEN_HEIGHT * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.y / SCREEN_HEIGHT);
              setFeedIndex(idx);
            }}
            renderItem={renderFeedPage}
          />
          {/* Overlay — pointerEvents="box-none" lets swipes pass to FlatList */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <SafeAreaView style={styles.feedOverlay} edges={["top"]} pointerEvents="box-none">
              <View style={styles.feedTopBar} pointerEvents="auto">
                <TouchableOpacity style={styles.feedBtn} activeOpacity={0.7} onPress={closeFeed}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </TouchableOpacity>
                <Text style={styles.feedCounter}>
                  {feedIndex + 1} / {items.length}
                </Text>
                <TouchableOpacity style={styles.feedBtn} activeOpacity={0.7} onPress={closeFeed}>
                  <Ionicons name="grid" size={20} color={colors.ink} />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { ...typography.title, color: colors.primary },
  switchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchBtnText: { color: colors.primary, fontSize: 22, lineHeight: 24 },
  gridContent: { padding: GRID_PADDING },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },

  // tile
  tile: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    justifyContent: "flex-end",
    padding: 6,
  },
  tilePlaceholder: { backgroundColor: colors.surfaceAlt },
  tilePlaceholderTip: { backgroundColor: "#2A1A2A" },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  lockIcon: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 14,
  },

  // feed modal
  feedContainer: { flex: 1, backgroundColor: colors.background },
  feedPage: { height: SCREEN_HEIGHT, backgroundColor: colors.background },
  feedImageWrap: { height: FEED_IMAGE_HEIGHT, overflow: "hidden" },
  feedInfoContent: { padding: spacing.md, paddingBottom: 120 },
  feedTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  feedDesc: { color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  feedMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: spacing.md },
  feedMetaText: { color: colors.textMuted, fontSize: 13 },
  feedLockPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  feedLockText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  feedActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  feedActionText: { color: colors.background, fontWeight: "700", fontSize: 16 },
  feedTipLabel: { color: colors.primary, fontSize: 12, fontWeight: "600", letterSpacing: 1, marginBottom: spacing.sm },
  feedBodyLine: { color: colors.textPrimary, lineHeight: 26, marginBottom: spacing.sm },
  feedOverlay: { flex: 1 },
  feedTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  feedBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  feedCounter: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});

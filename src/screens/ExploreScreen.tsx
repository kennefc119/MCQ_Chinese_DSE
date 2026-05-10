import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz, TipCard, Passage } from "../types/database";
import { listQuizzes, listTipCards, listPassages, signUpForQuiz, startAttempt } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import { extractSkillFromTitle, getQuizTypeSuffix } from "../lib/quizDisplayUtils";

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

/** Renders category badge + difficulty stars as a vertical column anchored top-right. */
function VerticalTileInfo({
  categoryLabel,
  categoryBgColor,
  difficulty,
  locked,
}: {
  categoryLabel: string;
  categoryBgColor: string;
  difficulty?: number;
  locked?: boolean;
}) {
  const badgeChars = categoryLabel.replace(/\s/g, "").split("").slice(0, 3);
  const stars = difficulty ?? 0;

  return (
    <View style={styles.verticalInfoWrap}>
      {locked && (
        <View style={styles.verticalLock}>
          <Ionicons name="lock-closed" size={8} color="#FFF" />
        </View>
      )}
      <View style={[styles.verticalBadge, { backgroundColor: categoryBgColor }]}>
        {badgeChars.map((c, i) => (
          <Text key={i} style={styles.verticalBadgeChar}>{c}</Text>
        ))}
      </View>
      {stars > 0 && (
        <>
          <Text style={styles.verticalDiffLabel}>難</Text>
          {Array.from({ length: stars }).map((_, i) => (
            <Text key={i} style={styles.verticalStar}>★</Text>
          ))}
          {Array.from({ length: 5 - stars }).map((_, i) => (
            <Text key={i} style={styles.verticalStarEmpty}>☆</Text>
          ))}
        </>
      )}
    </View>
  );
}

function QuizTile({ item, onPress, passageName }: { item: Quiz; onPress: () => void; passageName?: string }) {
  const { user, isGuest } = useAuth();
  const pointsLocked = item.min_points_required > (user?.wenyuan_points ?? 0);
  const tierLocked = !isGuest && !!user && user.subscription_tier !== "premium" && item.type !== "exercise";
  const locked = pointsLocked || tierLocked;
  const badgeColor = QUIZ_TYPE_COLORS[item.type] ?? colors.primary;
  const skillName = !passageName ? extractSkillFromTitle(item.title) : undefined;
  const heroText = passageName ?? skillName;

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
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Vertical title column */}
      <View style={styles.tileCenteredWrap}>
        {(heroText ?? item.title).replace(/[\s—–·\-]/g, "").split("").slice(0, 10).map((c, i) => (
          <Text key={i} style={styles.tileCenteredTitle}>{c}</Text>
        ))}
      </View>
      <VerticalTileInfo
        categoryLabel={QUIZ_TYPE_LABEL[item.type] ?? item.type}
        categoryBgColor={badgeColor}
        difficulty={item.difficulty}
        locked={locked}
      />
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
      <VerticalTileInfo
        categoryLabel={label}
        categoryBgColor={colors.accent}
      />
      {/* Vertical title column */}
      <View style={styles.tileCenteredWrap}>
        {item.title.replace(/[\s—–·\-]/g, "").split("").slice(0, 10).map((c, i) => (
          <Text key={i} style={styles.tileCenteredTitle}>{c}</Text>
        ))}
      </View>
    </TouchableOpacity>
  );
}

function QuizFeedPage({ item, onClose, passageName }: { item: Quiz; onClose: () => void; passageName?: string }) {
  const { user, isGuest } = useAuth();
  const nav = useNavigation<Nav>();
  const locked = item.min_points_required > (user?.wenyuan_points ?? 0);
  const badgeColor = QUIZ_TYPE_COLORS[item.type] ?? colors.primary;
  const durationMins = item.duration_seconds ? Math.round(item.duration_seconds / 60) : null;
  const [loading, setLoading] = useState(false);

  // Hero text: passage name OR skill name; strip it from feedTitle to avoid repetition
  const skillName = !passageName ? extractSkillFromTitle(item.title) : undefined;
  const heroText = passageName ?? skillName;
  const feedDisplayTitle = heroText ? getQuizTypeSuffix(item.title, heroText) : item.title;

  const onJoin = async () => {
    if (!user) return;
    if (isGuest) {
      Alert.alert("請先登入", "訪客模式無法作答及儲存成績。請登入或註冊以繼續。");
      return;
    }
    if (user.subscription_tier !== "premium" && item.type !== "exercise") {
      Alert.alert(
        "需要高級版",
        "測驗及考試功能僅限高級版用戶。免費版可完成所有練習題，升級即可解鎖全部內容。",
      );
      return;
    }
    if (locked) {
      Alert.alert("尚未解鎖", `需要 ${item.min_points_required} 文淵點才能挑戰此項目`);
      return;
    }
    Alert.alert(
      `準備開始：${item.title}`,
      [
        `題目數　${item.question_ids.length} 題`,
        `時限　　${item.duration_seconds ? `${Math.round(item.duration_seconds / 60)} 分鐘` : "不限"}`,
        `次數　　${item.max_attempts ? `${item.max_attempts} 次` : "不限"}`,
        `合格　　${item.pass_score}%`,
        `獎勵　　${item.points_reward} 文淵點`,
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

  const difficultyLabel = ["", "基礎", "初階", "中等", "進階", "挑戰"][item.difficulty] ?? "—";

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
        {heroText ? (
          <Text style={styles.feedPassageTitle}>{heroText}</Text>
        ) : null}
        <Text style={styles.feedTitle}>{feedDisplayTitle}</Text>
        {item.description ? <Text style={styles.feedDesc}>{item.description}</Text> : null}

        {/* Stats row */}
        <View style={styles.feedStatsRow}>
          <View style={styles.feedStatBox}>
            <Text style={styles.feedStatNum}>{item.question_ids.length}</Text>
            <Text style={styles.feedStatLabel}>題目</Text>
          </View>
          <View style={styles.feedStatBox}>
            <Text style={styles.feedStatNum}>{durationMins ?? "∞"}</Text>
            <Text style={styles.feedStatLabel}>分鐘</Text>
          </View>
          <View style={styles.feedStatBox}>
            <Text style={styles.feedStatNum}>{item.pass_score}%</Text>
            <Text style={styles.feedStatLabel}>合格線</Text>
          </View>
          <View style={styles.feedStatBox}>
            <Text style={styles.feedStatNum}>+{item.points_reward}</Text>
            <Text style={styles.feedStatLabel}>文淵點</Text>
          </View>
        </View>

        {/* Detail rows */}
        <View style={styles.feedDetailList}>
          <View style={styles.feedDetailRow}>
            <Ionicons name="bar-chart-outline" size={14} color={colors.muted} />
            <Text style={styles.feedDetailText}>
              難度：{"★".repeat(item.difficulty)}{"☆".repeat(5 - item.difficulty)}　{difficultyLabel}
            </Text>
          </View>
          <View style={styles.feedDetailRow}>
            <Ionicons name="refresh-outline" size={14} color={colors.muted} />
            <Text style={styles.feedDetailText}>
              嘗試次數：{item.max_attempts ? `最多 ${item.max_attempts} 次` : "不限"}
            </Text>
          </View>
          <View style={styles.feedDetailRow}>
            <Ionicons name="lock-open-outline" size={14} color={colors.muted} />
            <Text style={styles.feedDetailText}>
              解鎖要求：{item.min_points_required > 0 ? `${item.min_points_required} 文淵點` : "免費開放"}
            </Text>
          </View>
          {item.scheduled_start ? (
            <View style={styles.feedDetailRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.muted} />
              <Text style={styles.feedDetailText}>
                開放日期：{new Date(item.scheduled_start).toLocaleDateString("zh-HK")}
                {item.scheduled_end ? ` — ${new Date(item.scheduled_end).toLocaleDateString("zh-HK")}` : ""}
              </Text>
            </View>
          ) : null}
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
            <Text style={styles.feedActionText}>{loading ? "開始中…" : "立即參加"}</Text>
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
  const [passages, setPassages] = useState<Passage[]>([]);
  const [feedVisible, setFeedVisible] = useState(false);
  const [feedIndex, setFeedIndex] = useState(0);
  const feedRef = useRef<FlatList<FeedItem>>(null);
  const { loading: authLoading } = useAuth();

  // Filter states
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<number | null>(null);
  const [filterPassageId, setFilterPassageId] = useState<string | null>(null);
  const [filterMinPoints, setFilterMinPoints] = useState<number | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [quizzes, tips, passageList] = await Promise.all([listQuizzes(), listTipCards(), listPassages()]);
    setItems(interleave(quizzes, tips));
    setPassages(passageList);
  };

  useEffect(() => {
    if (authLoading) return;
    let mounted = true;
    const run = async () => {
      await load();
      if (!mounted) setItems([]);
    };
    run();
    return () => { mounted = false; };
  }, [authLoading]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const passageMap = useMemo(
    () => passages.reduce<Record<string, Passage>>((m, p) => ({ ...m, [p.id]: p }), {}),
    [passages],
  );

  const allFiltersCleared = filterType === "all" && filterDifficulty === null && filterPassageId === null && filterMinPoints === null;

  const filteredItems = useMemo<FeedItem[]>(() => {
    return items.filter((item) => {
      if (item.kind === "tip") return allFiltersCleared;
      const q = item.data;
      if (filterType !== "all" && q.type !== filterType) return false;
      if (filterDifficulty !== null && q.difficulty !== filterDifficulty) return false;
      if (filterPassageId !== null && (q as any).passage_id !== filterPassageId) return false;
      if (filterMinPoints !== null && q.min_points_required > filterMinPoints) return false;
      return true;
    });
  }, [items, filterType, filterDifficulty, filterPassageId, filterMinPoints, allFiltersCleared]);

  const openFeed = (indexInFiltered: number) => {
    setFeedIndex(indexInFiltered);
    setFeedVisible(true);
    setTimeout(() => {
      feedRef.current?.scrollToIndex({ index: indexInFiltered, animated: false });
    }, 60);
  };

  const closeFeed = () => setFeedVisible(false);

  const getPassageName = (passageId?: string | null): string | undefined => {
    const title = passageId ? passageMap[passageId]?.title : undefined;
    if (!title) return undefined;
    // Strip numeric prefixes like "p01 - ", "第一篇", "篇章1" etc.
    return title
      .replace(/^(p\d+|第[一二三四五六七八九十\d]+篇|篇章[一二三四五六七八九十\d]+)\s*[-—–：:·\s]*/i, "")
      .trim() || title;
  };

  const renderGridItem = ({ item, index }: { item: FeedItem; index: number }) => {
    const passageName = item.kind === "quiz" ? getPassageName((item.data as any).passage_id) : undefined;
    if (item.kind === "quiz") {
      return <QuizTile item={item.data} onPress={() => openFeed(index)} passageName={passageName} />;
    }
    return <TipTile item={item.data} onPress={() => openFeed(index)} />;
  };

  const renderFeedPage = ({ item }: { item: FeedItem }) => {
    const passageName = item.kind === "quiz" ? getPassageName((item.data as any).passage_id) : undefined;
    if (item.kind === "quiz") return <QuizFeedPage item={item.data} onClose={closeFeed} passageName={passageName} />;
    return <TipFeedPage item={item.data} />;
  };

  const typeKeys = Object.keys(QUIZ_TYPE_LABEL);
  const minPointsOptions = [null, 0, 100, 200] as const;

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

      {/* Filter row 1: type chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        <TouchableOpacity style={[styles.filterChip, filterType === "all" && styles.filterChipActive]} onPress={() => setFilterType("all")}>
          <Text style={[styles.filterChipText, filterType === "all" && styles.filterChipTextActive]}>全部</Text>
        </TouchableOpacity>
        {typeKeys.map((k) => (
          <TouchableOpacity key={k} style={[styles.filterChip, filterType === k && styles.filterChipActive, { backgroundColor: filterType === k ? (QUIZ_TYPE_COLORS[k] ?? colors.primary) : undefined }]} onPress={() => setFilterType(filterType === k ? "all" : k)}>
            <Text style={[styles.filterChipText, filterType === k && styles.filterChipTextActive]}>{QUIZ_TYPE_LABEL[k]}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.filterChip, filterExpanded && styles.filterChipActive]} onPress={() => setFilterExpanded((v) => !v)}>
          <Ionicons name={filterExpanded ? "chevron-up" : "chevron-down"} size={10} color={filterExpanded ? colors.background : colors.textSecondary} />
          <Text style={[styles.filterChipText, filterExpanded && styles.filterChipTextActive]}> 篩選</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Filter row 2: expanded difficulty / passage / min points */}
      {filterExpanded && (
        <View style={styles.filterExpanded}>
          {/* Difficulty */}
          <Text style={styles.filterLabel}>難度</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
            {[null, 1, 2, 3, 4, 5].map((d) => (
              <TouchableOpacity
                key={d ?? "all"}
                style={[styles.filterChip, filterDifficulty === d && styles.filterChipActive]}
                onPress={() => setFilterDifficulty(filterDifficulty === d ? null : d)}
              >
                <Text style={[styles.filterChipText, filterDifficulty === d && styles.filterChipTextActive]}>
                  {d === null ? "全部" : "★".repeat(d)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Passage */}
          {passages.length > 0 && (
            <>
              <Text style={styles.filterLabel}>篇章</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
                <TouchableOpacity style={[styles.filterChip, filterPassageId === null && styles.filterChipActive]} onPress={() => setFilterPassageId(null)}>
                  <Text style={[styles.filterChipText, filterPassageId === null && styles.filterChipTextActive]}>全部</Text>
                </TouchableOpacity>
                {passages.map((p) => (
                  <TouchableOpacity key={p.id} style={[styles.filterChip, filterPassageId === p.id && styles.filterChipActive]} onPress={() => setFilterPassageId(filterPassageId === p.id ? null : p.id)}>
                    <Text style={[styles.filterChipText, filterPassageId === p.id && styles.filterChipTextActive]} numberOfLines={1}>{p.title.replace(/^(p\d+|第[一二三四五六七八九十\d]+篇|篇章[一二三四五六七八九十\d]+)\s*[-—–：:·\s]*/i, "").trim() || p.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          {/* Min points unlock */}
          <Text style={styles.filterLabel}>最高解鎖要求</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
            {minPointsOptions.map((v) => (
              <TouchableOpacity
                key={v ?? "all"}
                style={[styles.filterChip, filterMinPoints === v && styles.filterChipActive]}
                onPress={() => setFilterMinPoints(filterMinPoints === v ? null : v)}
              >
                <Text style={[styles.filterChipText, filterMinPoints === v && styles.filterChipTextActive]}>
                  {v === null ? "全部" : v === 0 ? "免費" : `≤${v}點`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredItems}
        keyExtractor={(it) => `${it.kind}:${it.data.id}`}
        numColumns={GRID_COLS}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderGridItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
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
            data={filteredItems}
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
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.feedCounter}>
                  {feedIndex + 1} / {filteredItems.length}
                </Text>
                <TouchableOpacity style={styles.feedBtn} activeOpacity={0.7} onPress={closeFeed}>
                  <Ionicons name="grid" size={20} color="#FFFFFF" />
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
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tileTitleLarge: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tileStars: { color: "#F0C97A", fontSize: 10, marginTop: 2, textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  tilePassage: { color: "rgba(255,255,255,0.75)", fontSize: 9, marginTop: 1 },
  tilePassageBig: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ── vertical tile info column ──────────────────────────────────────────
  verticalInfoWrap: {
    position: "absolute",
    top: 6,
    right: 5,
    alignItems: "center",
  },
  verticalLock: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.60)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  verticalBadge: {
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  verticalBadgeChar: {
    color: "#FFFFFF",
    fontSize: 10,        // was 8 → +25%
    fontWeight: "700",
    lineHeight: 12,
    includeFontPadding: false,
  },
  verticalDivider: {
    width: 10,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.30)",
    marginVertical: 1,
  },
  verticalChar: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 11,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    includeFontPadding: false,
  },
  verticalDiffLabel: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 7,
    lineHeight: 9,
    includeFontPadding: false,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  verticalStar: {
    color: "#F0C97A",
    fontSize: 10,        // was 8 → +20% (rounded)
    lineHeight: 11,
    includeFontPadding: false,
  },
  verticalStarEmpty: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 10,        // was 8 → +20% (rounded)
    lineHeight: 11,
    includeFontPadding: false,
  },
  // ── centered card title ────────────────────────────────────────────────
  tileCenteredWrap: {
    position: "absolute",
    left: 6,
    right: 22,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
  },
  tileCenteredTitle: {
    color: "#FFFFFF",
    fontSize: 16,        // was 20 → −20%
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.80)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    includeFontPadding: false,
  },

  // feed modal
  feedContainer: { flex: 1, backgroundColor: colors.background },
  feedPage: { height: SCREEN_HEIGHT, backgroundColor: colors.background },
  feedImageWrap: { height: FEED_IMAGE_HEIGHT, overflow: "hidden" },
  feedInfoContent: { padding: spacing.md, paddingBottom: 120 },
  feedTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  feedPassageTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  feedDesc: { color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  feedMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: spacing.md },
  feedMetaText: { color: colors.textMuted, fontSize: 13 },
  feedStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.md,
  },
  feedStatBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedStatNum: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  feedStatLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  feedDetailList: { marginBottom: spacing.md, gap: 8 },
  feedDetailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  feedDetailText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
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
    marginTop: 20,
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
  feedCounter: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  // filter bar
  filterRow: { flexGrow: 0 },
  filterRowContent: { flexDirection: "row", paddingHorizontal: GRID_PADDING, paddingVertical: 4, gap: 4 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, includeFontPadding: false },
  filterChipTextActive: { color: "#FFFFFF", fontWeight: "700" },
  filterExpanded: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  filterLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "600", marginTop: 8, marginBottom: 4 },
});

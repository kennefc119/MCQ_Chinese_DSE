import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState, useMemo, useContext, createContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, QUIZ_TYPE_COLORS, QUIZ_TYPE_LABEL } from "../theme";
import { Quiz, TipCard, Passage, Attempt } from "../types/database";
import { listQuizzes, listTipCards, listPassages, signUpForQuiz, startAttempt, listUserAttempts } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import { AppStackParamList } from "../navigation/types";
import { extractSkillFromTitle, getQuizTypeSuffix, SKILL_LABELS, SkillLabel } from "../lib/quizDisplayUtils";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import ScrollingBanner from "../components/ScrollingBanner";
import { useAppResume } from "../hooks/useAppResume";

type Nav = NativeStackNavigationProp<AppStackParamList>;

export const GRID_GAP = 8;
export const GRID_PADDING = 12;

const PHONE_COLS = 3;
const TABLET_COLS = 5;
const TABLET_BREAKPOINT = 768;

const CACHE_KEY_EXPLORE_FEED = "dsemcq_cache_explore_feed_v1";
const CACHE_KEY_EXPLORE_SETTINGS = "dsemcq_cache_explore_settings_v1";

type ExploreFeedCache = {
  quizzes: Quiz[];
  tips: TipCard[];
  passages: Passage[];
  attempts: Attempt[];
  quizOrder: string[];
};

type ExploreSettingsCache = {
  exemptIds: string[];
  bannerMessage: string;
  bannerPause: number;
};

/** Compute tile + feed dimensions from current window size. */
function computeGridMetrics(width: number, height: number) {
  const cols = width >= TABLET_BREAKPOINT ? TABLET_COLS : PHONE_COLS;
  const tileWidth = (width - GRID_PADDING * 2 - GRID_GAP * (cols - 1)) / cols;
  return {
    gridCols: cols,
    tileWidth,
    tileHeight: tileWidth * 1.4,
    feedPageHeight: height,
    feedImageHeight: height * 0.5,
  };
}

/** Remove parenthetical suffixes (half-width and full-width) from a title, e.g. "(節錄)" or "（節錄）". */
function stripParens(title: string): string {
  return title.replace(/\s*[\(（][^)）]*[\)）]/g, "").trim();
}

/** Fisher-Yates in-place shuffle. */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

function orderQuizzes(quizzes: Quiz[], previousOrder: string[]): { quizzes: Quiz[]; quizOrder: string[] } {
  if (quizzes.length === 0) return { quizzes: [], quizOrder: [] };

  const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const ordered = previousOrder
    .map((id) => quizMap.get(id))
    .filter((quiz): quiz is Quiz => !!quiz);
  const seen = new Set(ordered.map((quiz) => quiz.id));
  const additions = quizzes.filter((quiz) => !seen.has(quiz.id));
  const appended = additions.length > 0 ? shuffleArray([...additions]) : [];
  const next = ordered.length > 0 || appended.length > 0
    ? [...ordered, ...appended]
    : shuffleArray([...quizzes]);

  return {
    quizzes: next,
    quizOrder: next.map((quiz) => quiz.id),
  };
}

function parseExploreSettings(rows: { key: string; value: unknown }[]): ExploreSettingsCache {
  const settings: ExploreSettingsCache = {
    exemptIds: [],
    bannerMessage: "",
    bannerPause: 2,
  };

  for (const row of rows) {
    if (row.key === "exempt_passage_ids" && Array.isArray(row.value)) {
      settings.exemptIds = row.value.filter((value): value is string => typeof value === "string");
    }
    if (row.key === "explore_banner_message" && typeof row.value === "string") {
      settings.bannerMessage = row.value;
    }
    if (row.key === "explore_banner_pause" && typeof row.value === "number") {
      settings.bannerPause = row.value;
    }
  }

  return settings;
}

const MAX_COL_CHARS = 6; // chars per vertical column before splitting to two

/** Renders a title as one or two vertical char-columns, centred in the card area. */
function TileVerticalTitle({ title }: { title: string }) {
  const chars = title.replace(/[\s—–·\-。，、！？]/g, "").split("").slice(0, 12);
  const twoCol = chars.length > MAX_COL_CHARS;
  const mid = twoCol ? Math.ceil(chars.length / 2) : chars.length;
  const col1 = chars.slice(0, mid);
  const col2 = twoCol ? chars.slice(mid) : [];

  return (
    <View style={styles.tileCenteredWrap}>
      <View style={styles.tileVertCol}>
        {col1.map((c, i) => (
          <Text key={i} style={styles.tileCenteredTitle}>{c}</Text>
        ))}
      </View>
      {col2.length > 0 && (
        <View style={styles.tileVertCol}>
          {col2.map((c, i) => (
            <Text key={i} style={styles.tileCenteredTitle}>{c}</Text>
          ))}
        </View>
      )}
    </View>
  );
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

/** Set of passage IDs exempt from premium lock for basic users. */
const ExemptContext = createContext<Set<string>>(new Set());

function QuizTile({ item, onPress, passageName, status, tileWidth, tileHeight }: { item: Quiz; onPress: () => void; passageName?: string; status?: "passed" | "failed"; tileWidth: number; tileHeight: number }) {
  const { user, isGuest } = useAuth();
  const exemptIds = useContext(ExemptContext);
  const pointsLocked = item.min_points_required > (user?.wenyuan_points ?? 0);
  const tierLocked = !isGuest && !!user && user.subscription_tier !== "premium" && item.type !== "exercise" && !(item.passage_id && exemptIds.has(item.passage_id));
  const locked = pointsLocked || tierLocked;
  const badgeColor = QUIZ_TYPE_COLORS[item.type] ?? colors.primary;
  const skillName = !passageName ? extractSkillFromTitle(item.title) : undefined;
  const heroText = passageName ?? skillName;
  const displayTitle = stripParens(heroText ?? item.title);
  const [tileImgFailed, setTileImgFailed] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.tile,
        { width: tileWidth, height: tileHeight },
        status === "failed" && styles.tileFailed,
      ]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {item.cover_image_url && !tileImgFailed ? (
        <Image
          source={{ uri: item.cover_image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          recyclingKey={item.id}
          onError={() => setTileImgFailed(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Passed overlay — greyed tint + 成功 chop */}
      {status === "passed" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.tilePassedOverlay} />
          <View style={styles.tilePassedChopWrap}>
            <Text style={styles.tilePassedChop}>成{"\n"}功</Text>
          </View>
        </View>
      )}
      {/* Vertical title (1 or 2 columns) */}
      <TileVerticalTitle title={displayTitle} />
      <VerticalTileInfo
        categoryLabel={QUIZ_TYPE_LABEL[item.type] ?? item.type}
        categoryBgColor={badgeColor}
        difficulty={item.difficulty}
        locked={locked}
      />
      {/* Variation pill — only shown when title_id is set (duplicate title exists) */}
      {item.title_id != null && (
        <View style={styles.titleIdPill}>
          <Text style={styles.titleIdPillText}>#{item.title_id}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function TipTile({ item, onPress, tileWidth, tileHeight }: { item: TipCard; onPress: () => void; tileWidth: number; tileHeight: number }) {
  const label = TIP_CATEGORY_LABEL[item.category] ?? item.category;

  return (
    <TouchableOpacity
      style={[styles.tile, { width: tileWidth, height: tileHeight }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          recyclingKey={item.id}
        />
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
      {/* Vertical title (1 or 2 columns) */}
      <TileVerticalTitle title={item.title} />
    </TouchableOpacity>
  );
}

function QuizFeedPage({ item, onClose, passageName }: { item: Quiz; onClose: () => void; passageName?: string }) {
  const { width, height } = useWindowDimensions();
  const { feedPageHeight, feedImageHeight } = computeGridMetrics(width, height);
  const { user, isGuest } = useAuth();
  const exemptIds = useContext(ExemptContext);
  const nav = useNavigation<Nav>();
  const locked = item.min_points_required > (user?.wenyuan_points ?? 0);
  const badgeColor = QUIZ_TYPE_COLORS[item.type] ?? colors.primary;
  const durationMins = item.duration_seconds ? Math.round(item.duration_seconds / 60) : null;
  const [loading, setLoading] = useState(false);
  const [tileImgFailed, setTileImgFailed] = useState(false);

  // Hero text: passage name OR skill name; strip it from feedTitle to avoid repetition
  const skillName = !passageName ? extractSkillFromTitle(item.title) : undefined;
  const heroText = passageName ?? skillName;
  const feedDisplayTitle = stripParens(heroText ? getQuizTypeSuffix(item.title, heroText) : item.title);

  const onJoin = async () => {
    if (!user) return;
    if (isGuest) {
      Alert.alert("請先登入", "訪客模式無法作答及儲存成績。請登入或註冊以繼續。");
      return;
    }
    if (user.subscription_tier !== "premium" && item.type !== "exercise" && !(item.passage_id && exemptIds.has(item.passage_id))) {
      Alert.alert(
        "需要學士版",
        "測驗及考試功能僅限學士版用戶。庶民版可完成所有練習題，升級即可解鎖全部內容。",
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
    <View style={[styles.feedPage, { height: feedPageHeight }]}>
      <View style={[styles.feedImageWrap, { height: feedImageHeight }]}>
        {item.cover_image_url && !tileImgFailed ? (
          <Image
            source={{ uri: item.cover_image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            priority="high"
            onError={() => setTileImgFailed(true)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
        )}
        <LinearGradient colors={["transparent", colors.background]} style={StyleSheet.absoluteFill} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.feedInfoContent}>
        <View style={[styles.badge, { position: "relative", top: 0, left: 0, backgroundColor: badgeColor, alignSelf: "flex-start", marginBottom: spacing.sm }]}>
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
  const { width, height } = useWindowDimensions();
  const { feedPageHeight, feedImageHeight } = computeGridMetrics(width, height);
  const label = TIP_CATEGORY_LABEL[item.category] ?? item.category;
  const lines = item.body.split("\n").filter(Boolean);

  return (
    <View style={[styles.feedPage, { height: feedPageHeight }]}>
      <View style={[styles.feedImageWrap, { height: feedImageHeight }]}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            priority="high"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tilePlaceholderTip]} />
        )}
        <LinearGradient colors={["transparent", colors.background]} style={StyleSheet.absoluteFill} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.feedInfoContent}>
        <View style={[styles.badge, { position: "relative", top: 0, left: 0, backgroundColor: colors.accent, alignSelf: "flex-start", marginBottom: spacing.sm }]}>
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { gridCols, tileWidth, tileHeight, feedPageHeight, feedImageHeight } = computeGridMetrics(screenWidth, screenHeight);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [feedVisible, setFeedVisible] = useState(false);
  const [feedIndex, setFeedIndex] = useState(0);
  const feedRef = useRef<FlatList<FeedItem>>(null);
  const { loading: authLoading, isSupabaseReady, user } = useAuth();

  // Filter states
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<number | null>(null);
  const [filterPassageId, setFilterPassageId] = useState<string | null>(null);
  const [filterMinPoints, setFilterMinPoints] = useState<number | null>(null);
  const [filterSkill, setFilterSkill] = useState<SkillLabel | null>(null);
  const [filterCompletion, setFilterCompletion] = useState<"passed" | "failed" | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exemptIds, setExemptIds] = useState<Set<string>>(new Set());
  const [bannerMessage, setBannerMessage] = useState("");
  const [bannerPause, setBannerPause] = useState(2);
  const quizOrderRef = useRef<string[]>([]);

  const applySettings = useCallback((settings: ExploreSettingsCache) => {
    setExemptIds(new Set(settings.exemptIds));
    setBannerMessage(settings.bannerMessage);
    setBannerPause(settings.bannerPause);
  }, []);

  const applyFeed = useCallback((feed: ExploreFeedCache) => {
    const ordered = orderQuizzes(feed.quizzes, feed.quizOrder);
    quizOrderRef.current = ordered.quizOrder;
    setAttempts(feed.attempts);
    setItems(interleave(ordered.quizzes, feed.tips));
    setPassages(feed.passages);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [cachedFeedRaw, cachedSettingsRaw] = await Promise.all([
          AsyncStorage.getItem(CACHE_KEY_EXPLORE_FEED),
          AsyncStorage.getItem(CACHE_KEY_EXPLORE_SETTINGS),
        ]);
        if (cancelled) return;

        if (cachedFeedRaw) {
          const cachedFeed = JSON.parse(cachedFeedRaw) as ExploreFeedCache;
          applyFeed(cachedFeed);
        }

        if (cachedSettingsRaw) {
          const cachedSettings = JSON.parse(cachedSettingsRaw) as ExploreSettingsCache;
          applySettings(cachedSettings);
        }
      } catch {
        // Cache hydration is best-effort only.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFeed, applySettings]);

  // Fetch exempt passage IDs and banner settings from app settings
  const loadAppSettings = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error } = await supabase
        .from("dsemcq_app_settings")
        .select("key, value")
        .in("key", ["exempt_passage_ids", "explore_banner_message", "explore_banner_pause"]);
      if (!error && data) {
        const settings = parseExploreSettings(data as { key: string; value: unknown }[]);
        applySettings(settings);
        AsyncStorage.setItem(CACHE_KEY_EXPLORE_SETTINGS, JSON.stringify(settings)).catch(() => {});
      }
    } catch {
      // Table may not exist yet
    }
  }, [applySettings]);

  // Re-fetch app settings every time Explore tab gains focus
  useFocusEffect(
    useCallback(() => {
      void loadAppSettings();
    }, [loadAppSettings])
  );

  const load = useCallback(async () => {
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("load_timeout")), 8000)
    );
    try {
      const [quizzes, tips, passageList, userAttempts] = await Promise.race([
        Promise.all([
          listQuizzes(),
          listTipCards(),
          listPassages(),
          user ? listUserAttempts(user.id) : Promise.resolve([]),
        ]),
        deadline,
      ]);
      const feed: ExploreFeedCache = {
        quizzes,
        tips,
        passages: passageList,
        attempts: userAttempts,
        quizOrder: quizOrderRef.current,
      };
      const ordered = orderQuizzes(quizzes, quizOrderRef.current);
      quizOrderRef.current = ordered.quizOrder;
      setAttempts(userAttempts);
      setItems(interleave(ordered.quizzes, tips));
      setPassages(passageList);
      AsyncStorage.setItem(
        CACHE_KEY_EXPLORE_FEED,
        JSON.stringify({ ...feed, quizOrder: ordered.quizOrder })
      ).catch(() => {});
    } catch {
      // Timed out or network error — keep the last rendered state.
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !isSupabaseReady) return;
    let mounted = true;
    const run = async () => {
      await load();
      if (!mounted) setItems([]);
    };
    void run();
    return () => { mounted = false; };
  }, [authLoading, isSupabaseReady, load]);

  useAppResume(() => {
    void load();
  }, isSupabaseReady);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const passageMap = useMemo(
    () => passages.reduce<Record<string, Passage>>((m, p) => ({ ...m, [p.id]: p }), {}),
    [passages],
  );

  const allFiltersCleared = filterType === "all" && filterDifficulty === null && filterPassageId === null && filterMinPoints === null && filterSkill === null && filterCompletion === null;

  // Build pass/fail status map per quiz (best attempt wins: passed beats failed)
  const quizStatusMap = useMemo<Record<string, "passed" | "failed">>(() => {
    const map: Record<string, "passed" | "failed"> = {};
    for (const a of attempts) {
      if (a.status !== "submitted" || a.score === null) continue;
      // Find the quiz to get its pass_score threshold
      const quiz = items.find((it) => it.kind === "quiz" && it.data.id === a.quiz_id);
      const passScore = quiz?.kind === "quiz" ? (quiz.data.pass_score ?? 60) : 60;
      const pct = a.total > 0 ? (a.score / a.total) * 100 : 0;
      const result: "passed" | "failed" = pct >= passScore ? "passed" : "failed";
      // "passed" takes priority over "failed"
      if (map[a.quiz_id] !== "passed") map[a.quiz_id] = result;
    }
    return map;
  }, [attempts, items]);

  const filteredItems = useMemo<FeedItem[]>(() => {
    return items.filter((item) => {
      if (item.kind === "tip") return allFiltersCleared;
      const q = item.data;
      if (filterType !== "all" && q.type !== filterType) return false;
      if (filterDifficulty !== null && q.difficulty !== filterDifficulty) return false;
      if (filterPassageId === "__cross__") {
        // Cross-passage filter: show quizzes/questions that involve multiple passages
        if (!(q as any).passage_id || !(q as any).cross_passage_id) {
          // Also check if quiz has null passage_id (legacy cross-passage quizzes)
          if ((q as any).passage_id !== null) return false;
        }
      } else if (filterPassageId !== null && (q as any).passage_id !== filterPassageId) return false;
      if (filterSkill !== null && extractSkillFromTitle(q.title) !== filterSkill) return false;
      if (filterMinPoints !== null && q.min_points_required > filterMinPoints) return false;
      if (filterCompletion !== null && quizStatusMap[q.id] !== filterCompletion) return false;
      return true;
    });
  }, [items, filterType, filterDifficulty, filterPassageId, filterSkill, filterMinPoints, filterCompletion, quizStatusMap, allFiltersCleared]);

  const openFeed = (indexInFiltered: number) => {
    setFeedIndex(indexInFiltered);
    setFeedVisible(true);
    setTimeout(() => {
      feedRef.current?.scrollToIndex({ index: indexInFiltered, animated: false });
    }, 60);
  };

  const closeFeed = () => setFeedVisible(false);

  // Horizontal swipe (left or right) anywhere on the feed dismisses the modal.
  // .failOffsetY prevents this gesture from stealing vertical scrolls from the paging FlatList.
  const swipeToCloseFeed = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-5, 5])
    .runOnJS(true)
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 500) {
        closeFeed();
      }
    });

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
      return <QuizTile item={item.data} onPress={() => openFeed(index)} passageName={passageName} status={quizStatusMap[item.data.id]} tileWidth={tileWidth} tileHeight={tileHeight} />;
    }
    return <TipTile item={item.data} onPress={() => openFeed(index)} tileWidth={tileWidth} tileHeight={tileHeight} />;
  };

  const renderFeedPage = ({ item }: { item: FeedItem }) => {
    const passageName = item.kind === "quiz" ? getPassageName((item.data as any).passage_id) : undefined;
    if (item.kind === "quiz") return <QuizFeedPage item={item.data} onClose={closeFeed} passageName={passageName} />;
    return <TipFeedPage item={item.data} />;
  };

  const typeKeys = Object.keys(QUIZ_TYPE_LABEL);
  const minPointsOptions = [null, 0, 100, 200] as const;

  return (
    <ExemptContext.Provider value={exemptIds}>
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

      {/* Scrolling announcement banner */}
      {bannerMessage ? <ScrollingBanner message={bannerMessage} pauseSeconds={bannerPause} /> : null}

      {/* Filter section: chips row + optional expanded panel */}
      <View>
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
                <TouchableOpacity style={[styles.filterChip, filterPassageId === "__cross__" && styles.filterChipActive]} onPress={() => setFilterPassageId(filterPassageId === "__cross__" ? null : "__cross__")}>
                  <Text style={[styles.filterChipText, filterPassageId === "__cross__" && styles.filterChipTextActive]}>跨篇章</Text>
                </TouchableOpacity>
              </ScrollView>
            </>
          )}
          {/* Skill */}
          <Text style={styles.filterLabel}>考核能力</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
            <TouchableOpacity style={[styles.filterChip, filterSkill === null && styles.filterChipActive]} onPress={() => setFilterSkill(null)}>
              <Text style={[styles.filterChipText, filterSkill === null && styles.filterChipTextActive]}>全部</Text>
            </TouchableOpacity>
            {SKILL_LABELS.map((sk) => (
              <TouchableOpacity
                key={sk}
                style={[styles.filterChip, filterSkill === sk && styles.filterChipActive]}
                onPress={() => setFilterSkill(filterSkill === sk ? null : sk)}
              >
                <Text style={[styles.filterChipText, filterSkill === sk && styles.filterChipTextActive]}>{sk}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
          {/* Completion status */}
          <Text style={styles.filterLabel}>完成狀態</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
            <TouchableOpacity
              style={[styles.filterChip, filterCompletion === null && styles.filterChipActive]}
              onPress={() => setFilterCompletion(null)}
            >
              <Text style={[styles.filterChipText, filterCompletion === null && styles.filterChipTextActive]}>全部</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterCompletion === "passed" && styles.filterChipActive, filterCompletion === "passed" && { backgroundColor: "rgba(220,60,60,0.75)" }]}
              onPress={() => setFilterCompletion(filterCompletion === "passed" ? null : "passed")}
            >
              <Text style={[styles.filterChipText, filterCompletion === "passed" && styles.filterChipTextActive]}>✓ 已通過</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterCompletion === "failed" && styles.filterChipActive, filterCompletion === "failed" && { backgroundColor: "rgba(180,40,40,0.55)", borderColor: "rgba(220,60,60,0.80)" }]}
              onPress={() => setFilterCompletion(filterCompletion === "failed" ? null : "failed")}
            >
              <Text style={[styles.filterChipText, filterCompletion === "failed" && styles.filterChipTextActive]}>✗ 未通過</Text>
            </TouchableOpacity>
          </ScrollView>
          </View>
        )}
      </View>

      <FlatList
        key={gridCols}
        style={{ flex: 1 }}
        data={filteredItems}
        keyExtractor={(it) => `${it.kind}:${it.data.id}`}
        numColumns={gridCols}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderGridItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        // Lazy rendering: only mount tiles near the viewport
        initialNumToRender={6}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews
      />

      <Modal
        visible={feedVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeFeed}
      >
        <GestureDetector gesture={swipeToCloseFeed}>
          <View style={styles.feedContainer}>
            <FlatList
            ref={feedRef}
            data={filteredItems}
            keyExtractor={(it) => `feed:${it.kind}:${it.data.id}`}
            snapToInterval={feedPageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, i) => ({
              length: feedPageHeight,
              offset: feedPageHeight * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.y / feedPageHeight);
              setFeedIndex(idx);
            }}
            renderItem={renderFeedPage}
            // Only keep the current page + one neighbour on each side rendered
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
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
        </GestureDetector>
      </Modal>
    </SafeAreaView>
    </ExemptContext.Provider>
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
  tileFailed: {
    borderWidth: 1.5,
    borderColor: "rgba(220, 60, 60, 0.80)",
  },
  tilePassedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18, 18, 18, 0.52)",
  },
  tilePassedChopWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tilePassedChop: {
    color: "rgba(220, 60, 60, 0.78)",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 28,
    letterSpacing: 2,
    borderWidth: 2,
    borderColor: "rgba(220, 60, 60, 0.78)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    includeFontPadding: false,
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
    flexDirection: "row",        // columns sit side-by-side
    justifyContent: "center",
    alignItems: "center",
  },
  tileVertCol: {
    flexDirection: "column",
    alignItems: "center",
    marginHorizontal: 2,
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
  feedPage: { backgroundColor: colors.background },
  feedImageWrap: { overflow: "hidden" },
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

  // variation pill
  titleIdPill: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  titleIdPillText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700" as const,
    lineHeight: 11,
    includeFontPadding: false,
  },

  // filter bar
  filterRow: { flexGrow: 0, flexShrink: 0 },
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
    paddingTop: 4,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  filterLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "600", marginTop: 8, marginBottom: 4 },
});

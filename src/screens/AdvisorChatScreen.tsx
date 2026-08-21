import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Modal, Switch, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useFocusEffect, RouteProp } from "@react-navigation/native";
import Markdown from "react-native-markdown-display";
import EmojiPicker from "rn-emoji-keyboard";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { colors, spacing, typography } from "../theme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { MainTabsParamList } from "../navigation/types";
import ContentContainer from "../components/ContentContainer";
import { withTimeout, isTimeoutError } from "../lib/asyncTimeout";
import { TIMEOUT_MS } from "../lib/timeoutConfig";
import type { AdvisorSuggestion } from "../types/database";
import { listAdvisorSuggestions, pickRandomAdvisorSuggestions } from "../lib/dataService";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  requestId?: string;
  createdAt?: string;
  waiting?: boolean;
  typing?: boolean;
}

interface AdvisorRow {
  id: string;
  request_id: string | null;
  user_text: string;
  bot_reply: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  created_at?: string | null;
}

interface AdvisorQuota {
  used: number;
  limit: number;
  remaining: number;
}

interface AdvisorV2Preferences {
  v2_opt_in: boolean;
  conversation_history_enabled: boolean;
  profile_enabled: boolean;
  performance_enabled: boolean;
  question_bank_enabled: boolean;
}

interface AdvisorV2WorkflowProgress {
  id: string;
  request_id: string;
  current_stage: string | null;
  validated_plan: unknown;
}

interface AdvisorV2AgentProgress {
  workflow_id: string;
  agent_role: string;
  status: string;
}

type ChatHistoryBubble = { role: "user" | "assistant"; text: string };

// Bot display name from .env (via app.config.ts extra.advisorBotName)
const BOT_NAME = "文淵書僮";

const INTRO_MSG: Msg = {
  id: "intro",
  role: "assistant",
  text: `在下文淵書僮，承先賢之學，伴君溫故知新。\n\n（聲明：在下乃 AI 所成，非真人也。）\n\n十二篇文言、字句句讀、應試心法、考前焦慮，皆可問來。但講一聲，便為閣下細析。`,
};

const SYSTEM_PROMPT = `你是「文淵書僮」，一位專為香港中學文憑試（DSE）中國語文科學生服務的 AI 學習助手，熟悉 12 篇指定文言文。請以繁體中文回答，語氣親切而略帶文人氣質——像一位細心的中文老師，用詞精煉、不囉嗦、不油腔滑調。可解釋詞句、分析主旨、提供溫習及應試策略、舒緩考試壓力。每次回覆控制在 200 字以內，避免過度使用條列式 bullet point，多用自然句子。如學生問及你的身分，可坦言自己是 AI 助手。`;

const DEMO_RESPONSES: Record<string, string> = {
  default: "示範模式回覆：建議你從 12 篇指定文言文逐篇精讀，先掌握全文大意，再背誦關鍵字詞與名句。每周做 1-2 份練習，配合錯題本，把握重複出錯的弱項。",
  時間: "示範模式回覆：DSE 中文科時間管理很重要！建議：閱讀理解 30 分鐘、文言文 25 分鐘、實用文 20 分鐘、檢查 5 分鐘。平日做題時用計時器訓練，模擬試切記留 5-10 分鐘檢查。",
  文言: "示範模式回覆：文言文得分關鍵在「詞義精準」+「句意通順」。建議製作字詞卡，每天背 10 個常考實詞虛詞。考試遇到陌生句子，先看上下文推斷大意，再回頭看細節。",
  壓力: "示範模式回覆：考試壓力人皆有之。試試番茄工作法（25 分鐘專注 + 5 分鐘休息），每天保持 7 小時睡眠。深呼吸練習：吸氣 4 秒、屏氣 7 秒、呼氣 8 秒，能即時平靜心情。",
};

function getDemoReply(input: string): string {
  for (const k of Object.keys(DEMO_RESPONSES)) {
    if (input.includes(k)) return DEMO_RESPONSES[k];
  }
  return DEMO_RESPONSES.default;
}

// ── Module-level persistent message store ─────────────────────────────────────
// Stored outside the component so chat history survives tab re-mounts and
// navigation from "Ask AI" buttons in result screens.
let _persistedMessages: Msg[] = [INTRO_MSG];
const _persistedMessagesByScope = new Map<string, Msg[]>();
let _modelContextScope = "";
let _modelContextMessages: Msg[] = [];

// Fallback defaults — overridden by dsemcq_app_settings when Supabase is configured
const DEFAULT_GUEST_LIMIT = 10;
const DEFAULT_FREE_MONTHLY_LIMIT = 20;
const DEFAULT_PREMIUM_MONTHLY_LIMIT = 300;
const WAITING_HINTS = [
  "正在整理你的問題…",
  "正在翻查相關資料…",
  "正在組織答案…",
];
const V2_SOURCE_HINTS: Record<string, string> = {
  profile: "正在整理你的學習背景…",
  performance: "正在分析你的答題表現…",
  question_bank: "正在查找相關題目與篇章資料…",
};
const POLL_INTERVAL_MS = 2_000;
const BOTTOM_THRESHOLD_PX = 48;
const CHAT_CACHE_PREFIX = "advisor-chat-v2";
const MODEL_CONTEXT_LIMIT = 50;
const ADVISOR_V2_DEV_ENABLED = Constants.expoConfig?.extra?.advisorV2DevEnabled === true;
const DEFAULT_V2_PREFERENCES: AdvisorV2Preferences = {
  v2_opt_in: true,
  conversation_history_enabled: true,
  profile_enabled: true,
  performance_enabled: true,
  question_bank_enabled: true,
};

function isLegacySchemaMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("request_id")
    || normalized.includes("status")
    || normalized.includes("error_message")
    || normalized.includes("processing_at")
    || normalized.includes("completed_at")
    || (normalized.includes("column") && normalized.includes("does not exist"));
}

function isAdvisorQuota(value: unknown): value is AdvisorQuota {
  if (!value || typeof value !== "object") return false;
  const quota = value as Record<string, unknown>;
  return typeof quota.used === "number"
    && typeof quota.limit === "number"
    && typeof quota.remaining === "number";
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function typingDelay(lastChar: string): number {
  if (/[。！？]/.test(lastChar)) return 10;
  if (/[，、；：]/.test(lastChar)) return 10;
  return 10;
}

function dedupeMessagesById(messages: Msg[]): Msg[] {
  const seen = new Set<string>();
  const out: Msg[] = [];
  for (const msg of messages) {
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    out.push(msg);
  }
  return out;
}

function normalizeStoredMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [INTRO_MSG];
  const parsed = raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      const role = row.role === "user" ? "user" : row.role === "assistant" ? "assistant" : null;
      if (!role || typeof row.id !== "string" || typeof row.text !== "string") return null;
      return {
        id: row.id,
        role,
        text: row.text,
        requestId: typeof row.requestId === "string" ? row.requestId : undefined,
        waiting: typeof row.waiting === "boolean" ? row.waiting : undefined,
          createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
        typing: typeof row.typing === "boolean" ? row.typing : undefined,
      } as Msg;
    })
    .filter((item): item is Msg => item !== null);

  if (!parsed.some((m) => m.id === "intro")) {
    parsed.unshift(INTRO_MSG);
  }
  return dedupeMessagesById(parsed);
}

function getPersistedMessagesForScope(scope: string): Msg[] {
  return _persistedMessagesByScope.get(scope) ?? [INTRO_MSG];
}

function setPersistedMessagesForScope(scope: string, messages: Msg[]): void {
  _persistedMessages = messages;
  _persistedMessagesByScope.set(scope, messages);
}

function isModelContextMessage(message: Msg): boolean {
  const text = message.text.trim();
  if (message.id === "intro" || message.waiting || message.typing || !text) return false;
  return !/^（(?:顧問服務異常|顧問未有返回內容|連線暫時中斷|顧問回應逾時|無回覆)/.test(text);
}

function mergeModelContextMessages(scope: string, messages: Msg[]): Msg[] {
  if (_modelContextScope !== scope) {
    _modelContextScope = scope;
    _modelContextMessages = [];
  }
  const merged = new Map<string, Msg>();
  for (const message of [..._modelContextMessages, ...messages]) {
    if (isModelContextMessage(message)) merged.set(`${message.requestId ?? message.id}:${message.role}`, message);
  }
  _modelContextMessages = [...merged.values()].slice(-MODEL_CONTEXT_LIMIT);
  return _modelContextMessages;
}

function getRecentChatHistory(messages: Msg[]): ChatHistoryBubble[] {
  return messages
    .filter(isModelContextMessage)
    .map((message) => ({ role: message.role, text: message.text }))
    .slice(-10);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getV2LoadingHint(
  workflow: AdvisorV2WorkflowProgress,
  runningSources: string[],
  hintIndex: number,
): string {
  const plan = workflow.validated_plan && typeof workflow.validated_plan === "object"
    ? workflow.validated_plan as Record<string, unknown>
    : {};
  const selectedSources = stringList(plan.selected_sources);
  const stage = workflow.current_stage;

  if (stage === "queued" || stage === "planning") return "正在理解你的問題…";
  if (stage === "synthesis") return "正在整合資料，整理答案…";
  if (stage === "parallel_branches") {
    const sources = runningSources.length > 0 ? runningSources : selectedSources;
    const source = sources.length > 0 ? sources[hintIndex % sources.length] : "";
    return V2_SOURCE_HINTS[source] ?? "正在整理相關資料…";
  }
  return "正在整理相關資料…";
}

function filterMessagesAfterCutoff(messages: Msg[], cutoff: string | null): Msg[] {
  if (!cutoff) return messages;
  return messages.filter((message) => message.id === "intro" || Boolean(message.createdAt && message.createdAt > cutoff));
}

function rowMessages(row: AdvisorRow): Msg[] {
  const createdAt = row.created_at ?? undefined;
  const messages: Msg[] = [];
  if (row.user_text?.trim()) {
    messages.push({ id: `u-${row.request_id ?? row.id}`, role: "user", text: row.user_text, requestId: row.request_id ?? undefined, createdAt });
  }
  if (row.bot_reply?.trim()) {
    messages.push({ id: `a-${row.request_id ?? row.id}`, role: "assistant", text: row.bot_reply, requestId: row.request_id ?? undefined, createdAt });
  }
  return messages;
}

export default function AdvisorChatScreen() {
  const routeParams = useRoute<RouteProp<MainTabsParamList, "Advisor">>().params;
  const { user, isGuest, signOut, updateProfile } = useAuth();
  const chatIdentity = isGuest ? "guest" : (user?.id ?? "anon");
  const useAdvisorV2 = ADVISOR_V2_DEV_ENABLED && !isGuest && Boolean(user);
  const chatScope = `${chatIdentity}:${useAdvisorV2 ? "v2" : "v1"}`;
  const storageKey = `${CHAT_CACHE_PREFIX}:visible:${chatScope}`;
  const contextStorageKey = `${CHAT_CACHE_PREFIX}:context:${chatScope}`;
  const clearMarkerKey = `${CHAT_CACHE_PREFIX}:cleared:${chatScope}`;
  const legacyStorageKey = `${CHAT_CACHE_PREFIX}:${chatIdentity}`;
  const [messages, setMessages] = useState<Msg[]>(() => {
    const initial = getPersistedMessagesForScope(chatScope);
    setPersistedMessagesForScope(chatScope, initial);
    return initial;
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthlyQuota, setMonthlyQuota] = useState<AdvisorQuota | null>(null);
  const [guestLimit, setGuestLimit] = useState(DEFAULT_GUEST_LIMIT);
  const [freeLimit, setFreeLimit] = useState(DEFAULT_FREE_MONTHLY_LIMIT);
  const [premiumLimit, setPremiumLimit] = useState(DEFAULT_PREMIUM_MONTHLY_LIMIT);
  // Bonus system
  const [bonusCost, setBonusCost] = useState(100);   // points per 1 bonus chat
  const [bonusMax, setBonusMax] = useState(20);       // max bonus any user can have
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusQty, setBonusQty] = useState(1);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [visibleSuggestions, setVisibleSuggestions] = useState<AdvisorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [v2Preferences, setV2Preferences] = useState<AdvisorV2Preferences>(DEFAULT_V2_PREFERENCES);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const isNearBottomRef = useRef(true);
  const autoSentRef = useRef<typeof routeParams>(undefined);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const pendingRequestIds = useRef(new Set<string>());
  const v2RequestIds = useRef(new Set<string>());
  const pendingSinceMs = useRef(new Map<string, number>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const v2LoadingHints = useRef(new Map<string, string>());
  const clearedAtRef = useRef<string | null>(null);
  const advisorFocusedRef = useRef(false);
  const suggestionsDismissedRef = useRef(false);
  const suggestionBankRef = useRef<AdvisorSuggestion[]>([]);
  const previousSuggestionIdsRef = useRef<string[]>([]);

  const userBonus = user?.bonus_ai_chat ?? 0;

  // Fetch chat limits + bonus config from app settings
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("dsemcq_app_settings")
          .select("key, value")
          .in("key", ["max_ai_chat_guest", "max_ai_chat_basic", "max_ai_chat_premium", "bonus_ai_chat_cost", "bonus_ai_chat_max"]);
        if (error || !data) return;
        for (const row of data as { key: string; value: unknown }[]) {
          const v = typeof row.value === "number" ? row.value : parseInt(String(row.value), 10);
          if (!Number.isFinite(v)) continue;
          if (row.key === "max_ai_chat_guest") setGuestLimit(v);
          if (row.key === "max_ai_chat_basic") setFreeLimit(v);
          if (row.key === "max_ai_chat_premium") setPremiumLimit(v);
          if (row.key === "bonus_ai_chat_cost") setBonusCost(v);
          if (row.key === "bonus_ai_chat_max") setBonusMax(v);
        }
      } catch {
        // Settings table not available — use hardcoded defaults
      }
    })();
  }, []);

  useEffect(() => {
    if (!ADVISOR_V2_DEV_ENABLED || !user || isGuest || !isSupabaseConfigured) return;
    let active = true;
    const loadPreferences = async () => {
      const { data, error } = await supabase
        .from("dsemcq_advisor_v2_user_preferences")
        .select("v2_opt_in, conversation_history_enabled, profile_enabled, performance_enabled, question_bank_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active || error) return;
      if (data) {
        const existing = data as AdvisorV2Preferences;
        const next = existing.v2_opt_in ? existing : { ...existing, v2_opt_in: true };
        if (!existing.v2_opt_in) {
          const { error: enableError } = await supabase
            .from("dsemcq_advisor_v2_user_preferences")
            .update({ v2_opt_in: true, updated_at: new Date().toISOString() })
            .eq("user_id", user.id);
          if (enableError) return;
        }
        setV2Preferences(next);
        return;
      }
      const { error: createError } = await supabase
        .from("dsemcq_advisor_v2_user_preferences")
        .upsert({ user_id: user.id, ...DEFAULT_V2_PREFERENCES, updated_at: new Date().toISOString() });
      if (!active || createError) return;
      setV2Preferences(DEFAULT_V2_PREFERENCES);
    };
    void loadPreferences();
    return () => { active = false; };
  }, [isGuest, user]);

  const updateV2Preference = async (patch: Partial<AdvisorV2Preferences>) => {
    if (!user || isGuest || !ADVISOR_V2_DEV_ENABLED) return;
    const next = { ...v2Preferences, ...patch };
    setV2Preferences(next);
    const { error } = await supabase.from("dsemcq_advisor_v2_user_preferences").upsert({
      user_id: user.id,
      ...next,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setV2Preferences(v2Preferences);
      Alert.alert("設定未能儲存", "請稍後再試。");
    }
  };

  // Fetch this month's message count for logged-in users
  const fetchMonthlyUsed = useCallback(async () => {
    if (!user || isGuest || !isSupabaseConfigured) return;
    const functionName = useAdvisorV2 ? "dsemcq-advisor-v2-start" : "dsemcq-advisor-chat";
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { quotaOnly: true },
    });
    const response = data as { quota?: unknown; error?: string } | null;
    if (error || response?.error || !isAdvisorQuota(response?.quota)) {
      console.log("[AdvisorChat] quota load error:", response?.error ?? error?.message ?? "Invalid quota response");
      return;
    }
    setMonthlyQuota(response.quota);
  }, [user, isGuest, useAdvisorV2]);

  useEffect(() => { fetchMonthlyUsed(); }, [fetchMonthlyUsed]);

  const showRandomSuggestions = useCallback((suggestions: AdvisorSuggestion[]) => {
    const selected = pickRandomAdvisorSuggestions(suggestions, 2, previousSuggestionIdsRef.current);
    previousSuggestionIdsRef.current = selected.map((suggestion) => suggestion.id);
    setVisibleSuggestions(selected);
    setShowSuggestions(selected.length === 2);
  }, []);

  useEffect(() => {
    let active = true;
    void listAdvisorSuggestions().then((suggestions) => {
      if (!active) return;
      suggestionBankRef.current = suggestions;
      if (
        advisorFocusedRef.current
        && !suggestionsDismissedRef.current
        && !routeParams?.initialMessage
      ) {
        showRandomSuggestions(suggestions);
      }
    });
    return () => { active = false; };
  }, [routeParams, showRandomSuggestions]);

  // Keep persisted store in sync whenever messages change
  const updateMessages = (updater: (prev: Msg[]) => Msg[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      setPersistedMessagesForScope(chatScope, next);
      mergeModelContextMessages(chatScope, next);
      return next;
    });
  };

  const scrollToLatest = useCallback((animated = true) => {
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 0);
  }, []);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const isNearBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    if (isNearBottomRef.current === isNearBottom) return;
    isNearBottomRef.current = isNearBottom;
    setShowJumpToLatest(!isNearBottom);
  }, []);

  const followLatestContent = useCallback(() => {
    if (isNearBottomRef.current) scrollToLatest(false);
  }, [scrollToLatest]);

  useFocusEffect(useCallback(() => {
    advisorFocusedRef.current = true;
    suggestionsDismissedRef.current = false;
    const hasPendingInitialMessage = Boolean(routeParams?.initialMessage && routeParams !== autoSentRef.current);
    if (hasPendingInitialMessage) {
      setVisibleSuggestions([]);
      setShowSuggestions(false);
    } else {
      showRandomSuggestions(suggestionBankRef.current);
    }
    scrollToLatest(false);

    return () => {
      advisorFocusedRef.current = false;
      setVisibleSuggestions([]);
      setShowSuggestions(false);
    };
  }, [routeParams, scrollToLatest, showRandomSuggestions]));

  useEffect(() => {
    let cancelled = false;
    const hydrateHistory = async () => {
      setHistoryHydrated(false);
      setPersistedMessagesForScope(chatScope, [INTRO_MSG]);
      setMessages([INTRO_MSG]);
      try {
        const entries = await AsyncStorage.multiGet([storageKey, contextStorageKey, clearMarkerKey, legacyStorageKey]);
        const values = new Map(entries);
        const cached = values.get(storageKey) ?? (!useAdvisorV2 ? values.get(legacyStorageKey) : null);
        const contextCached = values.get(contextStorageKey);
        const cutoff = values.get(clearMarkerKey) ?? null;
        clearedAtRef.current = cutoff;
        const visibleMessages = cached ? normalizeStoredMessages(JSON.parse(cached)) : [INTRO_MSG];
        const contextMessages = contextCached
          ? normalizeStoredMessages(JSON.parse(contextCached))
          : visibleMessages;
        if (cancelled) return;
        mergeModelContextMessages(chatScope, contextMessages);
        const visibleAfterCutoff = filterMessagesAfterCutoff(visibleMessages, cutoff);
        const next = visibleAfterCutoff.length > 0 ? visibleAfterCutoff : [INTRO_MSG];
        setPersistedMessagesForScope(chatScope, next);
        setMessages(next);
      } catch (error) {
        console.log("[AdvisorChat] history hydrate error:", String((error as Error)?.message ?? error));
      } finally {
        if (!cancelled) setHistoryHydrated(true);
      }
    };
    void hydrateHistory();
    return () => { cancelled = true; };
  }, [chatScope, clearMarkerKey, contextStorageKey, legacyStorageKey, storageKey]);

  useEffect(() => {
    if (!historyHydrated) return;
    const contextMessages = _modelContextScope === chatScope ? _modelContextMessages : mergeModelContextMessages(chatScope, messages);
    void AsyncStorage.multiSet([
      [storageKey, JSON.stringify(messages)],
      [contextStorageKey, JSON.stringify(contextMessages)],
    ]).catch((error) => {
      console.log("[AdvisorChat] history persist error:", String((error as Error)?.message ?? error));
    });
  }, [chatScope, contextStorageKey, historyHydrated, messages, storageKey]);

  const showWaitingHint = useCallback((requestId: string, hintIndex: number) => {
    updateMessages((previous) => previous.map((message) => (
      message.requestId === requestId && message.role === "assistant" && message.waiting
        ? { ...message, text: v2LoadingHints.current.get(requestId) ?? WAITING_HINTS[hintIndex % WAITING_HINTS.length] }
        : message
    )));
  }, []);

  const formatAdvisorError = useCallback((error: unknown): string => {
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = String((error as { message?: unknown }).message ?? "未知錯誤");
      return `（顧問服務異常：${message}）`;
    }
    return `（顧問服務異常：${String(error ?? "未知錯誤")}）`;
  }, []);

  const resolvePendingWithError = useCallback((requestId: string, errorText: string) => {
    pendingRequestIds.current.delete(requestId);
    pendingSinceMs.current.delete(requestId);
    updateMessages((previous) => {
      let matched = false;
      const next = previous.map((message) => {
        if (message.requestId === requestId && message.role === "assistant") {
          matched = true;
          return { ...message, text: errorText, waiting: false, typing: false };
        }
        return message;
      });
      if (!matched) {
        next.push({ id: `a-${requestId}-err`, role: "assistant", text: errorText, requestId, createdAt: new Date().toISOString() });
      }
      return next;
    });
  }, []);

  const keepPendingAfterInvokeError = useCallback((requestId: string) => {
    updateMessages((previous) => previous.map((message) => (
      message.requestId === requestId && message.role === "assistant"
        ? { ...message, text: "（連線暫時中斷，答案完成後會自動顯示。）", waiting: true, typing: false }
        : message
    )));
  }, []);

  const typeReply = useCallback((requestId: string, reply: string) => {
    const timer = typingTimers.current.get(requestId);
    if (timer) clearTimeout(timer);

    let position = 0;
    const tick = () => {
      position = Math.min(position + 1, reply.length);
      updateMessages((previous) => previous.map((message) => (
        message.requestId === requestId && message.role === "assistant"
          ? {
            ...message,
            text: reply.slice(0, position),
            waiting: false,
            typing: position < reply.length,
          }
          : message
      )));
      if (position < reply.length) {
        typingTimers.current.set(requestId, setTimeout(tick, typingDelay(reply[position - 1] ?? "")));
      } else {
        typingTimers.current.delete(requestId);
        updateMessages((previous) => previous.map((message) => (
          message.requestId === requestId && message.role === "assistant"
            ? { ...message, text: reply, waiting: false, typing: false }
            : message
        )));
      }
    };
    tick();
  }, []);

  const applyAdvisorRow = useCallback((row: AdvisorRow, animateReply: boolean) => {
    const requestId = row.request_id;
    if (!requestId) return;

    if (row.status === "completed" && row.bot_reply) {
      pendingRequestIds.current.delete(requestId);
      pendingSinceMs.current.delete(requestId);
      v2LoadingHints.current.delete(requestId);
      const createdAt = row.created_at ?? new Date().toISOString();
      const hasAssistant = _persistedMessages.some((message) => (
        message.requestId === requestId && message.role === "assistant"
      ));
      if (!hasAssistant) {
        updateMessages((previous) => [...previous,
          { id: `u-${requestId}`, role: "user", text: row.user_text, requestId, createdAt },
          { id: `a-${requestId}`, role: "assistant", text: animateReply ? "" : row.bot_reply!, requestId, createdAt, typing: animateReply },
        ]);
      }
      if (animateReply) typeReply(requestId, row.bot_reply);
      return;
    }

    if (row.status === "completed" && !row.bot_reply) {
      v2LoadingHints.current.delete(requestId);
      resolvePendingWithError(requestId, "（顧問未有返回內容，請稍後再試。）");
      return;
    }

    if (row.status === "failed") {
      pendingRequestIds.current.delete(requestId);
      pendingSinceMs.current.delete(requestId);
      v2LoadingHints.current.delete(requestId);
      const errorText = `（顧問服務異常：${row.error_message ?? "未知錯誤"}）`;
      updateMessages((previous) => {
        let matched = false;
        const next = previous.map((message) => {
          if (message.requestId === requestId && message.role === "assistant") {
            matched = true;
            return { ...message, text: errorText, waiting: false, typing: false };
          }
          return message;
        });
        if (!matched) {
          next.push(
            { id: `u-${requestId}`, role: "user", text: row.user_text, requestId, createdAt: row.created_at ?? new Date().toISOString() },
            { id: `a-${requestId}-err`, role: "assistant", text: errorText, requestId, createdAt: row.created_at ?? new Date().toISOString() },
          );
        }
        return dedupeMessagesById(next);
      });
    }
  }, [resolvePendingWithError, typeReply]);

  const pollAdvisorReplies = useCallback(async () => {
    if (!user || isGuest || !isSupabaseConfigured || pendingRequestIds.current.size === 0) return;
    const requestIds = [...pendingRequestIds.current].filter((id) => !id.startsWith("local-"));
    if (requestIds.length > 0) {
      const { data, error } = await supabase
        .from("dsemcq_advisor_messages")
        .select("id, request_id, user_text, bot_reply, status, error_message, created_at")
        .eq("user_id", user.id)
        .in("request_id", requestIds);
      if (error) {
        console.log("[AdvisorChat] polling error:", error.message);
      } else {
        for (const row of (data ?? []) as AdvisorRow[]) applyAdvisorRow(row, true);
      }
    }
    const v2Ids = [...v2RequestIds.current];
    if (v2Ids.length === 0) return;
    const { data: v2Data, error: v2Error } = await supabase
      .from("dsemcq_advisor_v2_messages")
      .select("id, request_id, user_text, bot_reply, status, error_message, created_at")
      .eq("user_id", user.id)
      .in("request_id", v2Ids);
    if (v2Error) {
      console.log("[AdvisorChat] V2 polling error:", v2Error.message);
      return;
    }

    const { data: workflowData, error: workflowError } = await supabase
      .from("dsemcq_advisor_v2_workflow_runs")
      .select("id, request_id, current_stage, validated_plan")
      .eq("user_id", user.id)
      .in("request_id", v2Ids);
    if (workflowError) {
      console.log("[AdvisorChat] V2 progress polling error:", workflowError.message);
    } else {
      const workflows = (workflowData ?? []) as AdvisorV2WorkflowProgress[];
      const workflowIds = workflows.map((workflow) => workflow.id);
      const { data: agentData, error: agentError } = workflowIds.length > 0
        ? await supabase
          .from("dsemcq_advisor_v2_agent_runs")
          .select("workflow_id, agent_role, status")
          .in("workflow_id", workflowIds)
          .eq("status", "running")
        : { data: [], error: null };
      if (agentError) {
        console.log("[AdvisorChat] V2 source progress polling error:", agentError.message);
      }

      const runningSourcesByWorkflow = new Map<string, string[]>();
      for (const agent of (agentData ?? []) as AdvisorV2AgentProgress[]) {
        const sources = runningSourcesByWorkflow.get(agent.workflow_id) ?? [];
        if (!sources.includes(agent.agent_role)) sources.push(agent.agent_role);
        runningSourcesByWorkflow.set(agent.workflow_id, sources);
      }
      for (const workflow of workflows) {
        v2LoadingHints.current.set(
          workflow.request_id,
          getV2LoadingHint(workflow, runningSourcesByWorkflow.get(workflow.id) ?? [], 0),
        );
      }
    }

    for (const row of (v2Data ?? []) as AdvisorRow[]) {
      if (row.status === "completed" || row.status === "failed") v2RequestIds.current.delete(row.request_id ?? "");
      applyAdvisorRow(row, true);
    }
  }, [applyAdvisorRow, isGuest, user]);

  useEffect(() => {
    if (!historyHydrated || !user || isGuest || !isSupabaseConfigured) return;
    let active = true;
    const loadHistory = async () => {
      const messageTable = useAdvisorV2 ? "dsemcq_advisor_v2_messages" : "dsemcq_advisor_messages";
      const { data, error } = await supabase
        .from(messageTable)
        .select("id, request_id, user_text, bot_reply, status, error_message, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error && isLegacySchemaMissingColumnError(error.message)) {
        const { data: legacyData, error: legacyError } = await supabase
          .from("dsemcq_advisor_messages")
          .select("id, user_text, bot_reply, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(50);
        if (legacyError) {
          console.log("[AdvisorChat] load legacy history error:", legacyError.message);
          return;
        }
        if (!active || !legacyData) return;
        const legacyMessages = (legacyData as Array<{ id: string; user_text: string; bot_reply: string | null; created_at?: string | null }>).flatMap((row) => {
          const pairs: Msg[] = [{ id: `u-db-${row.id}`, role: "user", text: row.user_text, createdAt: row.created_at ?? undefined }];
          if (row.bot_reply) pairs.push({ id: `a-db-${row.id}`, role: "assistant", text: row.bot_reply, createdAt: row.created_at ?? undefined });
          return pairs;
        });
        mergeModelContextMessages(chatScope, legacyMessages);
        const visibleLegacyMessages = filterMessagesAfterCutoff(legacyMessages, clearedAtRef.current);
        if (visibleLegacyMessages.length === 0) return;
        updateMessages((previous) => dedupeMessagesById([...previous, ...visibleLegacyMessages]));
        return;
      }

      if (error) {
        console.log("[AdvisorChat] load history error:", error.message);
        return;
      }
      if (!active || !data) return;
      const rows = data as AdvisorRow[];
      for (const row of rows) {
        if (row.status === "completed" && row.bot_reply) {
          mergeModelContextMessages(chatScope, rowMessages(row));
        }
        if (clearedAtRef.current && (!row.created_at || row.created_at <= clearedAtRef.current)) continue;
        if (row.status === "pending" || row.status === "processing") {
          if (row.request_id) pendingRequestIds.current.add(row.request_id);
          if (useAdvisorV2 && row.request_id) {
            v2RequestIds.current.add(row.request_id);
            v2LoadingHints.current.set(row.request_id, "正在理解你的問題…");
          }
          if (row.request_id && !pendingSinceMs.current.has(row.request_id)) {
            pendingSinceMs.current.set(row.request_id, Date.now());
          }
          updateMessages((previous) => previous.some((message) => message.requestId === row.request_id)
            ? previous
            : [...previous,
              { id: `u-${row.request_id}`, role: "user", text: row.user_text, requestId: row.request_id!, createdAt: row.created_at ?? undefined },
              { id: `a-${row.request_id}`, role: "assistant", text: WAITING_HINTS[0], requestId: row.request_id!, createdAt: row.created_at ?? undefined, waiting: true, typing: false },
            ]);
        } else {
          applyAdvisorRow(row, false);
        }
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, [applyAdvisorRow, historyHydrated, isGuest, useAdvisorV2, user]);

  useEffect(() => {
    const poll = setInterval(() => { void pollAdvisorReplies(); }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [pollAdvisorReplies]);

  useEffect(() => {
    if (pendingRequestIds.current.size === 0) return;
    let hintIndex = 0;
    const hints = setInterval(() => {
      hintIndex += 1;
      for (const requestId of pendingRequestIds.current) showWaitingHint(requestId, hintIndex);
    }, 1_500);
    return () => clearInterval(hints);
  }, [messages, showWaitingHint]);

  useEffect(() => {
    const staleWatcher = setInterval(() => {
      const now = Date.now();
      for (const requestId of pendingRequestIds.current) {
        const startedAt = pendingSinceMs.current.get(requestId) ?? now;
        if (now - startedAt > TIMEOUT_MS.chatInvoke + 5_000) {
          keepPendingAfterInvokeError(requestId);
        }
      }
    }, 5_000);
    return () => clearInterval(staleWatcher);
  }, [keepPendingAfterInvokeError]);

  useEffect(() => () => {
    for (const timer of typingTimers.current.values()) clearTimeout(timer);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    // Guest session limit
    const currentUserMsgCount = _modelContextMessages.filter((message) => isModelContextMessage(message) && message.role === "user").length;
    if (isGuest && currentUserMsgCount >= guestLimit) {
      Alert.alert(
        "已達免費使用上限",
        `訪客可免費使用 AI 顧問 ${guestLimit} 次。請登入或登記帳戶以繼續對話。`,
        [
          { text: "稍後再算", style: "cancel" },
          { text: "前往登入", style: "default", onPress: signOut },
        ]
      );
      return;
    }

    // Monthly limit for logged-in users
    if (!isGuest && user) {
      if (monthlyQuota && monthlyQuota.remaining <= 0) {
        Alert.alert(
          "本月對話已達上限",
          user.subscription_tier === "premium"
            ? `學士版每月 ${premiumLimit}${userBonus > 0 ? ` + ${userBonus} 額外` : ""} 次已用盡，如需更多請聯絡客服。`
            : `庶民版每月 ${freeLimit}${userBonus > 0 ? ` + ${userBonus} 額外` : ""} 次已用盡，升級至學士版可享每月 ${premiumLimit} 次。`,
        );
        return;
      }
    }

    const cleanText = text.trim();
    suggestionsDismissedRef.current = true;
    setVisibleSuggestions([]);
    setShowSuggestions(false);
    // Capture previous turns before adding this question, so Poe does not receive it twice.
    const contextMessages = mergeModelContextMessages(chatScope, _persistedMessages);
    const historyToSend = getRecentChatHistory(contextMessages);
    const createdAt = new Date().toISOString();
    setLoading(true);
    let hasRenderedUserMessage = false;
    let activeRequestId: string | null = null;

    const startDirectWaitingFlow = (requestId: string) => {
      pendingRequestIds.current.add(requestId);
      pendingSinceMs.current.set(requestId, Date.now());
      scrollToLatest(false);
      updateMessages((previous) => [...previous,
        { id: `u-${requestId}`, role: "user", text: cleanText, requestId, createdAt },
        { id: `a-${requestId}`, role: "assistant", text: WAITING_HINTS[0], requestId, createdAt, waiting: true, typing: false },
      ]);
      hasRenderedUserMessage = true;
    };

    const finishDirectWaitingFlow = (requestId: string, replyText: string) => {
      pendingRequestIds.current.delete(requestId);
      pendingSinceMs.current.delete(requestId);
      typeReply(requestId, replyText);
    };

    const invokeAdvisorDirect = async (): Promise<string> => {
      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke("dsemcq-advisor-chat", {
            body: {
              message: cleanText,
              system: SYSTEM_PROMPT,
              history: historyToSend,
            },
          }),
          TIMEOUT_MS.chatInvoke,
          "advisor_chat_invoke",
        );
        if (error || data?.error) {
          const errMsg = data?.error ?? error?.message ?? "未知錯誤";
          if (data?.code === "MONTHLY_LIMIT") {
            Alert.alert("本月對話已達上限", errMsg);
            return `（${errMsg}）`;
          }
          console.log("[AdvisorChat] error:", error, "data.error:", data?.error);
          return `（顧問服務異常：${errMsg}）`;
        }
        if (!isGuest && isAdvisorQuota(data?.quota)) setMonthlyQuota(data.quota);
        return data?.reply ?? "（無回覆）";
      } catch (e) {
        if (isTimeoutError(e)) return "（顧問回應逾時，請稍後再試。）";
        return `（顧問服務異常：${String((e as Error)?.message ?? "未知錯誤")}）`;
      }
    };

    try {
      let reply = "";
      if (!isSupabaseConfigured) {
        updateMessages((previous) => [...previous, { id: `u-${Date.now()}`, role: "user", text: cleanText, createdAt }]);
        await new Promise((r) => setTimeout(r, 600));
        reply = getDemoReply(text);
      } else {
        if (!isGuest && user) {
          const requestId = createRequestId();
          activeRequestId = requestId;
          console.log("[AdvisorChat] insert pending request:", requestId);
          const { error } = await supabase.from(useAdvisorV2 ? "dsemcq_advisor_v2_messages" : "dsemcq_advisor_messages").insert({
            user_id: user.id,
            request_id: requestId,
            user_text: cleanText,
            status: "pending",
          });
          if (error) {
            console.log("[AdvisorChat] insert pending failed:", error.message);
            if (isLegacySchemaMissingColumnError(error.message)) {
              console.log("[AdvisorChat] detected legacy advisor schema, using direct invoke fallback");
              const directRequestId = `local-${createRequestId()}`;
              startDirectWaitingFlow(directRequestId);
              reply = await invokeAdvisorDirect();
              finishDirectWaitingFlow(directRequestId, reply);
              return;
            }
            throw error;
          }

          pendingRequestIds.current.add(requestId);
          pendingSinceMs.current.set(requestId, Date.now());
          scrollToLatest(false);
          updateMessages((previous) => [...previous,
            { id: `u-${requestId}`, role: "user", text: cleanText, requestId, createdAt },
            { id: `a-${requestId}`, role: "assistant", text: WAITING_HINTS[0], requestId, createdAt, waiting: true, typing: false },
          ]);
          hasRenderedUserMessage = true;
          if (useAdvisorV2) {
            v2RequestIds.current.add(requestId);
            v2LoadingHints.current.set(requestId, "正在理解你的問題…");
          }
          void supabase.functions.invoke(useAdvisorV2 ? "dsemcq-advisor-v2-start" : "dsemcq-advisor-chat", {
            body: useAdvisorV2
              ? { requestId }
              : { message: cleanText, system: SYSTEM_PROMPT, history: historyToSend, requestId },
          }).then(({ data, error }) => {
            if (error) {
              console.log("[AdvisorChat] background invocation error:", error);
              keepPendingAfterInvokeError(requestId);
              return;
            }
            if (isAdvisorQuota(data?.quota)) setMonthlyQuota(data.quota);
            if (data?.code === "MONTHLY_LIMIT") {
              v2RequestIds.current.delete(requestId);
              v2LoadingHints.current.delete(requestId);
              resolvePendingWithError(requestId, "（本月對話已達上限。）");
              return;
            }
            if (!isAdvisorQuota(data?.quota)) void fetchMonthlyUsed();
          }).catch((error) => {
            console.log("[AdvisorChat] background invocation error:", error);
            keepPendingAfterInvokeError(requestId);
          });
          return;
        }

        // Guest mode has no protected row to poll, so it keeps the direct fallback.
        const directRequestId = `local-${createRequestId()}`;
        startDirectWaitingFlow(directRequestId);
        reply = await invokeAdvisorDirect();
        finishDirectWaitingFlow(directRequestId, reply);
        return;
      }
      updateMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", text: reply }]);
    } catch (error) {
      if (!hasRenderedUserMessage) {
        updateMessages((previous) => [...previous, {
          id: activeRequestId ? `u-${activeRequestId}` : `u-${Date.now()}`,
          role: "user",
          text: cleanText,
          requestId: activeRequestId ?? undefined,
          createdAt,
        }]);
      }
      if (activeRequestId) {
        resolvePendingWithError(activeRequestId, formatAdvisorError(error));
      } else {
        updateMessages((previous) => [...previous, { id: `a-${Date.now()}`, role: "assistant", text: formatAdvisorError(error), createdAt }]);
      }
    } finally {
      setLoading(false);
      scrollToLatest(true);
    }
  };

  // Keep sendRef always pointing to latest sendMessage to avoid stale closure
  sendRef.current = sendMessage;

  // Auto-send when navigated here with an initialMessage (e.g. from "Ask AI" button)
  useEffect(() => {
    const msg = routeParams?.initialMessage;
    if (msg && routeParams !== autoSentRef.current) {
      autoSentRef.current = routeParams;
      const timer = setTimeout(() => sendRef.current(msg), 300);
      return () => clearTimeout(timer);
    }
  }, [routeParams]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
  };

  const clearVisibleHistory = () => {
    Alert.alert(
      "清除畫面紀錄",
      "只會隱藏本機畫面上的舊對話，不會刪除資料庫紀錄；之後回答仍可參考這段對話。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清除",
          style: "destructive",
          onPress: () => {
            const cutoff = new Date().toISOString();
            const contextMessages = _modelContextScope === chatScope
              ? _modelContextMessages
              : mergeModelContextMessages(chatScope, _persistedMessages);
            clearedAtRef.current = cutoff;
            for (const timer of typingTimers.current.values()) clearTimeout(timer);
            typingTimers.current.clear();
            pendingRequestIds.current.clear();
            v2RequestIds.current.clear();
            pendingSinceMs.current.clear();
            v2LoadingHints.current.clear();
            setLoading(false);
            setInput("");
            setShowEmojiPicker(false);
            setShowJumpToLatest(false);
            setPersistedMessagesForScope(chatScope, [INTRO_MSG]);
            setMessages([INTRO_MSG]);
            void AsyncStorage.multiSet([
              [storageKey, JSON.stringify([INTRO_MSG])],
              [contextStorageKey, JSON.stringify(contextMessages)],
              [clearMarkerKey, cutoff],
            ]).catch((error) => {
              console.log("[AdvisorChat] clear history persist error:", String((error as Error)?.message ?? error));
            });
          },
        },
      ],
    );
  };

  // Bonus purchase handler
  const canBuyBonus = !isGuest && user && (user.wenyuan_points ?? 0) >= bonusCost && userBonus < bonusMax;
  const maxBuyable = Math.min(
    Math.floor((user?.wenyuan_points ?? 0) / bonusCost),
    bonusMax - userBonus
  );

  const handleBuyBonus = async () => {
    if (!user || bonusQty < 1 || bonusQty > maxBuyable) return;
    const cost = bonusQty * bonusCost;
    const newBonus = userBonus + bonusQty;
    const newPoints = (user.wenyuan_points ?? 0) - cost;

    Alert.alert(
      "確認兌換",
      `扣除 ${cost} 文淵點，換取 ${bonusQty} 次額外月度 AI 對話配額？\n\n文淵點：${user.wenyuan_points} → ${newPoints}\n額外配額：${userBonus} → ${newBonus}`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "確認兌換",
          onPress: async () => {
            await updateProfile({ wenyuan_points: newPoints, bonus_ai_chat: newBonus });
            setShowBonusModal(false);
            setBonusQty(1);
            Alert.alert("兌換成功", `已獲得 ${bonusQty} 次額外 AI 對話配額！`);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ContentContainer>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{BOT_NAME}</Text>
            <Text style={styles.subtitle}>文言文溫習・應試策略・情緒調節</Text>
          </View>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={clearVisibleHistory}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="清除畫面紀錄"
          >
            <Ionicons name="trash-outline" size={17} color={colors.textSecondary} />
          </TouchableOpacity>
          {ADVISOR_V2_DEV_ENABLED && !isGuest && user && (
            <TouchableOpacity style={styles.analysisBtn} onPress={() => setShowAnalysisModal(true)} activeOpacity={0.7}>
              <Ionicons name="options-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
          {canBuyBonus && (
            <TouchableOpacity style={styles.bonusBtn} onPress={() => { setBonusQty(1); setShowBonusModal(true); }} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={16} color={colors.gold} />
              <Text style={styles.bonusBtnText}>兌換配額</Text>
            </TouchableOpacity>
          )}
        </View>
        {isGuest && (() => {
          const used = _modelContextMessages.filter((message) => isModelContextMessage(message) && message.role === "user").length;
          const remaining = Math.max(0, guestLimit - used);
          return (
            <Text style={styles.guestLimit}>
              {remaining > 0 ? `訪客剩餘 ${remaining} 次免費提問` : "訪客免費次數已用盡，請登入繼續"}
            </Text>
          );
        })()}
        {!isGuest && user && monthlyQuota !== null && (() => {
          const remaining = monthlyQuota.remaining;
          const tierLabel = user.subscription_tier === "premium" ? "學士版" : "庶民版";
          const bonusLabel = userBonus > 0 ? ` + ${userBonus} 額外` : "";
          return (
            <Text style={styles.guestLimit}>
              {tierLabel} · 本月剩餘 {remaining} / {monthlyQuota.limit} 次{bonusLabel}（每月 1 號重置）
            </Text>
          );
        })()}
      </View>

      <Modal visible={showAnalysisModal} transparent animationType="fade" onRequestClose={() => setShowAnalysisModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAnalysisModal(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.modalTitle}>分析資料設定</Text>
            <Text style={styles.modalDesc}>你可選擇新顧問回答時可參考的資料。設定只會影響之後的新問題。</Text>
            <PreferenceSwitch label="近期對話內容" value={v2Preferences.conversation_history_enabled} onChange={(value) => void updateV2Preference({ conversation_history_enabled: value })} />
            <PreferenceSwitch label="心理測驗及學習方式" value={v2Preferences.profile_enabled} onChange={(value) => void updateV2Preference({ profile_enabled: value })} />
            <PreferenceSwitch label="過往答題表現" value={v2Preferences.performance_enabled} onChange={(value) => void updateV2Preference({ performance_enabled: value })} />
            <PreferenceSwitch label="題庫與篇章資料" value={v2Preferences.question_bank_enabled} onChange={(value) => void updateV2Preference({ question_bank_enabled: value })} />
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowAnalysisModal(false)}>
              <Text style={styles.modalCloseText}>完成</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Bonus purchase modal */}
      <Modal visible={showBonusModal} transparent animationType="fade" onRequestClose={() => setShowBonusModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBonusModal(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.modalTitle}>兌換額外 AI 對話配額</Text>
            <Text style={styles.modalDesc}>
              使用文淵點兌換永久額外月度 AI 對話配額。{"\n"}
              兌換比率：{bonusCost} 文淵點 = 1 次額外配額{"\n"}
              上限：{bonusMax} 次（目前已有 {userBonus} 次）
            </Text>
            <Text style={styles.modalInfo}>你的文淵點：{user?.wenyuan_points ?? 0}</Text>
            <Text style={styles.modalInfo}>可兌換數量：最多 {maxBuyable} 次</Text>

            {maxBuyable > 0 ? (
              <>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setBonusQty(Math.max(1, bonusQty - 1))}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{bonusQty}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setBonusQty(Math.min(maxBuyable, bonusQty + 1))}>
                    <Text style={styles.qtyBtnText}>＋</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalCost}>消耗 {bonusQty * bonusCost} 文淵點</Text>
                <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleBuyBonus} activeOpacity={0.8}>
                  <Text style={styles.modalConfirmText}>確認兌換</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.modalWarn}>
                {userBonus >= bonusMax ? "已達額外配額上限" : "文淵點不足"}
              </Text>
            )}

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowBonusModal(false)}>
              <Text style={styles.modalCloseText}>關閉</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <EmojiPicker
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelected={({ emoji }) => {
          setInput((previous) => previous + emoji);
          setShowEmojiPicker(false);
        }}
        enableSearchBar
        enableRecentlyUsed
        allowMultipleSelections={false}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md }}
          onScroll={handleListScroll}
          onContentSizeChange={followLatestContent}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.aiBubble,
                item.role === "assistant" && item.waiting ? styles.aiWaitingBubble : null,
              ]}
            >
              {item.role === "user" ? (
                <Text style={styles.userText}>{item.text}</Text>
              ) : item.waiting ? (
                <Text style={styles.aiWaitingText}>{item.text}</Text>
              ) : item.typing ? (
                <Text style={styles.aiTypingText}>{item.text}</Text>
              ) : (
                <Markdown style={mdStyles}>{item.text}</Markdown>
              )}
            </View>
          )}
        />
        {showSuggestions && visibleSuggestions.length === 2 && (
          <View style={styles.suggestionPanel}>
            <Text style={styles.suggestionLabel}>不知從何問起？</Text>
            <View style={styles.suggestionRow}>
              {visibleSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.id}
                  style={[styles.suggestionBubble, loading && styles.suggestionBubbleDisabled]}
                  onPress={() => {
                    setInput("");
                    void sendRef.current(suggestion.prompt_text);
                  }}
                  disabled={loading}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`送出建議問題：${suggestion.prompt_text}`}
                >
                  <Text style={styles.suggestionText} numberOfLines={2}>{suggestion.prompt_text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {showJumpToLatest && (
          <TouchableOpacity
            style={[styles.jumpToLatestButton, showSuggestions && styles.jumpAboveSuggestions]}
            onPress={() => scrollToLatest(true)}
            accessibilityRole="button"
            accessibilityLabel="跳到最新訊息"
          >
            <Ionicons name="chevron-down" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="輸入問題…"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            onFocus={() => { if (isNearBottomRef.current) scrollToLatest(false); }}
            multiline
          />
          <TouchableOpacity
            style={styles.emojiBtn}
            onPress={() => setShowEmojiPicker(true)}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="開啟表情符號鍵盤"
          >
            <Ionicons name="happy-outline" size={23} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading || !input.trim()}>
            <Text style={styles.sendText}>{loading ? "…" : "送出"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center" },
  title: { ...typography.heading, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  guestLimit: { ...typography.caption, color: colors.warning, marginTop: 4 },
  bonusBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, gap: 4 },
  bonusBtnText: { ...typography.caption, color: colors.gold, fontWeight: "600" },
  headerIconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: spacing.xs },
  analysisBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: 14, marginBottom: spacing.sm, maxWidth: "85%" },
  userBubble: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  aiBubble: { backgroundColor: colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border },
  aiWaitingBubble: {
    opacity: 0.78,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    maxWidth: "72%",
  },
  userText: { color: "#FFFFFF", lineHeight: 22 },
  aiText: { color: colors.textPrimary, lineHeight: 22 },
  aiWaitingText: { color: colors.textMuted, lineHeight: 20, fontSize: 13 },
  aiTypingText: { color: colors.textPrimary, lineHeight: 22 },
  jumpToLatestButton: { position: "absolute", right: spacing.md, bottom: 76, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  jumpAboveSuggestions: { bottom: 144 },
  suggestionPanel: { paddingHorizontal: spacing.sm, paddingTop: 5, paddingBottom: 7, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  suggestionLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 5, paddingHorizontal: 2 },
  suggestionRow: { flexDirection: "row", gap: spacing.xs },
  suggestionBubble: { flex: 1, minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface },
  suggestionBubbleDisabled: { opacity: 0.45 },
  suggestionText: { color: colors.primary, fontSize: 12, lineHeight: 18, textAlign: "center" },
  inputRow: { flexDirection: "row", padding: spacing.sm, borderTopWidth: 1, borderColor: colors.border, alignItems: "flex-end" },
  input: { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120, marginRight: spacing.xs },
  emojiBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center", marginRight: spacing.xs },
  sendBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendText: { color: "#FFFFFF", fontWeight: "700" },
  // Bonus modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.lg, width: "100%", maxWidth: 360 },
  modalTitle: { ...typography.subheading, color: colors.ink, fontWeight: "700", marginBottom: spacing.sm },
  modalDesc: { ...typography.caption, color: colors.inkMuted, lineHeight: 20, marginBottom: spacing.sm },
  modalInfo: { ...typography.body, color: colors.ink, marginBottom: 4 },
  modalCost: { ...typography.body, color: colors.primary, fontWeight: "700", textAlign: "center", marginTop: spacing.sm },
  modalWarn: { ...typography.body, color: colors.warning, textAlign: "center", marginTop: spacing.md },
  preferenceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  preferenceLabel: { ...typography.body, color: colors.ink, flex: 1, paddingRight: spacing.sm },
  preferenceDisabled: { color: colors.textMuted },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, marginTop: spacing.md },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  qtyBtnText: { fontSize: 20, color: colors.ink, fontWeight: "700" },
  qtyValue: { ...typography.heading, color: colors.ink, fontWeight: "700", minWidth: 40, textAlign: "center" },
  modalConfirmBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: spacing.md },
  modalConfirmText: { ...typography.button, color: "#fff" },
  modalCloseBtn: { marginTop: spacing.sm, alignItems: "center", paddingVertical: 8 },
  modalCloseText: { ...typography.body, color: colors.inkMuted },
});

function PreferenceSwitch({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <Text style={[styles.preferenceLabel, disabled ? styles.preferenceDisabled : null]}>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primary }} />
    </View>
  );
}

// Markdown styles for AI reply bubbles
const mdStyles = StyleSheet.create({
  body: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  strong: { color: colors.ink, fontWeight: "700" },
  em: { color: colors.textSecondary, fontStyle: "italic" },
  heading1: { color: colors.primary, fontSize: 18, fontWeight: "700", marginBottom: 4 },
  heading2: { color: colors.primary, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  heading3: { color: colors.ink, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: colors.textPrimary, marginBottom: 2 },
  bullet_list_icon: { color: colors.primary, marginRight: 6 },
  code_inline: { backgroundColor: colors.surfaceAlt, color: colors.primary, borderRadius: 4, paddingHorizontal: 4, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  fence: { backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 10, marginVertical: 6 },
  code_block: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  blockquote: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, marginLeft: 0, opacity: 0.85 },
  hr: { borderColor: colors.border, marginVertical: 8 },
  link: { color: colors.primary, textDecorationLine: "underline" },
});

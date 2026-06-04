import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import Markdown from "react-native-markdown-display";
import { colors, spacing, typography } from "../theme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { MainTabsParamList } from "../navigation/types";
import ContentContainer from "../components/ContentContainer";

interface Msg { id: string; role: "user" | "assistant"; text: string }

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

const GUEST_LIMIT = 10;
const FREE_MONTHLY_LIMIT = 20;
const PREMIUM_MONTHLY_LIMIT = 300;

export default function AdvisorChatScreen() {
  const routeParams = useRoute<RouteProp<MainTabsParamList, "Advisor">>().params;
  const { user, isGuest, signOut } = useAuth();
  const [messages, setMessages] = useState<Msg[]>(_persistedMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthlyUsed, setMonthlyUsed] = useState<number | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const autoSentRef = useRef<typeof routeParams>(undefined);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  // Fetch this month's message count for logged-in users
  const fetchMonthlyUsed = useCallback(async () => {
    if (!user || isGuest || !isSupabaseConfigured) return;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { count } = await supabase
      .from("dsemcq_advisor_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfMonth);
    setMonthlyUsed(count ?? 0);
  }, [user, isGuest]);

  useEffect(() => { fetchMonthlyUsed(); }, [fetchMonthlyUsed]);

  // Keep persisted store in sync whenever messages change
  const updateMessages = (updater: (prev: Msg[]) => Msg[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      _persistedMessages = next;
      return next;
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    // Guest session limit
    const currentUserMsgCount = _persistedMessages.filter(m => m.role === "user").length;
    if (isGuest && currentUserMsgCount >= GUEST_LIMIT) {
      Alert.alert(
        "已達免費使用上限",
        `訪客可免費使用 AI 顧問 ${GUEST_LIMIT} 次。請登入或登記帳戶以繼續對話。`,
        [
          { text: "稍後再算", style: "cancel" },
          { text: "前往登入", style: "default", onPress: signOut },
        ]
      );
      return;
    }

    // Monthly limit for logged-in users
    if (!isGuest && user) {
      const limit = user.subscription_tier === "premium" ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
      const used = monthlyUsed ?? 0;
      if (used >= limit) {
        Alert.alert(
          "本月對話已達上限",
          user.subscription_tier === "premium"
            ? `學士版每月 ${PREMIUM_MONTHLY_LIMIT} 次已用盡，如需更多請聯絡客服。`
            : `庶民版每月 ${FREE_MONTHLY_LIMIT} 次已用盡，升級至學士版可享每月 ${PREMIUM_MONTHLY_LIMIT} 次。`,
        );
        return;
      }
    }

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text: text.trim() };
    updateMessages((p) => [...p, userMsg]);
    setLoading(true);

    try {
      let reply = "";
      if (!isSupabaseConfigured) {
        await new Promise((r) => setTimeout(r, 600));
        reply = getDemoReply(text);
      } else {
        // Send up to 6 full rounds (12 messages) of prior history, excluding intro
        const historyToSend = _persistedMessages
          .filter((m) => m.id !== "intro")
          .slice(-12);
        const { data, error } = await supabase.functions.invoke("dsemcq-advisor-chat", {
          body: { message: text, system: SYSTEM_PROMPT, history: historyToSend },
        });
        if (error || data?.error) {
          const errMsg = data?.error ?? error?.message ?? "未知錯誤";
          if (data?.code === "MONTHLY_LIMIT") {
            Alert.alert("本月對話已達上限", errMsg);
          }
          console.log("[AdvisorChat] error:", error, "data.error:", data?.error);
          reply = data?.code === "MONTHLY_LIMIT" ? "" : `（顧問服務異常：${errMsg}）`;
        } else {
          reply = data?.reply ?? "（無回覆）";
          // Increment local monthly counter on success
          if (!isGuest && monthlyUsed !== null) setMonthlyUsed(monthlyUsed + 1);
        }
      }
      updateMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", text: reply }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ContentContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{BOT_NAME}</Text>
        <Text style={styles.subtitle}>文言文溫習・應試策略・情緒調節</Text>
        {isGuest && (() => {
          const used = messages.filter(m => m.role === "user").length;
          const remaining = Math.max(0, GUEST_LIMIT - used);
          return (
            <Text style={styles.guestLimit}>
              {remaining > 0 ? `訪客剩餘 ${remaining} 次免費提問` : "訪客免費次數已用盡，請登入繼續"}
            </Text>
          );
        })()}
        {!isGuest && user && monthlyUsed !== null && (() => {
          const limit = user.subscription_tier === "premium" ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
          const remaining = Math.max(0, limit - monthlyUsed);
          const tierLabel = user.subscription_tier === "premium" ? "學士版" : "庶民版";
          return (
            <Text style={styles.guestLimit}>
              {tierLabel} · 本月剩餘 {remaining} / {limit} 次
            </Text>
          );
        })()}
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
              {item.role === "user" ? (
                <Text style={styles.userText}>{item.text}</Text>
              ) : (
                <Markdown style={mdStyles}>{item.text}</Markdown>
              )}
            </View>
          )}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="輸入問題…"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
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
  title: { ...typography.heading, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  guestLimit: { ...typography.caption, color: colors.warning, marginTop: 4 },
  bubble: { padding: spacing.md, borderRadius: 14, marginBottom: spacing.sm, maxWidth: "85%" },
  userBubble: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  aiBubble: { backgroundColor: colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border },
  userText: { color: "#FFFFFF", lineHeight: 22 },
  aiText: { color: colors.textPrimary, lineHeight: 22 },
  inputRow: { flexDirection: "row", padding: spacing.sm, borderTopWidth: 1, borderColor: colors.border, alignItems: "flex-end" },
  input: { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120, marginRight: spacing.sm },
  sendBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendText: { color: "#FFFFFF", fontWeight: "700" },
});

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

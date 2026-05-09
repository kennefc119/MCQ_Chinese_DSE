import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import Constants from "expo-constants";
import Markdown from "react-native-markdown-display";
import { colors, spacing, typography } from "../theme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { MainTabsParamList } from "../navigation/types";

interface Msg { id: string; role: "user" | "assistant"; text: string }

// Bot display name from .env (via app.config.ts extra.advisorBotName)
const BOT_NAME: string = (Constants.expoConfig?.extra?.advisorBotName as string | undefined) ?? "DSE 中文顧問";

const INTRO_MSG: Msg = {
  id: "intro",
  role: "assistant",
  text: `你好！我是你的${BOT_NAME}，專門協助你溫習 12 篇文言文。你可以問我任何關於文言文、學習方法、應試策略或情緒調節的問題。`,
};

const SYSTEM_PROMPT = `你是一位專為香港中學文憑試（DSE）中國語文科學生服務的學習顧問，特別熟悉 12 篇文言文指定篇章。請以繁體中文、親切而專業的語氣回答學生問題：解釋詞句、分析主旨、提供溫習與應試建議、舒緩考試壓力。每次回覆控制在 200 字以內。`;

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

export default function AdvisorChatScreen() {
  const routeParams = useRoute<RouteProp<MainTabsParamList, "Advisor">>().params;
  const [messages, setMessages] = useState<Msg[]>(_persistedMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const autoSentRef = useRef<typeof routeParams>(undefined);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

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
          console.log("[AdvisorChat] error:", error, "data.error:", data?.error);
          reply = `（顧問服務異常：${errMsg}）`;
        } else {
          reply = data?.reply ?? "（無回覆）";
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
      <View style={styles.header}>
        <Text style={styles.title}>📖 {BOT_NAME}</Text>
        <Text style={styles.subtitle}>文言文溫習・應試策略・情緒調節</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  title: { ...typography.heading, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  bubble: { padding: spacing.md, borderRadius: 14, marginBottom: spacing.sm, maxWidth: "85%" },
  userBubble: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  aiBubble: { backgroundColor: colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border },
  userText: { color: "#1A1208", lineHeight: 22 },
  aiText: { color: colors.textPrimary, lineHeight: 22 },
  inputRow: { flexDirection: "row", padding: spacing.sm, borderTopWidth: 1, borderColor: colors.border, alignItems: "flex-end" },
  input: { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120, marginRight: spacing.sm },
  sendBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendText: { color: "#1A1208", fontWeight: "700" },
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

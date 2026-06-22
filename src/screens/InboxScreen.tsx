import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { InboxMessage } from "../types/database";
import { listInbox, markInboxRead } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import EmptyState from "../components/EmptyState";
import { useAppResume } from "../hooks/useAppResume";

export default function InboxScreen() {
  const { loading: authLoading, isSupabaseReady, user } = useAuth();
  const [items, setItems] = useState<InboxMessage[]>([]);

  const load = useCallback(async () => {
    if (!user || !isSupabaseReady) return;
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("load_timeout")), 8000)
    );
    try {
      const nextItems = await Promise.race([listInbox(user.id), deadline]);
      setItems(nextItems);
    } catch {
      // Timed out or network error — keep the existing screen state.
    }
  }, [isSupabaseReady, user]);

  useFocusEffect(useCallback(() => {
    if (authLoading || !isSupabaseReady) return;
    void load();
  }, [authLoading, isSupabaseReady, load]));

  useAppResume(() => {
    void load();
  }, isSupabaseReady);

  const tap = async (m: InboxMessage) => {
    if (!m.read) {
      await markInboxRead(m.id, user?.id);
      load();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={{ padding: spacing.md }}>
          <Text style={styles.title}>收件箱</Text>
          <Text style={styles.subtitle}>系統公告與通知，悉數在此。</Text>
      </View>
      {items.length === 0 ? (
        <EmptyState title="信箱安靜" subtitle="新的公告與系統通知會在此靜候。" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, !item.read && styles.unread]} onPress={() => tap(item)}>
              {!item.read && <View style={styles.unreadDot} />}
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
              <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleString("zh-HK")}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.heading, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.hairline },
  unread: { borderColor: colors.primary, borderLeftWidth: 3 },
  unreadDot: { position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  cardTitle: { ...typography.bodyEmphasis, color: colors.ink },
  cardBody: { ...typography.body, color: colors.inkSoft, marginTop: 4, lineHeight: 21 },
  cardDate: { ...typography.micro, color: colors.inkMuted, marginTop: 8 },
});

import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { InboxMessage } from "../types/database";
import { listInbox, markInboxRead } from "../lib/dataService";
import { useAuth } from "../context/AuthContext";
import EmptyState from "../components/EmptyState";

export default function InboxScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxMessage[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setItems(await listInbox(user.id));
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tap = async (m: InboxMessage) => {
    if (!m.read) {
      await markInboxRead(m.id);
      load();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={{ padding: spacing.md }}>
        <Text style={styles.title}>收件箱</Text>
      </View>
      {items.length === 0 ? (
        <EmptyState icon="📭" title="沒有新訊息" subtitle="管理員的公告與系統通知會顯示在這裡" />
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
  title: { ...typography.title, color: colors.primary },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  unread: { borderColor: colors.primary },
  unreadDot: { position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  cardTitle: { ...typography.heading, color: colors.textPrimary, fontSize: 16 },
  cardBody: { color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  cardDate: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
});

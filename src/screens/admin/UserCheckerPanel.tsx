/**
 * UserCheckerPanel — Search users and navigate to their detail screen.
 *
 * The search input runs an ilike OR query on email + username via
 * adminService.searchUsers. Empty query lists the 50 most-recently-created
 * users. Tapping a row navigates to AdminUserDetailScreen.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme";
import { searchUsers } from "../../lib/adminService";
import { Profile } from "../../types/database";
import { AppStackParamList } from "../../navigation/types";
import { withTimeout } from "../../lib/asyncTimeout";
import { TIMEOUT_MS } from "../../lib/timeoutConfig";

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function UserCheckerPanel() {
  const nav = useNavigation<Nav>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const list = await withTimeout(
        searchUsers(query, 50),
        TIMEOUT_MS.adminUserSearch,
        "admin_user_search",
      ).catch(() => []);
      if (!cancelled) {
        setResults(list);
        setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="搜尋用戶（電郵 / 用戶名）"
        placeholderTextColor={colors.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />}

      {!loading && results.length === 0 && (
        <Text style={styles.empty}>沒有找到用戶</Text>
      )}

      <FlatList
        data={results}
        scrollEnabled={false}
        keyExtractor={(p) => p.id}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => nav.navigate("AdminUserDetail", { userId: item.id })}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.username || "（未命名）"}</Text>
              <Text style={styles.rowSub}>{item.email}</Text>
            </View>
            <View style={styles.badges}>
              {item.role === "admin" && <Text style={[styles.badge, styles.badgeAdmin]}>管理員</Text>}
              {item.subscription_tier === "premium" && (
                <Text style={[styles.badge, styles.badgePremium]}>學士版</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    color: colors.ink,
    marginBottom: spacing.md,
    ...typography.body,
  },
  empty: { ...typography.body, color: colors.inkMuted, textAlign: "center", marginTop: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  sep: { height: spacing.xs },
  rowTitle: { ...typography.body, color: colors.ink, fontWeight: "700" },
  rowSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  badges: { flexDirection: "row", gap: spacing.xs },
  badge: { ...typography.caption, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  badgeAdmin: { backgroundColor: colors.primary, color: colors.primaryOnDark },
  badgePremium: { backgroundColor: colors.gold, color: colors.primaryOnDark },
});

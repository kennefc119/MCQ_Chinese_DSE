import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import GuestGuard from "../components/GuestGuard";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const ROW = (label: string, value: string) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const { user, signOut, demoMode } = useAuth();

  if (!user) return null;

  const onSignOut = () => {
    Alert.alert("登出", "確定登出？", [
      { text: "取消", style: "cancel" },
      { text: "登出", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <GuestGuard>
      <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.username.slice(0, 1)}</Text>
          </View>
          <Text style={styles.name}>{user.username}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {demoMode && <Text style={styles.demoTag}>示範模式</Text>}
        </View>

        <View style={styles.pointsBox}>
          <Text style={styles.pointsLabel}>文淵點</Text>
          <Text style={styles.pointsValue}>{user.wenyuan_points}</Text>
          <Text style={styles.pointsHint}>通過練習與測驗即可累積，解鎖更高難度挑戰</Text>
        </View>

        <View style={styles.card}>
          {ROW("性別", user.gender === "male" ? "男" : user.gender === "female" ? "女" : "其他")}
          {ROW("應考 DSE 年份", `${user.dse_year}`)}
          {ROW("會員等級", user.subscription_tier === "premium" ? "高級" : "免費")}
          {user.role === "admin" && ROW("身份", "管理員")}
        </View>

        <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("Inbox")}>
          <Text style={styles.menuLabel}>📨 收件箱</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("PointHistory")}>
          <Text style={styles.menuLabel}>📊 積分記錄</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("Subscription")}>
          <Text style={styles.menuLabel}>💎 訂閱方案</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        {user.role === "admin" && (
          <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate("Admin")}>
            <Text style={styles.menuLabel}>🛠 管理後台</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.lg }} />
        <Button title="登出" variant="ghost" onPress={onSignOut} />
      </ScrollView>
    </SafeAreaView>
    </GuestGuard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  avatarText: { fontSize: 36, fontWeight: "800", color: "#1A1208" },
  name: { ...typography.title, color: colors.textPrimary },
  email: { color: colors.textSecondary, marginTop: 4 },
  demoTag: { marginTop: 8, color: colors.warning, fontSize: 12, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pointsBox: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 16, alignItems: "center", marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  pointsLabel: { color: colors.textMuted, fontSize: 13 },
  pointsValue: { color: colors.primary, fontSize: 48, fontWeight: "800", marginVertical: 4 },
  pointsHint: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", padding: spacing.sm },
  rowLabel: { color: colors.textSecondary },
  rowValue: { color: colors.textPrimary, fontWeight: "600" },
  menuItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface, borderRadius: 10, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border },
  menuLabel: { color: colors.textPrimary, fontSize: 16 },
  menuArrow: { color: colors.textMuted, fontSize: 22 },
  sectionTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.sm },
});

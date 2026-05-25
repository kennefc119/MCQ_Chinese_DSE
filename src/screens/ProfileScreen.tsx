import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import GuestGuard from "../components/GuestGuard";
import Icon, { IconName } from "../components/Icon";
import SealMark from "../components/SealMark";
import InkDivider from "../components/InkDivider";
import ContentContainer from "../components/ContentContainer";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const ROW = (label: string, value: string) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

type MenuItem = { icon: IconName; label: string; onPress: () => void };

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const { user, signOut, demoMode } = useAuth();

  if (!user) return null;

  const onSignOut = () => {
    Alert.alert("登出文淵", "確認離席？下次再會。", [
      { text: "再想想", style: "cancel" },
      { text: "登出", style: "destructive", onPress: signOut },
    ]);
  };

  const menu: MenuItem[] = [
    { icon: "mail-outline", label: "收件箱", onPress: () => nav.navigate("Inbox") },
    { icon: "time-outline", label: "文淵點記錄", onPress: () => nav.navigate("PointHistory") },
    { icon: "ribbon-outline", label: "訂閱方案", onPress: () => nav.navigate("Subscription") },
    { icon: "business-outline", label: "學校合作計劃", onPress: () => nav.navigate("SchoolPartner") },
    ...(user.role === "admin"
      ? ([{ icon: "construct-outline", label: "管理後台", onPress: () => nav.navigate("Admin") }] as MenuItem[])
      : []),
    { icon: "document-text-outline", label: "使用條款", onPress: () => nav.navigate("Legal", { type: "terms" }) },
    { icon: "shield-checkmark-outline", label: "私隱政策", onPress: () => nav.navigate("Legal", { type: "privacy" }) },
    { icon: "trash-outline", label: "刪除帳戶", onPress: () => {
      Alert.alert(
        "刪除帳戶",
        "刪除後所有資料將被永久移除。請發送電郵至 cs@keeonz.ai 並提供用戶名稱及電郵地址，本公司將於 30 個工作天內處理。",
        [
          { text: "取消", style: "cancel" },
          {
            text: "發送刪除申請電郵",
            style: "destructive",
            onPress: () =>
              Linking.openURL(
                `mailto:cs@keeonz.ai?subject=${encodeURIComponent("帳戶刪除申請")}&body=${encodeURIComponent(`用戶名稱：${user.username}\n電郵地址：${user.email}\n\n請刪除我的帳戶及所有相關資料。`)}`
              ),
          },
        ]
      );
    }},
  ];

  return (
    <GuestGuard>
      <SafeAreaView style={styles.safe} edges={["top"]}>
      <ContentContainer>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.username.slice(0, 1)}</Text>
          </View>
          <Text style={styles.name}>{user.username}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {demoMode && <Text style={styles.demoTag}>試讀模式</Text>}
        </View>

        <View style={styles.pointsBox}>
          <View style={styles.pointsHeader}>
            <SealMark char="淵" size={28} />
            <Text style={styles.pointsLabel}>文淵點</Text>
          </View>
          <Text style={styles.pointsValue}>{user.wenyuan_points}</Text>
          <Text style={styles.pointsHint}>練得多、考得多，文淵點自會累積。難關亦隨之而開。</Text>
        </View>

        <View style={styles.card}>
          {ROW("性別", user.gender === "male" ? "男" : user.gender === "female" ? "女" : "其他")}
          {ROW("應考 DSE 年份", `${user.dse_year}`)}
          {ROW("會員等級", user.subscription_tier === "premium" ? "高級" : "免費")}
          {user.role === "admin" && ROW("身份", "管理員")}
        </View>

        <InkDivider />

        {menu.map((m) => (
          <TouchableOpacity key={m.label} style={styles.menuItem} onPress={m.onPress}>
            <Icon name={m.icon} size="sm" color={colors.inkSoft} />
            <Text style={styles.menuLabel}>{m.label}</Text>
            <Icon name="chevron-forward" size="sm" color={colors.inkMuted} />
          </TouchableOpacity>
        ))}

        <View style={{ height: spacing.lg }} />
        <Button title="登出" variant="ghost" onPress={onSignOut} />
      </ScrollView>
      </ContentContainer>
    </SafeAreaView>
    </GuestGuard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm, overflow: "hidden" },
  avatarText: { ...typography.heading, fontSize: 36, lineHeight: 44, color: colors.primaryOnDark, includeFontPadding: false },
  name: { ...typography.heading, color: colors.ink },
  email: { ...typography.caption, color: colors.inkSoft, marginTop: 4 },
  demoTag: { marginTop: 8, ...typography.micro, color: colors.warning, backgroundColor: colors.warningSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pointsBox: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 16, alignItems: "center", marginBottom: spacing.md, borderWidth: 1, borderColor: colors.hairline },
  pointsHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
  pointsLabel: { ...typography.caption, color: colors.inkMuted },
  pointsValue: { ...typography.display, color: colors.primary, marginVertical: 4 },
  pointsHint: { ...typography.caption, color: colors.inkSoft, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.hairline },
  row: { flexDirection: "row", justifyContent: "space-between", padding: spacing.sm },
  rowLabel: { ...typography.body, color: colors.inkSoft },
  rowValue: { ...typography.bodyEmphasis, color: colors.ink },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 10,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: spacing.sm,
  },
  menuLabel: { flex: 1, ...typography.body, color: colors.ink },
});

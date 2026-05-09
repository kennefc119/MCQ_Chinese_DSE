import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, typography } from "../theme";
import Icon from "./Icon";

/**
 * Wraps content that requires a real account.
 * If the user is a guest, shows a friendly prompt to sign in instead.
 */
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isGuest, signOut } = useAuth();

  if (!isGuest) return <>{children}</>;

  const goLogin = async () => {
    await signOut();
  };

  return (
    <View style={styles.container}>
      <Icon name="lock-closed-outline" size="xl" color={colors.inkMuted} style={{ marginBottom: spacing.lg }} />
      <Text style={styles.title}>需要登入</Text>
      <Text style={styles.body}>此頁需要帳戶。登入或註冊後，方可開卷。</Text>
      <TouchableOpacity style={styles.btn} onPress={goLogin}>
        <Text style={styles.btnText}>登入 / 註冊</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm, textAlign: "center" },
  body: { ...typography.body, color: colors.inkSoft, textAlign: "center", marginBottom: spacing.xl },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
  },
  btnText: { ...typography.button, color: colors.primaryOnDark },
});

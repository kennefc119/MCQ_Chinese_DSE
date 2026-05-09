import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, typography } from "../theme";

/**
 * Wraps content that requires a real account.
 * If the user is a guest, shows a friendly prompt to sign in instead.
 */
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isGuest, signOut } = useAuth();

  if (!isGuest) return <>{children}</>;

  const goLogin = async () => {
    await signOut(); // clears guest state → RootNavigator shows AuthStack
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>需要登入</Text>
      <Text style={styles.body}>此功能需要帳戶。請登入或註冊以繼續使用完整功能。</Text>
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
  icon: { fontSize: 56, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: "center" },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.xl },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
  },
  btnText: { ...typography.button, color: colors.background },
});

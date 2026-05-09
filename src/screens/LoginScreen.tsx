import React, { useState } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableOpacity, Alert, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import { AuthStackParamList } from "../navigation/types";

// Apple Review test account — DO NOT remove (used by App Store review team)
// Email: apple.review@dsemcq.app  |  Password: DSEMcq@Review2025
// Create this account via Supabase Auth Dashboard before submitting for review.

type Nav = NativeStackNavigationProp<AuthStackParamList, "Login">;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { signInWithEmail, signInWithPassword, enterDemo, enterGuest, demoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  // Password login (collapsible, for Apple review)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const onSend = async () => {
    if (!email.includes("@")) {
      Alert.alert("請輸入有效的電郵地址");
      return;
    }
    setLoading(true);
    const res = await signInWithEmail(email.trim());
    setLoading(false);
    if (!res.ok) {
      Alert.alert("發送失敗", res.error || "請稍後再試");
      return;
    }
    nav.navigate("Otp", { email: email.trim() });
  };

  const onPasswordLogin = async () => {
    if (!pwEmail.includes("@") || pwPassword.length < 6) {
      Alert.alert("請輸入有效的電郵及密碼（最少 6 位）");
      return;
    }
    setPwLoading(true);
    const res = await signInWithPassword(pwEmail.trim(), pwPassword);
    setPwLoading(false);
    if (!res.ok) {
      Alert.alert("登入失敗", res.error || "電郵或密碼不正確");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={styles.brand}>📜</Text>
          <Text style={styles.title}>DSE 文言文 MCQ</Text>
          <Text style={styles.subtitle}>專為香港中學文憑試考生而設的文言文練習平台</Text>

          <View style={{ height: spacing.xl }} />

          <FormInput
            label="電郵地址"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Button title="發送驗證碼" onPress={onSend} loading={loading} />

          {/* Guest mode */}
          <TouchableOpacity onPress={enterGuest} style={styles.guestBtn}>
            <Text style={styles.guestText}>👀 以訪客身份瀏覽（部分功能受限）</Text>
          </TouchableOpacity>

          {/* Collapsible password login */}
          <TouchableOpacity
            onPress={() => setShowPasswordLogin(v => !v)}
            style={styles.togglePwRow}
          >
            <Text style={styles.togglePwText}>
              {showPasswordLogin ? "▲ 隱藏帳號密碼登入" : "▼ 使用帳號密碼登入"}
            </Text>
          </TouchableOpacity>

          {showPasswordLogin && (
            <View style={styles.pwBox}>
              <Text style={styles.pwLabel}>電郵</Text>
              <TextInput
                style={styles.pwInput}
                placeholder="email@example.com"
                placeholderTextColor={colors.textMuted}
                value={pwEmail}
                onChangeText={setPwEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
              <Text style={styles.pwLabel}>密碼</Text>
              <TextInput
                style={styles.pwInput}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={pwPassword}
                onChangeText={setPwPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.pwLoginBtn, pwLoading && { opacity: 0.6 }]}
                onPress={onPasswordLogin}
                disabled={pwLoading}
              >
                {pwLoading
                  ? <ActivityIndicator color={colors.background} size="small" />
                  : <Text style={styles.pwLoginBtnText}>登入</Text>}
              </TouchableOpacity>
            </View>
          )}

          {demoMode && (
            <>
              <Text style={styles.demoNote}>未設定 Supabase — 可進入示範模式體驗 App</Text>
              <TouchableOpacity onPress={enterDemo} style={styles.demoBtn}>
                <Text style={styles.demoText}>🎮 直接進入示範模式</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.footer}>登入即表示同意使用條款及私隱政策</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  brand: { fontSize: 64, textAlign: "center", marginBottom: spacing.md },
  title: { ...typography.title, color: colors.primary, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm },
  guestBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  guestText: { ...typography.button, color: colors.textSecondary },
  togglePwRow: { marginTop: spacing.md, alignItems: "center", paddingVertical: spacing.xs },
  togglePwText: { ...typography.caption, color: colors.textMuted },
  pwBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  pwLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  pwInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  pwLoginBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  pwLoginBtnText: { ...typography.button, color: colors.background },
  demoNote: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  demoBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  demoText: { ...typography.button, color: colors.accent },
  footer: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
});

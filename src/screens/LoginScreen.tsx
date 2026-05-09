import React, { useState } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableOpacity, Alert, TextInput, ActivityIndicator, ScrollView,
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

type Panel = "school" | "password" | null;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { signInWithEmail, signInWithPassword, enterDemo, enterGuest, demoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const [activePanel, setActivePanel] = useState<Panel>(null);

  // Password login (Apple review)
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // School login
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolPassword, setSchoolPassword] = useState("");
  const [schoolLoading, setSchoolLoading] = useState(false);

  const togglePanel = (panel: Panel) =>
    setActivePanel(prev => (prev === panel ? null : panel));

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
    if (!res.ok) Alert.alert("登入失敗", res.error || "電郵或密碼不正確");
  };

  const onSchoolLogin = async () => {
    if (!schoolEmail.includes("@") || schoolPassword.length < 6) {
      Alert.alert("請輸入有效的學校電郵及密碼");
      return;
    }
    setSchoolLoading(true);
    const res = await signInWithPassword(schoolEmail.trim(), schoolPassword);
    setSchoolLoading(false);
    if (!res.ok)
      Alert.alert("登入失敗", res.error || "學校帳戶電郵或密碼不正確，如需協助請聯絡 cs@keeonz.ai");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Branding */}
          <Text style={styles.brand}>📜</Text>
          <Text style={styles.title}>DSE 文言文 MCQ</Text>
          <Text style={styles.subtitle}>專為香港中學文憑試考生而設的文言文練習平台</Text>

          <View style={{ height: spacing.xl }} />

          {/* Primary: OTP login */}
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

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Secondary: Guest + School — side by side */}
          <View style={styles.altRow}>
            <TouchableOpacity style={styles.altBtn} onPress={enterGuest}>
              <Text style={styles.altBtnIcon}>👀</Text>
              <Text style={styles.altBtnText}>訪客瀏覽</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.altBtn, activePanel === "school" && styles.altBtnActive]}
              onPress={() => togglePanel("school")}
            >
              <Text style={styles.altBtnIcon}>🏫</Text>
              <Text style={[styles.altBtnText, activePanel === "school" && { color: colors.primary }]}>
                學校平台登入
              </Text>
            </TouchableOpacity>
          </View>

          {/* School login panel */}
          {activePanel === "school" && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>學校平台帳戶登入</Text>
              <Text style={styles.panelSub}>適用於已訂閱學校服務計劃的帳戶</Text>
              <TextInput
                style={styles.input}
                placeholder="學校電郵 school@example.edu.hk"
                placeholderTextColor={colors.textMuted}
                value={schoolEmail}
                onChangeText={setSchoolEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.input, { marginTop: spacing.sm }]}
                placeholder="密碼"
                placeholderTextColor={colors.textMuted}
                value={schoolPassword}
                onChangeText={setSchoolPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.panelBtn, schoolLoading && { opacity: 0.6 }]}
                onPress={onSchoolLogin}
                disabled={schoolLoading}
              >
                {schoolLoading
                  ? <ActivityIndicator color={colors.background} size="small" />
                  : <Text style={styles.panelBtnText}>學校帳戶登入</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => nav.navigate("SchoolPartner")} style={styles.panelLink}>
                <Text style={styles.panelLinkText}>了解學校服務計劃 ›</Text>
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

          {/* T&C + Privacy footer */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>登入即表示同意 </Text>
            <TouchableOpacity onPress={() => nav.navigate("Legal", { type: "terms" })}>
              <Text style={styles.footerLink}>使用條款</Text>
            </TouchableOpacity>
            <Text style={styles.footerText}> 及 </Text>
            <TouchableOpacity onPress={() => nav.navigate("Legal", { type: "privacy" })}>
              <Text style={styles.footerLink}>私隱政策</Text>
            </TouchableOpacity>
          </View>

          {/* Password login — discreet, for Apple review only */}
          <TouchableOpacity onPress={() => togglePanel("password")} style={styles.pwToggle}>
            <Text style={styles.pwToggleText}>🔑 密碼登入</Text>
          </TouchableOpacity>

          {activePanel === "password" && (
            <View style={styles.pwPanel}>
              <TextInput
                style={styles.input}
                placeholder="電郵"
                placeholderTextColor={colors.textMuted}
                value={pwEmail}
                onChangeText={setPwEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.input, { marginTop: spacing.sm }]}
                placeholder="密碼"
                placeholderTextColor={colors.textMuted}
                value={pwPassword}
                onChangeText={setPwPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.panelBtn, { marginTop: spacing.sm }, pwLoading && { opacity: 0.6 }]}
                onPress={onPasswordLogin}
                disabled={pwLoading}
              >
                {pwLoading
                  ? <ActivityIndicator color={colors.background} size="small" />
                  : <Text style={styles.panelBtnText}>登入</Text>}
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: spacing.lg }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: spacing.lg, justifyContent: "center", paddingBottom: spacing.xl },
  brand: { fontSize: 64, textAlign: "center", marginBottom: spacing.md },
  title: { ...typography.title, color: colors.primary, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm },

  // Divider
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.textMuted, marginHorizontal: spacing.md },

  // Alt buttons row
  altRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  altBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  altBtnActive: { borderColor: colors.primary, backgroundColor: "rgba(212,162,76,0.08)" },
  altBtnIcon: { fontSize: 22 },
  altBtnText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", textAlign: "center" },

  // Shared panel
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  panelTitle: { ...typography.heading, color: colors.primary, fontWeight: "700" },
  panelSub: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  panelBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  panelBtnText: { ...typography.button, color: colors.background },
  panelLink: { alignItems: "center", paddingVertical: spacing.xs },
  panelLinkText: { ...typography.caption, color: colors.primary },

  // Password login (discreet)
  pwToggle: { alignItems: "center", paddingVertical: spacing.sm, marginTop: spacing.xs },
  pwToggleText: { ...typography.caption, color: colors.textMuted },
  pwPanel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },

  // Demo
  demoNote: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  demoBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  demoText: { ...typography.button, color: colors.accent },

  // Footer
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: spacing.xl,
  },
  footerText: { ...typography.caption, color: colors.textMuted },
  footerLink: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
});

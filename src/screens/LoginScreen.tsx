import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableOpacity, Alert, TextInput, ActivityIndicator, ScrollView, Linking,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import Icon from "../components/Icon";
import SealMark from "../components/SealMark";
import { AuthStackParamList } from "../navigation/types";

const THREADS_URL = "https://www.threads.com/@dse.manyuen?invite=0";

// Apple Review test account — DO NOT remove (used by App Store review team)
// Email: apple.review@dsemcq.app  |  Password: DSEMcq@Review2025
// Create this account via Supabase Auth Dashboard before submitting for review.

type Nav = NativeStackNavigationProp<AuthStackParamList, "Login">;

type Panel = "school" | "password" | null;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { signInWithEmail, signInWithPassword, signInWithApple, enterDemo, enterGuest, demoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

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

  const onAppleSignIn = async () => {
    const res = await signInWithApple();
    if (!res.ok) {
      if (res.error) Alert.alert("Apple 登入失敗", res.error);
      return;
    }
    if (res.needsRegister) {
      // Pass any name/email Apple provided so Register screen can pre-fill
      nav.navigate("Register", { email: res.appleEmail ?? "" });
    }
    // If not needsRegister, onAuthStateChange in AuthContext handles navigation automatically
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

  const onPromoTap = async () => {
    try {
      await Linking.openURL(THREADS_URL);
    } catch {
      Alert.alert("無法開啟連結", "請稍後再試，或手動前往 Threads 搜尋 @dse.manyuen");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Branding */}
          <View style={styles.brandWrap}>
            <SealMark char="文" size={64} />
          </View>
          <Text style={styles.title}>文淵 · DSE 中文 MCQ</Text>
          <Text style={styles.subtitle}>香港中學文憑試中文閱讀練習，靜心一題一題溫。</Text>

          <TouchableOpacity style={styles.promoCard} onPress={onPromoTap} activeOpacity={0.85}>
            <Text style={styles.promoTitle}>暑假溫書推廣優惠</Text>
            <Text style={styles.promoText}>輸入優惠碼即享兩個月免費學士版</Text>
            <Text style={styles.promoText}>追蹤我哋嘅 Threads 並私訊我哋，即可獲取優惠碼！</Text>
            <Text style={styles.promoLink}>點擊此橫幅前往 Threads</Text>
          </TouchableOpacity>

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

          {/* Apple Sign In — shown only on iOS when available; must be as prominent as other options */}
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={10}
              style={styles.appleBtn}
              onPress={onAppleSignIn}
            />
          )}

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Secondary: Guest + School — side by side */}
          <View style={styles.altRow}>
            <TouchableOpacity style={styles.altBtn} onPress={enterGuest}>
              <Icon name="eye-outline" size="md" color={colors.inkSoft} />
              <Text style={styles.altBtnText}>訪客瀏覽</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.altBtn, activePanel === "school" && styles.altBtnActive]}
              onPress={() => togglePanel("school")}
            >
              <Icon
                name="school-outline"
                size="md"
                color={activePanel === "school" ? colors.primary : colors.inkSoft}
              />
              <Text style={[styles.altBtnText, activePanel === "school" && { color: colors.primary }]}>
                學校登入
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
                <Icon name="play-circle-outline" size="sm" color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.demoText}>進入試讀模式</Text>
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
            <Icon name="key-outline" size="xs" color={colors.inkMuted} style={{ marginRight: 4 }} />
            <Text style={styles.pwToggleText}>以密碼登入</Text>
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
  brandWrap: { alignItems: "center", marginBottom: spacing.md },
  title: { ...typography.title, color: colors.ink, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.inkSoft, textAlign: "center", marginTop: spacing.sm },
  promoCard: {
    marginTop: spacing.md,
    backgroundColor: "rgba(178,58,46,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: 4,
  },
  promoTitle: {
    ...typography.heading,
    color: colors.primary,
    fontWeight: "800",
  },
  promoText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  promoLink: {
    ...typography.caption,
    color: colors.primary,
    textDecorationLine: "underline",
    marginTop: 2,
  },

  // Apple Sign In button
  appleBtn: {
    width: "100%",
    height: 50,
    marginTop: spacing.sm,
  },

  // Divider
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  dividerText: { ...typography.caption, color: colors.inkMuted, marginHorizontal: spacing.md },

  // Alt buttons row
  altRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  altBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    gap: 6,
  },
  altBtnActive: { borderColor: colors.primary, backgroundColor: "rgba(178,58,46,0.06)" },
  altBtnText: { ...typography.caption, color: colors.inkSoft, fontWeight: "600", textAlign: "center" },

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
  panelTitle: { ...typography.heading, color: colors.ink },
  panelSub: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.ink,
    ...typography.body,
  },
  panelBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  panelBtnText: { ...typography.button, color: colors.primaryOnDark },
  panelLink: { alignItems: "center", paddingVertical: spacing.xs },
  panelLinkText: { ...typography.caption, color: colors.primary },

  // Password login (discreet)
  pwToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, marginTop: spacing.xs },
  pwToggleText: { ...typography.caption, color: colors.inkMuted },
  pwPanel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },

  // Demo
  demoNote: { ...typography.caption, color: colors.inkMuted, textAlign: "center", marginTop: spacing.lg },
  demoBtn: { flexDirection: "row", padding: spacing.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  demoText: { ...typography.button, color: colors.primary },

  // Footer
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: spacing.xl,
  },
  footerText: { ...typography.caption, color: colors.inkMuted },
  footerLink: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
});

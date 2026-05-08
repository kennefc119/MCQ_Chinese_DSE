import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import { AuthStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AuthStackParamList, "Login">;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { signInWithEmail, enterDemo, demoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

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
  demoNote: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  demoBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  demoText: { ...typography.button, color: colors.accent },
  footer: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
});

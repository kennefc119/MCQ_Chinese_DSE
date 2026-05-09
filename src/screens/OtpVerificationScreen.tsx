import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import { AuthStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AuthStackParamList, "Otp">;
type Rt = RouteProp<AuthStackParamList, "Otp">;

export default function OtpVerificationScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { email } = route.params;
  const { verifyOtp, demoMode } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const onVerify = async () => {
    if (code.length !== 6) {
      Alert.alert("請輸入 6 位驗證碼");
      return;
    }
    setLoading(true);
    const res = await verifyOtp(email, code);
    setLoading(false);
    if (!res.ok) {
      Alert.alert("驗證失敗", res.error || "請重試");
      return;
    }
    if (res.needsRegister) {
      nav.replace("Register", { email });
    }
    // else: AuthContext sets user → root nav switches to Main
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={styles.title}>輸入驗證碼</Text>
          <Text style={styles.subtitle}>已寄至　{email}</Text>
          {demoMode && <Text style={styles.demoHint}>試讀模式　·　任意 6 位數字即可</Text>}
          <FormInput
            label="6 位驗證碼"
            placeholder="● ● ● ● ● ●"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            style={{ fontSize: 22, letterSpacing: 8, textAlign: "center" }}
          />
          <Button title="驗證" onPress={onVerify} loading={loading} />
          <Button title="返回" variant="ghost" onPress={() => nav.goBack()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  title: { ...typography.display, color: colors.ink, textAlign: "center", marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.inkSoft, textAlign: "center", marginBottom: spacing.lg },
  demoHint: { ...typography.caption, color: colors.warning, textAlign: "center", marginBottom: spacing.md },
});

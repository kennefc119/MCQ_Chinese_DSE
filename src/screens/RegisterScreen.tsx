import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import { AuthStackParamList } from "../navigation/types";
import { Gender } from "../types/database";

type Rt = RouteProp<AuthStackParamList, "Register">;

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "other", label: "其他／不公開" },
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

export default function RegisterScreen() {
  const route = useRoute<Rt>();
  const { registerProfile } = useAuth();
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<Gender>("other");
  const [dseYear, setDseYear] = useState<number>(currentYear + 1);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (username.trim().length < 2) {
      Alert.alert("暱稱需至少 2 個字");
      return;
    }
    setLoading(true);
    const res = await registerProfile({ username: username.trim(), gender, dse_year: dseYear });
    setLoading(false);
    if (!res.ok) Alert.alert("註冊失敗", res.error || "請重試");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>建立你的學生檔案</Text>
        <Text style={styles.subtitle}>{route.params.email}</Text>

        <FormInput label="暱稱" placeholder="如：小文" value={username} onChangeText={setUsername} maxLength={20} />

        <Text style={styles.fieldLabel}>性別</Text>
        <View style={styles.row}>
          {GENDERS.map((g) => (
            <TouchableOpacity
              key={g.value}
              onPress={() => setGender(g.value)}
              style={[styles.chip, gender === g.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>預計應考 DSE 年份</Text>
        <View style={styles.row}>
          {YEARS.map((y) => (
            <TouchableOpacity key={y} onPress={() => setDseYear(y)} style={[styles.chip, dseYear === y && styles.chipActive]}>
              <Text style={[styles.chipText, dseYear === y && styles.chipTextActive]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: spacing.lg }} />
        <Button title="完成註冊" onPress={onSubmit} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  title: { ...typography.title, color: colors.primary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", marginBottom: spacing.sm, marginTop: spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.body, color: colors.textPrimary },
  chipTextActive: { color: "#1A1208", fontWeight: "700" },
});

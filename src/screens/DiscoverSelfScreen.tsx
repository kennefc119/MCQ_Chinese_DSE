import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { PsychTest } from "../types/database";
import { listPsychTests } from "../lib/dataService";
import { AppStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<AppStackParamList>;

const PSYCH_ICON_MAP: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  "person.fill.questionmark": "help-circle",
  "books.vertical.fill": "library",
  "graduationcap.fill": "school",
};

export default function DiscoverSelfScreen() {
  const nav = useNavigation<Nav>();
  const [tests, setTests] = useState<PsychTest[]>([]);
  useEffect(() => { listPsychTests().then(setTests); }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>認識自己</Text>
        <Text style={styles.subtitle}>輕鬆小測驗　・　了解學習風格與職涯傾向</Text>
      </View>
      <FlatList
        data={tests}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => nav.navigate("PsychTest", { testId: item.id })}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={PSYCH_ICON_MAP[item.icon_name] ?? "sparkles"}
                size={24}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <Text style={styles.cardMeta}>📝 {item.question_count} 題　・　⏱ 約 {item.estimated_minutes} 分鐘</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md },
  title: { ...typography.title, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  card: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.md,
  },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardDesc: { color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
});

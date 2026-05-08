import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { Passage } from "../types/database";
import { listPassages } from "../lib/dataService";
import { AppStackParamList } from "../navigation/types";
import LoadingScreen from "../components/LoadingScreen";

type Rt = RouteProp<AppStackParamList, "PassageView">;

export default function PassageViewScreen() {
  const { passageId } = useRoute<Rt>().params;
  const [passage, setPassage] = useState<Passage | null>(null);
  useEffect(() => {
    listPassages().then((all) => setPassage(all.find((p) => p.id === passageId) || null));
  }, [passageId]);
  if (!passage) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>{passage.title}</Text>
        {(passage.author || passage.dynasty) && (
          <Text style={styles.meta}>
            {passage.dynasty ?? ""}{passage.author ? `　・　${passage.author}` : ""}
          </Text>
        )}
        {passage.summary && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>篇章大意</Text>
            <Text style={styles.summaryText}>{passage.summary}</Text>
          </View>
        )}
        <Text style={styles.body}>{passage.body}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primary, marginBottom: spacing.xs },
  meta: { color: colors.textSecondary, marginBottom: spacing.md },
  summaryBox: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { color: colors.accent, fontWeight: "700", marginBottom: 4 },
  summaryText: { color: colors.textSecondary, lineHeight: 22 },
  body: { color: colors.textPrimary, fontSize: 17, lineHeight: 32 },
});

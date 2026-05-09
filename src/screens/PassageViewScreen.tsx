import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme";
import { Passage } from "../types/database";
import { listPassages } from "../lib/dataService";
import { AppStackParamList } from "../navigation/types";
import LoadingScreen from "../components/LoadingScreen";
import InkDivider from "../components/InkDivider";
import SealMark from "../components/SealMark";

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
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>{passage.title}</Text>
          {(passage.author || passage.dynasty) && (
            <Text style={styles.meta}>
              {passage.dynasty ?? ""}{passage.author ? `　·　${passage.author}` : ""}
            </Text>
          )}
        </View>

        <InkDivider style={{ marginVertical: spacing.md }} />

        {passage.summary && (
          <View style={styles.summaryBox}>
            <View style={styles.summaryHeader}>
              <SealMark char="意" size={28} />
              <Text style={styles.summaryTitle}>篇章大意</Text>
            </View>
            <Text style={styles.summaryText}>{passage.summary}</Text>
          </View>
        )}

        <Text style={styles.body}>{passage.body}</Text>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg },
  headerBlock: { alignItems: "flex-start" },
  title: { ...typography.display, color: colors.ink, marginBottom: spacing.xs },
  meta: { ...typography.caption, color: colors.inkMuted, letterSpacing: 1 },
  summaryBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  summaryTitle: { ...typography.subheading, color: colors.ink },
  summaryText: { ...typography.body, color: colors.inkSoft, lineHeight: 24 },
  body: {
    fontFamily: typography.heading.fontFamily,
    color: colors.ink,
    fontSize: 19,
    lineHeight: 36,
    letterSpacing: 0.3,
  },
});

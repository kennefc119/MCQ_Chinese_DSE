import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import ContentContainer from "../components/ContentContainer";
import Button from "../components/Button";
import { colors, spacing, typography } from "../theme";
import { AppStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { getDeviceId, getPlatform, logVisitEvent } from "../lib/adminService";

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function AiNotesComingSoonScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const deviceId = await getDeviceId();
        if (cancelled) return;
        await logVisitEvent({
          deviceId,
          userId: user?.id ?? null,
          platform: getPlatform(),
          eventType: "ai_notes_coming_soon_open",
        });
      } catch {
        // Analytics should never block UI.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const goSubscription = async () => {
    try {
      const deviceId = await getDeviceId();
      await logVisitEvent({
        deviceId,
        userId: user?.id ?? null,
        platform: getPlatform(),
        eventType: "ai_notes_coming_soon_subscription_cta",
      });
    } catch {
      // Analytics should never block navigation.
    }
    nav.navigate("Subscription");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ContentContainer>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles-outline" size={34} color={colors.primary} />
          </View>
          <Text style={styles.eyebrow}>學士版功能預告</Text>
          <Text style={styles.title}>個人化AI筆記 即將推出</Text>

        <Text style={styles.message}>
            我們正打造「AI個人化筆記」功能。系統將深度分析歷史答題紀錄，評估強弱項，並結合最新考評趨勢、核心筆記與MC錯題庫，進行多維度數據整合。
                    </Text>
        <Text style={styles.message}>
            正式推出後，此功能將開放給學士版會員優先使用。
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>搶先成為學士版會員</Text>
            <Text style={styles.cardBody}>
              立即查看訂閱方案，正式上線後可第一時間解鎖 AI筆記。
            </Text>
            <Button title="查看學士版訂閱" onPress={() => void goSubscription()} />
          </View>
        </View>
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
    fontSize: 28,
    lineHeight: 36,
  },
  message: {
    ...typography.body,
    color: colors.inkSoft,
    lineHeight: 24,
  },
  card: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.subheading,
    color: colors.ink,
  },
  cardBody: {
    ...typography.body,
    color: colors.inkSoft,
    marginBottom: spacing.xs,
  },
});
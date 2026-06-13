/**
 * ForceUpdateScreen — full-screen blocker shown when the installed binary
 * version is below the admin-configured minimum.
 *
 * The screen is NOT dismissable. The only action available is opening the
 * appropriate app store page.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme";

// ── Store URLs ───────────────────────────────────────────────────────────────
// Update these once you have the live store listings.
const IOS_STORE_URL = "https://apps.apple.com/app/id6746878669";
const ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.wenyan.dsemcq";

interface Props {
  currentVersion: string;
  minVersion: string;
}

export default function ForceUpdateScreen({ currentVersion, minVersion }: Props) {
  const storeUrl = Platform.OS === "ios" ? IOS_STORE_URL : ANDROID_STORE_URL;

  const openStore = () => {
    Linking.openURL(storeUrl).catch(() => {
      // Fallback: open a generic search if the URL scheme fails
      Linking.openURL(
        Platform.OS === "ios"
          ? "https://apps.apple.com"
          : "https://play.google.com/store"
      );
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />

        <Text style={styles.emoji}>🔄</Text>
        <Text style={styles.title}>需要更新應用程式</Text>
        <Text style={styles.body}>
          您目前使用的版本（{currentVersion}）已過期。{"\n"}
          請更新至最新版本（{minVersion} 或以上）{"\n"}
          以繼續使用文淵 DSE。
        </Text>

        <TouchableOpacity style={styles.btn} onPress={openStore} activeOpacity={0.85}>
          <Text style={styles.btnText}>立即更新</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          前往 {Platform.OS === "ios" ? "App Store" : "Google Play"} 下載最新版本
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 20,
    marginBottom: spacing.sm,
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.md,
    minWidth: 200,
    alignItems: "center",
  },
  btnText: {
    ...typography.bodyEmphasis,
    color: colors.primaryOnDark,
    fontSize: 17,
  },
  hint: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});

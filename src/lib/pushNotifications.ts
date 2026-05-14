/**
 * pushNotifications.ts — Expo push registration + permission helpers.
 *
 * Call `registerForPushNotifications(userId)` after the user logs in.
 * It will:
 *   1. Request notification permissions (no-op if already granted)
 *   2. Fetch the Expo push token
 *   3. Upsert it into dsemcq_push_tokens for the given user
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { upsertPushToken } from "./adminService";

// Foreground notification handler — show banner + play sound when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<{
  ok: boolean;
  token?: string;
  reason?: string;
}> {
  if (!Device.isDevice) {
    return { ok: false, reason: "Not a physical device" };
  }

  try {
    // Android: ensure a default channel exists
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return { ok: false, reason: "Permission not granted" };
    }

    const projectId =
      (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants?.easConfig as { projectId?: string } | undefined)?.projectId;
    if (!projectId) {
      return { ok: false, reason: "EAS projectId not configured" };
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (!token) return { ok: false, reason: "Empty push token" };

    await upsertPushToken(userId, token, Platform.OS);
    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

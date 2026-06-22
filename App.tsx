import React, { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, NotoSerifTC_400Regular, NotoSerifTC_700Bold } from "@expo-google-fonts/noto-serif-tc";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { configureRevenueCat } from "./src/lib/revenueCat";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase";

// Initialise RevenueCat once at module load, before any component renders.
configureRevenueCat();

export default function App() {
  useFonts({
    NotoSerifTC_400Regular,
    NotoSerifTC_700Bold,
  });

  // Single root handler for auth refresh and long-background recovery.
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const RELOAD_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

    supabase.auth.startAutoRefresh();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;

      if (next === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }

      if (next === "background" || next === "inactive") {
        if (backgroundedAt.current == null) {
          backgroundedAt.current = Date.now();
        }
        return;
      }

      if (next === "active" && (prev === "background" || prev === "inactive")) {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since != null && Date.now() - since >= RELOAD_AFTER_BACKGROUND_MS) {
          if (Updates.isEnabled) {
            Updates.reloadAsync().catch(() => {});
          }
        }
      }
    });

    return () => {
      sub.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import React, { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  NotoSerifTC_400Regular,
  NotoSerifTC_700Bold,
} from "@expo-google-fonts/noto-serif-tc";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import LoadingScreen from "./src/components/LoadingScreen";
import { configureRevenueCat } from "./src/lib/revenueCat";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase";

// Keep the native splash screen visible until we're ready to render.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialise RevenueCat once at module load, before any component renders.
configureRevenueCat();

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSerifTC_400Regular,
    NotoSerifTC_700Bold,
  });

  // Font-loading safety: if fonts fail to download (e.g. no network on first
  // install), fontsLoaded stays false forever → infinite spinner.  After 5 s
  // we proceed without custom fonts so the user isn't stuck.
  const [fontTimeout, setFontTimeout] = React.useState(false);
  React.useEffect(() => {
    if (fontsLoaded) return;
    const id = setTimeout(() => setFontTimeout(true), 5000);
    return () => clearTimeout(id);
  }, [fontsLoaded]);

  const ready = fontsLoaded || fontTimeout;

  // Hide the native splash screen once fonts are ready (or timed out).
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  // ── Centralised Supabase auth refresh ───────────────────────────────────
  // The SDK's internal auto-refresh timer stops when iOS/Android freezes
  // the JS thread in the background.  startAutoRefresh / stopAutoRefresh
  // tell the SDK when the app is active so it can resume / pause correctly.
  const lastBackground = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.startAutoRefresh();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
        lastBackground.current = Date.now();
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
          {ready ? <RootNavigator /> : <LoadingScreen />}
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

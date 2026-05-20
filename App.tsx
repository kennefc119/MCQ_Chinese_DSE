import React from "react";
import { StatusBar } from "expo-status-bar";
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

// Initialise RevenueCat once at module load, before any component renders.
configureRevenueCat();

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSerifTC_400Regular,
    NotoSerifTC_700Bold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          {fontsLoaded ? <RootNavigator /> : <LoadingScreen />}
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

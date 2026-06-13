import React from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import LoadingScreen from "../components/LoadingScreen";
import ForceUpdateScreen from "../components/ForceUpdateScreen";
import AuthStack from "./AuthStack";
import AppStack from "./AppStack";
import { colors } from "../theme";
import { useForceUpdate } from "../hooks/useForceUpdate";

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    primary: colors.primary,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootNavigator() {
  const { user, loading, isGuest } = useAuth();
  const { checking, required, currentVersion, minVersion } = useForceUpdate();

  if (loading || checking) return <LoadingScreen />;
  if (required) return <ForceUpdateScreen currentVersion={currentVersion} minVersion={minVersion} />;
  return (
    <NavigationContainer theme={navTheme}>
      {user || isGuest ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

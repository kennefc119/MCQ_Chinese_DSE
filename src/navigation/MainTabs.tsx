import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MainTabsParamList } from "./types";
import { colors } from "../theme";
import ExploreScreen from "../screens/ExploreScreen";
import CalendarScreen from "../screens/CalendarScreen";
import AdvisorChatScreen from "../screens/AdvisorChatScreen";
import DiscoverSelfScreen from "../screens/DiscoverSelfScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator<MainTabsParamList>();

const icon = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>
);

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 84,
          paddingBottom: 24,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="Explore" component={ExploreScreen} options={{ title: "探索", tabBarIcon: icon("📚") }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: "日曆", tabBarIcon: icon("📅") }} />
      <Tab.Screen name="Advisor" component={AdvisorChatScreen} options={{ title: "顧問", tabBarIcon: icon("🎓") }} />
      <Tab.Screen name="Discover" component={DiscoverSelfScreen} options={{ title: "認識自己", tabBarIcon: icon("✨") }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "我的", tabBarIcon: icon("👤") }} />
    </Tab.Navigator>
  );
}

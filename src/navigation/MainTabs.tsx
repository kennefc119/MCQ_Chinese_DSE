import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { MainTabsParamList } from "./types";
import { colors } from "../theme";
import ExploreScreen from "../screens/ExploreScreen";
import CalendarScreen from "../screens/CalendarScreen";
import AdvisorChatScreen from "../screens/AdvisorChatScreen";
import DiscoverSelfScreen from "../screens/DiscoverSelfScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AdminHubScreen from "../screens/AdminHubScreen";
import AiNotesComingSoonScreen from "../screens/AiNotesComingSoonScreen";
import { useAuth } from "../context/AuthContext";

const Tab = createBottomTabNavigator<MainTabsParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const tabIcon =
  (outline: IoniconName, filled: IoniconName) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? filled : outline} size={focused ? 26 : 22} color={color} />
  );

const advisorTabIcon = ({ focused, color }: { focused: boolean; color: string }) => (
  <View style={styles.advisorIconWrap}>
    <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={focused ? 26 : 22} color={color} />
    <View style={styles.newBadge}>
      <Text style={styles.newBadgeText}>NEW</Text>
    </View>
  </View>
);

export default function MainTabs() {
  const { isAdmin } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
      }}
    >
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{ title: "探索", tabBarIcon: tabIcon("compass-outline", "compass") }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: "日課", tabBarIcon: tabIcon("calendar-outline", "calendar") }}
      />
      <Tab.Screen
        name="Advisor"
        component={AdvisorChatScreen}
        options={{ title: "請教", tabBarIcon: advisorTabIcon }}
      />
      <Tab.Screen
        name="Notes"
        component={AiNotesComingSoonScreen}
        options={{ title: "AI筆記", tabBarIcon: tabIcon("document-text-outline", "document-text") }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverSelfScreen}
        options={{ title: "識己", tabBarIcon: tabIcon("sparkles-outline", "sparkles") }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "我", tabBarIcon: tabIcon("person-outline", "person") }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminHubScreen}
          options={{ title: "管理", tabBarIcon: tabIcon("shield-outline", "shield") }}
        />
      )}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  advisorIconWrap: { width: 34, height: 30, alignItems: "center", justifyContent: "center" },
  newBadge: { position: "absolute", top: -3, right: -10, minWidth: 25, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.surface },
  newBadgeText: { color: "#FFFFFF", fontSize: 7, fontWeight: "800", letterSpacing: 0.3 },
});

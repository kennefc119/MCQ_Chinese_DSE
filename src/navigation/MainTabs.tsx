import React from "react";
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
import { useAuth } from "../context/AuthContext";

const Tab = createBottomTabNavigator<MainTabsParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// Tab icons use Ionicons with paired outline / filled variants. Active state
// fills the icon and tints it cinnabar — focus is communicated by weight, not
// just colour, so the bar reads cleanly even in glance-mode.
const tabIcon =
  (outline: IoniconName, filled: IoniconName) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? filled : outline} size={focused ? 26 : 22} color={color} />
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
        options={{ title: "請教", tabBarIcon: tabIcon("chatbubbles-outline", "chatbubbles") }}
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

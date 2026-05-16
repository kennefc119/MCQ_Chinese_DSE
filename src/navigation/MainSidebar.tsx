import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { createDrawerNavigator, DrawerContentComponentProps } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { useAuth } from "../context/AuthContext";
import { MainTabsParamList } from "./types";
import ExploreScreen from "../screens/ExploreScreen";
import CalendarScreen from "../screens/CalendarScreen";
import AdvisorChatScreen from "../screens/AdvisorChatScreen";
import DiscoverSelfScreen from "../screens/DiscoverSelfScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AdminHubScreen from "../screens/AdminHubScreen";

const Drawer = createDrawerNavigator<MainTabsParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const NAV_ITEMS: {
  name: keyof MainTabsParamList;
  label: string;
  outline: IoniconName;
  filled: IoniconName;
}[] = [
  { name: "Explore",  label: "探索", outline: "compass-outline",     filled: "compass"     },
  { name: "Calendar", label: "日課", outline: "calendar-outline",    filled: "calendar"    },
  { name: "Advisor",  label: "請教", outline: "chatbubbles-outline", filled: "chatbubbles" },
  { name: "Discover", label: "識己", outline: "sparkles-outline",    filled: "sparkles"    },
  { name: "Profile",  label: "我",   outline: "person-outline",      filled: "person"      },
];

function SidebarContent({ state, navigation }: DrawerContentComponentProps) {
  const { isAdmin } = useAuth();
  const activeRouteName = state.routes[state.index]?.name;

  const items = isAdmin
    ? [...NAV_ITEMS, { name: "Admin" as keyof MainTabsParamList, label: "管理", outline: "shield-outline" as IoniconName, filled: "shield" as IoniconName }]
    : NAV_ITEMS;

  return (
    <View style={styles.sidebar}>
      {/* App wordmark */}
      <View style={styles.wordmark}>
        <Text style={styles.wordmarkText}>文淵</Text>
        <Text style={styles.wordmarkSub}>DSE</Text>
      </View>

      <View style={styles.hairline} />

      <ScrollView showsVerticalScrollIndicator={false} style={styles.navList}>
        {items.map((item) => {
          const active = activeRouteName === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => navigation.navigate(item.name as string)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={active ? item.filled : item.outline}
                size={active ? 22 : 20}
                color={active ? colors.primary : colors.inkMuted}
                style={styles.navIcon}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                {item.label}
              </Text>
              {active && <View style={styles.activeBar} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.hairline} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>文淵書院</Text>
      </View>
    </View>
  );
}

export default function MainSidebar() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <SidebarContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "permanent",
        drawerStyle: styles.drawerPanel,
        sceneStyle: { backgroundColor: colors.background },
        overlayColor: "transparent",
      }}
    >
      <Drawer.Screen name="Explore"  component={ExploreScreen}     />
      <Drawer.Screen name="Calendar" component={CalendarScreen}    />
      <Drawer.Screen name="Advisor"  component={AdvisorChatScreen} />
      <Drawer.Screen name="Discover" component={DiscoverSelfScreen}/>
      <Drawer.Screen name="Profile"  component={ProfileScreen}     />
      <Drawer.Screen name="Admin"    component={AdminHubScreen}    />
    </Drawer.Navigator>
  );
}

const SIDEBAR_WIDTH = 220;

const styles = StyleSheet.create({
  drawerPanel: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
  },
  sidebar: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  wordmark: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  wordmarkText: {
    fontSize: 22,
    fontFamily: "NotoSerifTC_700Bold",
    color: colors.primary,
    letterSpacing: 2,
  },
  wordmarkSub: {
    fontSize: 13,
    fontFamily: "NotoSerifTC_400Regular",
    color: colors.inkMuted,
    letterSpacing: 1,
  },
  hairline: {
    height: 1,
    backgroundColor: colors.hairline,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  navList: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 8,
    marginHorizontal: spacing.sm,
    marginVertical: 1,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: colors.surfaceAlt,
  },
  navIcon: {
    width: 26,
  },
  navLabel: {
    fontSize: 15,
    fontFamily: "NotoSerifTC_400Regular",
    color: colors.inkMuted,
    marginLeft: spacing.sm,
    flex: 1,
  },
  navLabelActive: {
    color: colors.primary,
    fontFamily: "NotoSerifTC_700Bold",
  },
  activeBar: {
    position: "absolute",
    right: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  footerText: {
    fontSize: 11,
    color: colors.inkMuted,
    fontFamily: "NotoSerifTC_400Regular",
    letterSpacing: 1,
  },
});

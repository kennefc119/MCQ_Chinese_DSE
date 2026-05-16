import React from "react";
import MainTabs from "./MainTabs";

// MainTabs handles both phone (bottom bar) and iPad (left sidebar)
// via tabBarPosition — no Reanimated/drawer required.
export default function MainLayout() {
  return <MainTabs />;
}

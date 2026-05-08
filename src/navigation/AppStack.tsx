import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AppStackParamList } from "./types";
import MainTabs from "./MainTabs";
import QuizDetailScreen from "../screens/QuizDetailScreen";
import QuizRunnerScreen from "../screens/QuizRunnerScreen";
import QuizResultScreen from "../screens/QuizResultScreen";
import PsychTestRunnerScreen from "../screens/PsychTestRunnerScreen";
import InboxScreen from "../screens/InboxScreen";
import SubscriptionScreen from "../screens/SubscriptionScreen";
import PassageViewScreen from "../screens/PassageViewScreen";
import AdminHubScreen from "../screens/AdminHubScreen";

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#15110D" } }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="QuizDetail" component={QuizDetailScreen} options={{ presentation: "card" }} />
      <Stack.Screen name="QuizRunner" component={QuizRunnerScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="PsychTest" component={PsychTestRunnerScreen} />
      <Stack.Screen name="Inbox" component={InboxScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="PassageView" component={PassageViewScreen} />
      <Stack.Screen name="Admin" component={AdminHubScreen} />
    </Stack.Navigator>
  );
}

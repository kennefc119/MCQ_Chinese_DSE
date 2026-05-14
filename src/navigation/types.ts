// Navigation type definitions
import { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  Otp: { email: string };
  Register: { email: string };
  Legal: { type: "terms" | "privacy" };
  SchoolPartner: undefined;
};

export type MainTabsParamList = {
  Explore: undefined;
  Calendar: undefined;
  Advisor: { initialMessage?: string } | undefined;
  Discover: undefined;
  Profile: undefined;
  Admin: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<MainTabsParamList>;
  QuizDetail: { quizId: string };
  QuizRunner: { quizId: string; attemptId: string };
  QuizResult: { attemptId: string; quizId: string; attemptSnapshot?: string };
  PsychTest: { testId: string };
  PsychResult: { testId: string; resultCode: string };
  Inbox: undefined;
  Subscription: undefined;
  PassageView: { passageId: string };
  Admin: undefined;
  AdminUserDetail: { userId: string };
  PointHistory: undefined;
  StudyHistory: undefined;
  Legal: { type: "terms" | "privacy" };
  SchoolPartner: undefined;
};

export type RootStackParamList = AuthStackParamList & AppStackParamList;

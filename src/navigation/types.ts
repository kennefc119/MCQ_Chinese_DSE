// Navigation type definitions
import { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  Otp: { email: string };
  Register: { email: string };
};

export type MainTabsParamList = {
  Explore: undefined;
  Calendar: undefined;
  Advisor: { initialMessage?: string } | undefined;
  Discover: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<MainTabsParamList>;
  QuizDetail: { quizId: string };
  QuizRunner: { quizId: string; attemptId: string };
  QuizResult: { attemptId: string; quizId: string };
  PsychTest: { testId: string };
  PsychResult: { testId: string; resultCode: string };
  Inbox: undefined;
  Subscription: undefined;
  PassageView: { passageId: string };
  Admin: undefined;
  PointHistory: undefined;
  StudyHistory: undefined;
};

export type RootStackParamList = AuthStackParamList & AppStackParamList;

import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "DSE 文言文 MCQ",
  slug: "dsemcq",
  version: "1.0.0",
  scheme: "dsemcq",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.dsemcq.app",
    infoPlist: {
      CFBundleURLTypes: [{ CFBundleURLSchemes: ["dsemcq"] }],
    },
  },
  android: {
    package: "com.dsemcq.app",
    intentFilters: [
      {
        action: "VIEW",
        data: [{ scheme: "dsemcq" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-font",
    "expo-secure-store",
    "react-native-reanimated",
    [
      "expo-build-properties",
      {
        ios: {
          extraBuildSettings: {
            SWIFT_STRICT_CONCURRENCY: "minimal",
          },
        },
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    advisorBotName: process.env.DSE_ADVISOR_BOT_NAME ?? "DSE 中文顧問",
  },
});

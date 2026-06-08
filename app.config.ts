import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "文淵DSE",
  slug: "dsemcq",
  version: "1.0.3",
  scheme: "dsemcq",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.dsemcq.app",
    infoPlist: {
      CFBundleURLTypes: [{ CFBundleURLSchemes: ["dsemcq"] }],
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
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
    "expo-notifications",
    "expo-apple-authentication",
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
    ...(config.extra ?? {}),
    eas: {
      ...((config.extra as { eas?: { projectId?: string } } | undefined)?.eas ?? {}),
      projectId:
        process.env.EAS_PROJECT_ID ??
        ((config.extra as { eas?: { projectId?: string } } | undefined)?.eas
          ?.projectId ??
          "87201f3e-7338-4afd-9c28-0da2bde040e2"),
    },
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    advisorBotName: process.env.DSE_ADVISOR_BOT_NAME ?? "文淵書僮",
    // Optional: direct FastAPI base URL (only used if you bypass the Edge Function).
    // Production should leave this empty and rely on the dsemcq-mcq-proxy edge function.
    generatorUrl: process.env.EXPO_PUBLIC_GENERATOR_URL ?? "",
  },
});

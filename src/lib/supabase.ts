import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("your-project")
);

if (!isSupabaseConfigured) {
  console.warn(
    "[dsemcq] Supabase 未設定 — 應用將以離線示範模式運行。請在 .env 中設定 SUPABASE_URL 與 SUPABASE_ANON_KEY。"
  );
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Keep ordinary requests short after background resume, but allow the advisor
// worker enough time to finish writing its durable reply row.
const fetchWithTimeout: typeof fetch = (url, init) => {
  const controller = new AbortController();
  const timeoutMs = String(url).includes("/functions/v1/dsemcq-advisor-chat")
    ? 90_000
    : 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
};

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  }
);

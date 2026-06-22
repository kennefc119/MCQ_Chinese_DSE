import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import { Profile, Gender } from "../types/database";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { logLogin, logVisit, getDeviceId, getPlatform } from "../lib/adminService";
import { registerForPushNotifications } from "../lib/pushNotifications";
import { rcLogIn, rcLogOut, checkPremiumEntitlement } from "../lib/revenueCat";

const PROFILE_KEY = "dsemcq_profile";

// ── Apple Sign-In nonce helpers ─────────────────────────────────────────────
// Supabase requires a nonce to verify Apple id_tokens. We generate a random
// raw nonce, SHA-256 hash it (using Hermes's built-in Web Crypto API), pass
// the *hashed* version to Apple and the *raw* version to Supabase.
const generateRawNonce = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(random)
    .map((b) => chars[b % chars.length])
    .join("");
};

const sha256Hex = async (str: string): Promise<string> => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  isSupabaseReady: boolean;
  isGuest: boolean;
  /** True when user.role === 'admin'. */
  isAdmin: boolean;
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ ok: boolean; needsRegister: boolean; error?: string }>;
  registerProfile: (data: { username: string; gender: Gender; dse_year: number }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signInWithApple: () => Promise<{ ok: boolean; needsRegister: boolean; appleFullName?: string; appleEmail?: string; error?: string }>;
  /** demo mode flag for offline preview */
  demoMode: boolean;
  enterDemo: () => Promise<void>;
  enterGuest: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_PROFILE: Profile = {
  id: "demo-user",
  email: "demo@dsemcq.app",
  username: "示範用戶",
  gender: "other",
  dse_year: new Date().getFullYear() + 1,
  wenyuan_points: 25,
  role: "user",
  subscription_tier: "free",
  subscription_status: "active",
  created_at: new Date().toISOString(),
};

const GUEST_PROFILE: Profile = {
  id: "guest-user",
  email: "guest@dsemcq.app",
  username: "訪客",
  gender: "other",
  dse_year: new Date().getFullYear() + 1,
  wenyuan_points: 0,
  role: "user",
  subscription_tier: "free",
  subscription_status: "active",
  created_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Offline / demo mode: restore profile from SecureStore only
      SecureStore.getItemAsync(PROFILE_KEY)
        .then((cached) => { if (cached) setUser(JSON.parse(cached)); })
        .catch(() => {})
        .finally(() => {
          setLoading(false);
          setIsSupabaseReady(true);
        });
      return;
    }

    let settled = false;
    let authSettled = false;

    const settle = () => {
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    };

    const settleAuth = () => {
      if (!authSettled) {
        authSettled = true;
        setIsSupabaseReady(true);
      }
    };

    // Safety valve for stalled auth restore/profile fetch.
    const deadline = setTimeout(async () => {
      try {
        const cached = await SecureStore.getItemAsync(PROFILE_KEY).catch(() => null);
        if (cached) setUser(JSON.parse(cached));
      } catch {}
      settle();
      settleAuth();
    }, 4000);

    // Phase 1: restore cached profile and release UI loading early.
    SecureStore.getItemAsync(PROFILE_KEY)
      .then((cached) => {
        if (!cached) return;
        try {
          setUser(JSON.parse(cached));
        } catch {}
        settle();
      })
      .catch(() => {});

    // INITIAL_SESSION is the readiness boundary for authenticated queries.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session?.user) {
          try {
            const { data: profile } = await supabase
              .from("dsemcq_profiles")
              .select("*")
              .eq("id", session.user.id)
              .maybeSingle();
            if (profile) {
              await persist(profile as Profile);
              void syncSubscription(session.user.id, profile as Profile);
            }
          } catch {
            // Keep cached profile if network/profile lookup fails.
          }
        } else {
          setIsGuest((g) => {
            if (!g) setUser(null);
            return g;
          });
          SecureStore.deleteItemAsync(PROFILE_KEY).catch(() => {});
        }
        settle();
        settleAuth();
        clearTimeout(deadline);
        return;
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        try {
          const { data: profile } = await supabase
            .from("dsemcq_profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          if (profile) {
            await persist(profile as Profile);
          }
        } catch {
          // Ignore refresh/profile failures silently.
        }
      }

      if (event === "SIGNED_OUT") {
        setIsGuest((g) => {
          if (!g) setUser(null);
          return g;
        });
        SecureStore.deleteItemAsync(PROFILE_KEY).catch(() => {});
      }
    });

    return () => {
      clearTimeout(deadline);
      subscription.unsubscribe();
    };
  }, []);

  const persist = async (p: Profile | null) => {
    setUser(p);
    if (p) await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(p));
    else await SecureStore.deleteItemAsync(PROFILE_KEY);
  };

  /**
   * Checks the user's Apple subscription status via RevenueCat and syncs it
   * back to Supabase + local state when we can positively confirm premium.
   *
   * IMPORTANT:
   * - Do NOT auto-downgrade in app on login/reinstall.
   * - Downgrade/reset should only happen via server-side unsubscribe handling
   *   (Apple/RevenueCat webhook) or manual admin operation.
   */
  const syncSubscription = async (userId: string, currentProfile: Profile) => {
    try {
      await rcLogIn(userId);
      const isPremium = await checkPremiumEntitlement();

      // Only upgrade/activate when entitlement is positively present.
      // Never downgrade here.
      if (!isPremium) return;

      if (currentProfile.subscription_tier !== "premium" || currentProfile.subscription_status !== "active") {
        const patch = {
          subscription_tier: "premium" as const,
          subscription_status: "active" as Profile["subscription_status"],
        };
        if (isSupabaseConfigured) {
          await supabase.from("dsemcq_profiles").update(patch).eq("id", userId);
        }
        await persist({ ...currentProfile, ...patch });
      }
    } catch {
      // Never block login flow or force tier changes on transient RC/network errors.
    }
  };

  const signInWithEmail = async (email: string) => {
    setPendingEmail(email);
    if (!isSupabaseConfigured) return { ok: true };
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const verifyOtp = async (email: string, code: string) => {
    if (!isSupabaseConfigured) {
      // demo: any 6-digit code works → mark needs register if no user
      if (code.length !== 6) return { ok: false, needsRegister: false, error: "驗證碼必須為 6 位數字" };
      setPendingEmail(email);
      return { ok: true, needsRegister: true };
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.user) return { ok: false, needsRegister: false, error: error?.message || "驗證失敗" };
    const { data: profile } = await supabase
      .from("dsemcq_profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) return { ok: true, needsRegister: true };
    await persist(profile as Profile);
    void logLogin(data.user.id, getPlatform());
    void registerForPushNotifications(data.user.id);
    void syncSubscription(data.user.id, profile as Profile);
    return { ok: true, needsRegister: false };
  };

  const registerProfile = async (data: { username: string; gender: Gender; dse_year: number }) => {
    const email = pendingEmail || "demo@dsemcq.app";
    if (!isSupabaseConfigured) {
      const newProfile: Profile = {
        ...DEMO_PROFILE,
        email,
        username: data.username,
        gender: data.gender,
        dse_year: data.dse_year,
        wenyuan_points: 0,
      };
      await persist(newProfile);
      return { ok: true };
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return { ok: false, error: "未登入" };
    const profile: Profile = {
      id: u.user.id,
      email,
      username: data.username,
      gender: data.gender,
      dse_year: data.dse_year,
      wenyuan_points: 0,
      role: "user",
      subscription_tier: "free",
      subscription_status: "active",
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("dsemcq_profiles").insert(profile);
    if (error) return { ok: false, error: error.message };
    await persist(profile);
    return { ok: true };
  };

  const signOut = async () => {
    setIsGuest(false);
    void rcLogOut();
    if (isSupabaseConfigured) await supabase.auth.signOut();
    await persist(null);
  };

  const updateProfile = async (patch: Partial<Profile>) => {
    if (!user) return;
    const next = { ...user, ...patch };
    if (isSupabaseConfigured) {
      await supabase.from("dsemcq_profiles").update(patch).eq("id", user.id);
    }
    await persist(next);
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { ok: false, error: "Supabase 未設定" };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, error: error?.message || "登入失敗" };
    const { data: profile } = await supabase
      .from("dsemcq_profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) return { ok: false, error: "找不到用戶資料" };
    setIsGuest(false);
    await persist(profile as Profile);
    // fire-and-forget admin instrumentation
    void logLogin(data.user.id, getPlatform());
    void registerForPushNotifications(data.user.id);
    void syncSubscription(data.user.id, profile as Profile);
    return { ok: true };
  };

  const signInWithApple = async (): Promise<{
    ok: boolean;
    needsRegister: boolean;
    appleFullName?: string;
    appleEmail?: string;
    error?: string;
  }> => {
    if (Platform.OS !== "ios") return { ok: false, needsRegister: false, error: "Apple 登入僅支援 iOS" };
    if (!isSupabaseConfigured) return { ok: false, needsRegister: false, error: "Supabase 未設定" };
    try {
      const rawNonce = generateRawNonce();
      const hashedNonce = await sha256Hex(rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        return { ok: false, needsRegister: false, error: "Apple 登入失敗，請重試" };
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error || !data.user) {
        return { ok: false, needsRegister: false, error: error?.message || "Apple 登入失敗" };
      }
      // Apple only returns fullName on the very first sign-in — save it immediately.
      const appleFullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ].filter(Boolean).join(" ") || undefined;
      const appleEmail = credential.email ?? data.user.email ?? undefined;
      // Check if the user already has a profile
      const { data: profile } = await supabase
        .from("dsemcq_profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile) {
        setIsGuest(false);
        await persist(profile as Profile);
        void logLogin(data.user.id, getPlatform());
        void registerForPushNotifications(data.user.id);
        void syncSubscription(data.user.id, profile as Profile);
        return { ok: true, needsRegister: false };
      }
      // New user — caller navigates to Register with pre-filled name/email
      return { ok: true, needsRegister: true, appleFullName, appleEmail };
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") {
        return { ok: false, needsRegister: false }; // user dismissed — no error toast
      }
      return { ok: false, needsRegister: false, error: e?.message ?? "Apple 登入失敗" };
    }
  };

  const enterGuest = () => {
    setIsGuest(true);
    setUser(GUEST_PROFILE);
  };

  const enterDemo = async () => {
    setIsGuest(false);
    await persist(DEMO_PROFILE);
  };

  // ── Visit logging: log once per app launch (guest or signed-in) ────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const deviceId = await getDeviceId();
        if (cancelled) return;
        await logVisit(deviceId, user?.id ?? null, getPlatform());
      } catch {
        /* never block UI for analytics */
      }
    })();
    return () => { cancelled = true; };
    // Re-fire when user transitions from null/guest -> signed-in so we capture
    // the device id linked to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Push registration: when an authenticated user is loaded, ensure their
  //     Expo push token is registered. No-op for guests / demo.
  useEffect(() => {
    if (!user || user.id === "demo-user" || user.id === "guest-user") return;
    void registerForPushNotifications(user.id);
  }, [user?.id]);

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSupabaseReady,
        isGuest,
        isAdmin,
        signInWithEmail,
        signInWithPassword,
        signInWithApple,
        verifyOtp,
        registerProfile,
        signOut,
        updateProfile,
        demoMode: !isSupabaseConfigured,
        enterDemo,
        enterGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

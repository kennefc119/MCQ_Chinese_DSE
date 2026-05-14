import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { Profile, Gender } from "../types/database";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { logLogin, logVisit, getDeviceId, getPlatform } from "../lib/adminService";
import { registerForPushNotifications } from "../lib/pushNotifications";

const PROFILE_KEY = "dsemcq_profile";

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  isGuest: boolean;
  /** True when user.role === 'admin'. */
  isAdmin: boolean;
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ ok: boolean; needsRegister: boolean; error?: string }>;
  registerProfile: (data: { username: string; gender: Gender; dse_year: number }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
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
  const [isGuest, setIsGuest] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Offline / demo mode: restore profile from SecureStore only
      SecureStore.getItemAsync(PROFILE_KEY)
        .then((cached) => { if (cached) setUser(JSON.parse(cached)); })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    // 1. Subscribe to Supabase auth state changes FIRST so we never miss events.
    //    This fires with the current session on mount (INITIAL_SESSION / SIGNED_IN).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        // Clear profile unless we're in guest/demo mode
        setIsGuest((g) => {
          if (!g) setUser(null);
          return g;
        });
        setLoading(false);
        return;
      }
      // Session is valid — fetch the fresh profile from DB, fall back to SecureStore cache
      try {
        const { data: profile } = await supabase
          .from("dsemcq_profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile) {
          await persist(profile as Profile);
        } else {
          // Profile not yet created (user in registration flow) — keep any cached profile
          const cached = await SecureStore.getItemAsync(PROFILE_KEY).catch(() => null);
          if (cached) setUser(JSON.parse(cached));
        }
      } catch {
        // Network error — fall back to SecureStore cache so app stays usable offline
        const cached = await SecureStore.getItemAsync(PROFILE_KEY).catch(() => null);
        if (cached) setUser(JSON.parse(cached));
      }
      setLoading(false);
    });

    // 2. Kick off session restoration from ExpoSecureStoreAdapter.
    //    getSession() reads the persisted JWT from storage and populates the in-memory
    //    session.  Without this explicit call the session isn't guaranteed to be loaded
    //    before the first DB mutation (signups/attempts inserts), causing auth.uid() to
    //    return null and RLS to reject the insert.
    supabase.auth.getSession().catch(() => {});

    return () => { subscription.unsubscribe(); };
  }, []);

  const persist = async (p: Profile | null) => {
    setUser(p);
    if (p) await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(p));
    else await SecureStore.deleteItemAsync(PROFILE_KEY);
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
    return { ok: true };
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
        isGuest,
        isAdmin,
        signInWithEmail,
        signInWithPassword,
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

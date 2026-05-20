/**
 * RevenueCat helpers.
 * Wraps react-native-purchases so the rest of the app never imports it directly.
 * All functions are safe to call on non-iOS platforms — they return no-op values.
 */
import Purchases, { PurchasesPackage, PurchasesOffering } from "react-native-purchases";
import { Platform } from "react-native";

export const RC_IOS_KEY = "appl_iTASxOcDSGQPoNivqrFfYwMqayo";

/** Exact identifier of the entitlement created in RevenueCat dashboard. */
export const ENTITLEMENT_ID = "學士版訂閱";

/** Call once at app startup (before any other RC call). */
export function configureRevenueCat(): void {
  if (Platform.OS !== "ios") return;
  try {
    Purchases.configure({ apiKey: RC_IOS_KEY });
  } catch (e) {
    console.warn("[RC] configure failed:", e);
  }
}

/** Identify the signed-in user to RevenueCat. */
export async function rcLogIn(userId: string): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn("[RC] logIn failed:", e);
  }
}

/** Clear the RevenueCat identity on sign-out. */
export async function rcLogOut(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn("[RC] logOut failed:", e);
  }
}

/**
 * Returns true if the current user has an active premium entitlement according
 * to Apple / RevenueCat. Safe to call without a logged-in RC user.
 */
export async function checkPremiumEntitlement(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

/** Fetches the current RevenueCat offering (contains the monthly package). */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/** Initiates a purchase for the given package. */
export async function purchasePkg(pkg: PurchasesPackage): Promise<{
  success: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    return { success: isPremium };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e?.message ?? "購買失敗" };
  }
}

/** Restores previous purchases — required by Apple. */
export async function restorePurchases(): Promise<{
  isPremium: boolean;
  error?: string;
}> {
  if (Platform.OS !== "ios") return { isPremium: false };
  try {
    const info = await Purchases.restorePurchases();
    const isPremium = !!info.entitlements.active[ENTITLEMENT_ID];
    return { isPremium };
  } catch (e: any) {
    return { isPremium: false, error: e?.message ?? "恢復失敗" };
  }
}

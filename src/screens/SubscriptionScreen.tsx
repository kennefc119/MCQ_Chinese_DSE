import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import ContentContainer from "../components/ContentContainer";
import SUB from "../content/subscriptionContent.json";
import {
  getCurrentOffering,
  purchasePkg,
  restorePurchases,
  getPremiumEntitlementStatus,
  presentOfferCodeRedemptionSheet,
} from "../lib/revenueCat";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { PurchasesPackage } from "react-native-purchases";

const PRIVACY_URL = "https://www.keeonz.ai/zh/legal/privacy/";
const TERMS_URL = "https://www.keeonz.ai/zh/legal/terms/";
const EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const THREADS_URL = "https://www.threads.com/@dse.manyuen?invite=0";

export default function SubscriptionScreen() {
  const { user, updateProfile } = useAuth();
  const isPremium = user?.subscription_tier === "premium";

  const [monthlyPkg, setMonthlyPkg] = useState<PurchasesPackage | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [offeringUnavailable, setOfferingUnavailable] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [freeLimit, setFreeLimit] = useState(20);
  const [premiumLimit, setPremiumLimit] = useState(300);

  const applyTier = async (premium: boolean) => {
    await updateProfile({
      subscription_tier: premium ? "premium" : "free",
      subscription_status: premium ? "active" : "inactive",
    });
  };

  useEffect(() => {
    getCurrentOffering().then((offering) => {
      const pkg = offering?.monthly ?? null;
      setMonthlyPkg(pkg);
      setOfferingUnavailable(!pkg);
      setLoadingOffering(false);
    });
    // Fetch dynamic AI limits
    if (isSupabaseConfigured) {
      (async () => {
        try {
          const { data } = await supabase
            .from("dsemcq_app_settings")
            .select("key, value")
            .in("key", ["max_ai_chat_basic", "max_ai_chat_premium"]);
          if (data) {
            for (const row of data as { key: string; value: unknown }[]) {
              const v = typeof row.value === "number" ? row.value : parseInt(String(row.value), 10);
              if (!Number.isFinite(v)) continue;
              if (row.key === "max_ai_chat_basic") setFreeLimit(v);
              if (row.key === "max_ai_chat_premium") setPremiumLimit(v);
            }
          }
        } catch { /* use defaults */ }
      })();
    }
  }, []);

  // Price string from Apple via RevenueCat; falls back gracefully during load.
  // In sandbox Apple sometimes returns a bare number (e.g. "8.99") without a
  // currency symbol — detect that and prepend the ISO currency code.
  const rawPrice = monthlyPkg?.product.priceString ?? "HK$68.00";
  const priceString =
    /^\d/.test(rawPrice) && monthlyPkg?.product.currencyCode
      ? `${monthlyPkg.product.currencyCode} ${rawPrice}`
      : rawPrice;

  const handlePurchase = async () => {
    if (!monthlyPkg) return;
    setPurchasing(true);
    const result = await purchasePkg(monthlyPkg);
    setPurchasing(false);
    if (result.cancelled) return;
    if (result.success) {
      await applyTier(true);
      Alert.alert("升級成功 🎉", "已成功升級至學士版！感謝你的支持。");
    } else if (result.error) {
      Alert.alert("購買失敗", result.error);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.isPremium) {
      await applyTier(true);
      Alert.alert("已恢復", "學士版訂閱已成功恢復！");
    } else {
      if (!result.error) {
        await applyTier(false);
      }
      Alert.alert(
        "未找到訂閱",
        result.error ?? "找不到有效的訂閱記錄。如有疑問請聯絡客服。",
      );
    }
  };

  const handleRedeemCode = async () => {
    setRedeeming(true);
    const opened = await presentOfferCodeRedemptionSheet();
    if (!opened.opened) {
      setRedeeming(false);
      Alert.alert("無法兌換優惠碼", opened.error ?? "請稍後再試");
      return;
    }

    const entitlement = await getPremiumEntitlementStatus();
    setRedeeming(false);

    if (entitlement.error) {
      Alert.alert("已開啟兌換", "若已成功兌換，請點擊「恢復購買記錄」同步訂閱。\n\n" + entitlement.error);
      return;
    }

    if (entitlement.isPremium) {
      await applyTier(true);
      Alert.alert("優惠碼已生效", "已成功啟用學士版訂閱。");
      return;
    }

    Alert.alert("尚未生效", "若你已完成兌換，請稍候後再試「恢復購買記錄」，或重新開啟 App。\n\n如仍未生效，請確認優惠碼地區/期間是否適用。");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ContentContainer>
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          <Text style={styles.title}>{SUB.pageTitle}</Text>
          <Text style={styles.subtitle}>{SUB.pageSubtitle}</Text>

          {/* Free plan */}
          <View style={[styles.plan, !isPremium && styles.planActive]}>
            <Text style={styles.planName}>{SUB.freePlan.name}</Text>
            <Text style={styles.planPrice}>{SUB.freePlan.price}</Text>
            {SUB.freePlan.perks.map((p) => {
              const display = p.includes("文淵書僮") ? `每月 ${freeLimit} 次 文淵書僮(AI) 問題（每月 1 號自動重置）` : p;
              return <Text key={p} style={styles.perk}>• {display}</Text>;
            })}
            {!isPremium && <Text style={styles.currentTag}>{SUB.currentPlanLabel}</Text>}
          </View>

          {/* Premium plan */}
          <View style={[styles.plan, isPremium && styles.planActive, { borderColor: colors.primary }]}>
            <Text style={[styles.planName, { color: colors.primary }]}>{SUB.premiumPlan.name}</Text>

            {loadingOffering ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xs }} />
            ) : (
              <Text style={styles.planPrice}>{priceString} / 月</Text>
            )}

            {SUB.premiumPlan.perks.map((p) => {
              const display = p.includes("文淵書僮") ? `每月 ${premiumLimit} 次 文淵書僮(AI) 問題（每月 1 號自動重置）` : p;
              return <Text key={p} style={styles.perk}>• {display}</Text>;
            })}

            {isPremium ? (
              <Text style={styles.currentTag}>{SUB.currentPlanLabel}</Text>
            ) : offeringUnavailable ? (
              <Text style={styles.unavailableNote}>
                購買功能目前無法使用。請確保你使用的是正式或測試版本（非 Expo Go），並檢查網絡連接後重試。
              </Text>
            ) : (
              <Button
                title={purchasing ? "處理中…" : `升級至學士版　${priceString}/月`}
                onPress={handlePurchase}
                disabled={purchasing || loadingOffering}
              />
            )}
          </View>

          {/* Promo offer card (third card) */}
          <View style={styles.promoPlanCard}>
            <Text style={styles.promoPlanTitle}>暑假溫書推廣優惠</Text>
            <Text style={styles.promoPlanHeadline}>輸入優惠碼即享兩個月免費學士版</Text>
            <Text style={styles.promoPlanDesc}>
              優惠期後將按月自動續期（{priceString}/月），可於下一次續期前至少 24 小時取消。
            </Text>
            <Text style={styles.promoPlanDesc}>
              追蹤我哋嘅 Threads 並私訊我哋，即可獲取優惠碼！
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(THREADS_URL)} style={styles.promoThreadsLink}>
              <Text style={styles.promoThreadsLinkText}>前往 Threads 取得優惠碼</Text>
            </TouchableOpacity>
            {Platform.OS === "ios" ? (
              <Button
                title={redeeming ? "開啟中…" : "立即兌換優惠碼"}
                onPress={handleRedeemCode}
                disabled={redeeming || restoring}
              />
            ) : (
              <Text style={styles.promoPlatformNote}>優惠碼兌換僅支援 iOS 裝置（會開啟 Apple 兌換視窗）。</Text>
            )}
          </View>

          {/* Apple-required auto-renewal disclosure */}
          {!isPremium && (
            <Text style={styles.disclosure}>
              訂閱將自動按月續期，費用為 {priceString}。
              如需取消，請於下次續期日前至少 24 小時前往「設定」&gt;「Apple ID」&gt;「訂閱」中管理。
            </Text>
          )}

          {/* Restore Purchases — mandated by Apple */}
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring || redeeming}
            style={styles.restoreBtn}
          >
            <Text style={styles.restoreText}>
              {restoring ? "恢復中…" : "恢復購買記錄"}
            </Text>
          </TouchableOpacity>

          {/* Legal links — required on paywall by Apple */}
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.legalLink}>使用條款</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.legalLink}>私隱政策</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL(EULA_URL)}>
              <Text style={styles.legalLink}>許可協議 (EULA)</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.note}>{SUB.note}</Text>
        </ScrollView>
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primary },
  subtitle: { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  plan: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planActive: { borderColor: colors.success },
  planName: { ...typography.heading, color: colors.textPrimary },
  planPrice: { color: colors.textSecondary, marginVertical: spacing.xs },
  perk: { color: colors.textPrimary, marginVertical: 2, lineHeight: 22 },
  currentTag: { color: colors.success, fontWeight: "700", marginTop: spacing.sm },
  disclosure: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  restoreBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  restoreText: {
    color: colors.primary,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  promoPlanCard: {
    backgroundColor: "rgba(178,58,46,0.07)",
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  promoPlanTitle: {
    ...typography.heading,
    color: colors.primary,
  },
  promoPlanHeadline: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  promoPlanDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  promoThreadsLink: {
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  promoThreadsLinkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  promoPlatformNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  legalLink: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: "underline",
  },
  legalSep: { color: colors.textMuted, fontSize: 12 },
  unavailableNote: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    lineHeight: 18,
    fontStyle: "italic",
  },
  note: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, lineHeight: 18 },
});

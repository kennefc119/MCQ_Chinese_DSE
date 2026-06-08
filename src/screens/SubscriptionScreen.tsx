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
} from "../lib/revenueCat";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { PurchasesPackage } from "react-native-purchases";

const PRIVACY_URL = "https://www.keeonz.ai/zh/legal/privacy/";
const TERMS_URL = "https://www.keeonz.ai/zh/legal/terms/";
const EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export default function SubscriptionScreen() {
  const { user, updateProfile } = useAuth();
  const isPremium = user?.subscription_tier === "premium";

  const [monthlyPkg, setMonthlyPkg] = useState<PurchasesPackage | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [offeringUnavailable, setOfferingUnavailable] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [freeLimit, setFreeLimit] = useState(20);
  const [premiumLimit, setPremiumLimit] = useState(300);

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
      await updateProfile({ subscription_tier: "premium", subscription_status: "active" });
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
      await updateProfile({ subscription_tier: "premium", subscription_status: "active" });
      Alert.alert("已恢復", "學士版訂閱已成功恢復！");
    } else {
      Alert.alert(
        "未找到訂閱",
        result.error ?? "找不到有效的訂閱記錄。如有疑問請聯絡客服。",
      );
    }
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
            disabled={restoring}
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

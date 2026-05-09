import { StyleSheet } from "react-native";
import { colors } from "./colors";
import { spacing, radii } from "./spacing";
import { typography } from "./typography";

// Common style primitives used across screens. Light-mode tuned: hairline borders,
// gentle elevation, and generous padding so cards "lift" off the rice-paper page
// without resorting to heavy shadows.
export const commonStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // Page-level horizontal padding. Use this on ScrollView contentContainerStyle
  // and FlatList contentContainerStyle so all screens share the same gutter.
  pagePadding: { paddingHorizontal: spacing.lg },

  // Standard content card. Subtle hairline border instead of heavy shadow.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },

  // A flatter card variant used for grouped form/info rows.
  cardFlat: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: "hidden",
  },

  // Buttons ----------------------------------------------------------------
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: colors.primary,
    opacity: 0.4,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },

  // Page header — used by ScreenHeader. Keeps section titles in serif and
  // gives every screen a consistent rhythm.
  pageHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  pageTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  pageSubtitle: {
    ...typography.body,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },

  // Section label — small-caps style cap used to introduce a content group.
  sectionLabel: {
    ...typography.micro,
    color: colors.inkMuted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },

  // Form input shared style.
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
});

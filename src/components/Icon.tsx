import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

// Project size scale — keep callers free of magic numbers so we can rebalance
// the visual rhythm in one place.
export const ICON_SIZE = { xs: 14, sm: 18, md: 22, lg: 28, xl: 36 } as const;
export type IconSize = keyof typeof ICON_SIZE;

// Names are typed via Ionicons but consumers pass strings; we keep this thin so
// it can be swapped for a custom icon set later without touching call sites.
export type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface Props {
  name: IconName;
  size?: IconSize | number;
  color?: string;
  style?: React.ComponentProps<typeof Ionicons>["style"];
}

export default function Icon({ name, size = "md", color = colors.ink, style }: Props) {
  const px = typeof size === "number" ? size : ICON_SIZE[size];
  return <Ionicons name={name} size={px} color={color} style={style} />;
}

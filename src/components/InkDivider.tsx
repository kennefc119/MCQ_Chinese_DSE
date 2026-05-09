import React from "react";
import { View, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

// 墨線 — a hand-drawn-feeling horizontal divider used to break sections.
// Tapered ends, slightly off-straight. Reserve for *section* breaks; do NOT
// litter every list with these.
interface Props {
  width?: number | "100%";
  height?: number;
  color?: string;
  opacity?: number;
  style?: ViewStyle;
}

export default function InkDivider({
  width = "100%",
  height = 6,
  color = colors.ink,
  opacity = 0.32,
  style,
}: Props) {
  // The path describes a slightly wavy stroke, tapered at both ends, drawn as
  // a filled shape for control over the taper. Coordinates assume a 240×6 box;
  // the SVG's preserveAspectRatio scales it across whatever width we render.
  const d =
    "M2 3.2 C 12 1.8, 28 4.2, 48 3.0 C 76 1.6, 110 4.4, 142 2.8 C 176 1.4, 206 4.0, 230 3.0 L 238 3.0 L 230 3.4 C 206 4.4, 176 1.8, 142 3.2 C 110 4.8, 76 2.0, 48 3.4 C 28 4.6, 12 2.2, 2 3.6 Z";
  return (
    <View style={[{ width, height }, style]}>
      <Svg width="100%" height={height} viewBox="0 0 240 6" preserveAspectRatio="none">
        <Path d={d} fill={color} fillOpacity={opacity} />
      </Svg>
    </View>
  );
}

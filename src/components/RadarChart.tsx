import React from "react";
import { View } from "react-native";
import Svg, { Polygon, Line, Text as SvgText } from "react-native-svg";

interface Props {
  axes: string[];
  values: number[]; // 0–100
  color: string;
  size?: number;
}

export default function RadarChart({ axes, values, color, size = 200 }: Props) {
  const n = axes.length;
  if (n < 3 || values.length < n) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const labelRadius = size * 0.47;
  const levels = 4;

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const px = (r: number, i: number) => cx + r * Math.cos(angle(i));
  const py = (r: number, i: number) => cy + r * Math.sin(angle(i));

  const gridPolygons = Array.from({ length: levels }, (_, lvl) => {
    const r = (radius * (lvl + 1)) / levels;
    return Array.from({ length: n }, (_, i) => `${px(r, i)},${py(r, i)}`).join(" ");
  });

  const dataPoints = Array.from({ length: n }, (_, i) => {
    const r = (values[i] / 100) * radius;
    return `${px(r, i)},${py(r, i)}`;
  }).join(" ");

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {gridPolygons.map((pts, lvl) => (
          <Polygon key={lvl} points={pts} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <Line key={i} x1={cx} y1={cy} x2={px(radius, i)} y2={py(radius, i)} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        ))}
        <Polygon points={dataPoints} fill={`${color}66`} stroke={color} strokeWidth={2} />
        {axes.map((label, i) => {
          const cos = Math.cos(angle(i));
          const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
          return (
            <SvgText
              key={i}
              x={px(labelRadius, i)}
              y={py(labelRadius, i)}
              fontSize={9}
              fill="rgba(255,255,255,0.7)"
              textAnchor={anchor}
              alignmentBaseline="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

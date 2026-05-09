import React from "react";
import { View } from "react-native";
import Svg, { Polygon, Circle, Line, Text as SvgText } from "react-native-svg";

interface Props {
  axes: string[];
  values: number[]; // 0–100
  color: string;
  size?: number;    // kept for backwards compat (square charts)
  width?: number;   // override size for width
  height?: number;  // override size for height
}

export default function RadarChart({ axes, values, color, size = 200, width, height }: Props) {
  const n = axes.length;
  if (n < 3 || values.length < n) return null;

  const w = width ?? size;
  const h = height ?? size;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  // For dense charts (12 axes) use tighter proportions so labels fit within bounds
  const radius = n > 8 ? minDim * 0.30 : minDim * 0.36;
  const labelRadius = n > 8 ? minDim * 0.42 : minDim * 0.47;
  const fontSize = n > 8 ? 8 : 9;
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

  // Vertex positions for dots
  const vertexPoints = Array.from({ length: n }, (_, i) => ({
    x: px((values[i] / 100) * radius, i),
    y: py((values[i] / 100) * radius, i),
  }));

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {/* Grid */}
        {gridPolygons.map((pts, lvl) => (
          <Polygon key={lvl} points={pts} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <Line key={i} x1={cx} y1={cy} x2={px(radius, i)} y2={py(radius, i)} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        ))}

        {/* Outer glow layer */}
        <Polygon points={dataPoints} fill="none" stroke={color} strokeWidth={18} strokeOpacity={0.08} strokeLinejoin="round" />
        {/* Mid glow layer */}
        <Polygon points={dataPoints} fill="none" stroke={color} strokeWidth={8} strokeOpacity={0.18} strokeLinejoin="round" />

        {/* Fill */}
        <Polygon points={dataPoints} fill={color} fillOpacity={0.25} stroke="none" />

        {/* Outline border */}
        <Polygon points={dataPoints} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.9} strokeLinejoin="round" />

        {/* Vertex dots */}
        {vertexPoints.map((pt, i) => (
          <Circle key={`dot-${i}`} cx={pt.x} cy={pt.y} r={3} fill={color} opacity={0.9} />
        ))}

        {/* Axis labels */}
        {axes.map((label, i) => {
          const cos = Math.cos(angle(i));
          const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
          return (
            <SvgText
              key={i}
              x={px(labelRadius, i)}
              y={py(labelRadius, i)}
              fontSize={fontSize}
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

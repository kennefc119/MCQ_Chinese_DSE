import React from "react";
import { View } from "react-native";
import Svg, { Polygon, Circle, Line, Text as SvgText } from "react-native-svg";

interface Props {
  axes: string[];
  values: number[]; // 0–100
  color: string;
  baselineValues?: number[]; // 0-100 underlay (e.g. population average)
  baselineColor?: string;
  size?: number;    // kept for backwards compat (square charts)
  width?: number;   // override size for width
  height?: number;  // override size for height
  /** Minimum visual radius for any axis, as a 0–100 value. Axes with a calculated
   *  score below this threshold are still drawn at this radius so the polygon
   *  is never invisible. Data values are unchanged. Default: 8. */
  minValue?: number;
}

export default function RadarChart({
  axes,
  values,
  color,
  baselineValues,
  baselineColor = "rgba(31,26,20,0.22)",
  size = 200,
  width,
  height,
  minValue = 8,
}: Props) {
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

  // Apply a minimum visual floor so zero-score axes still show a small polygon
  const visualValues = values.map((v) => Math.max(v, minValue));

  const gridPolygons = Array.from({ length: levels }, (_, lvl) => {
    const r = (radius * (lvl + 1)) / levels;
    return Array.from({ length: n }, (_, i) => `${px(r, i)},${py(r, i)}`).join(" ");
  });

  const dataPoints = Array.from({ length: n }, (_, i) => {
    const r = (visualValues[i] / 100) * radius;
    return `${px(r, i)},${py(r, i)}`;
  }).join(" ");

  const baselinePoints = baselineValues && baselineValues.length >= n
    ? Array.from({ length: n }, (_, i) => {
        const r = (Math.max(baselineValues[i], minValue) / 100) * radius;
        return `${px(r, i)},${py(r, i)}`;
      }).join(" ")
    : null;

  // Vertex positions for dots
  const vertexPoints = Array.from({ length: n }, (_, i) => ({
    x: px((visualValues[i] / 100) * radius, i),
    y: py((visualValues[i] / 100) * radius, i),
  }));

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {/* Grid */}
        {gridPolygons.map((pts, lvl) => (
          <Polygon key={lvl} points={pts} fill="none" stroke="rgba(31,26,20,0.18)" strokeWidth={1} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <Line key={i} x1={cx} y1={cy} x2={px(radius, i)} y2={py(radius, i)} stroke="rgba(31,26,20,0.18)" strokeWidth={1} />
        ))}

        {/* Baseline underlay (population average) */}
        {baselinePoints && (
          <>
            <Polygon points={baselinePoints} fill={baselineColor} fillOpacity={0.22} stroke="none" />
            <Polygon points={baselinePoints} fill="none" stroke={baselineColor} strokeWidth={1.4} strokeOpacity={0.85} strokeLinejoin="round" />
          </>
        )}

        {/* Outer glow layer */}
        <Polygon points={dataPoints} fill="none" stroke={color} strokeWidth={18} strokeOpacity={0.10} strokeLinejoin="round" />
        {/* Mid glow layer */}
        <Polygon points={dataPoints} fill="none" stroke={color} strokeWidth={8} strokeOpacity={0.22} strokeLinejoin="round" />

        {/* Fill */}
        <Polygon points={dataPoints} fill={color} fillOpacity={0.40} stroke="none" />

        {/* Outline border */}
        <Polygon points={dataPoints} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={1} strokeLinejoin="round" />

        {/* Keep a subtle dashed baseline outline on top so the shadow remains visible */}
        {baselinePoints && (
          <Polygon
            points={baselinePoints}
            fill="none"
            stroke={baselineColor}
            strokeWidth={1.2}
            strokeOpacity={0.75}
            strokeDasharray="3 3"
            strokeLinejoin="round"
          />
        )}

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
              fill="rgba(31,26,20,0.85)"
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

import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

export interface TreemapDatum {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface Tile extends TreemapDatum {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  data: TreemapDatum[];
  width: number;
  height: number;
}

function layoutTiles(
  items: TreemapDatum[],
  x: number,
  y: number,
  width: number,
  height: number,
  depth = 0,
): Tile[] {
  if (items.length === 0 || width <= 0 || height <= 0) return [];
  if (items.length === 1) {
    const only = items[0];
    return [{ ...only, x, y, width, height }];
  }

  const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  if (total <= 0) return [];

  const first = items[0];
  const remaining = items.slice(1);
  const ratio = Math.max(first.value, 0) / total;
  const splitVertical = depth % 2 === 0 ? width >= height : width < height;

  if (splitVertical) {
    const firstWidth = Math.max(1, width * ratio);
    return [
      { ...first, x, y, width: firstWidth, height },
      ...layoutTiles(remaining, x + firstWidth, y, width - firstWidth, height, depth + 1),
    ];
  }

  const firstHeight = Math.max(1, height * ratio);
  return [
    { ...first, x, y, width, height: firstHeight },
    ...layoutTiles(remaining, x, y + firstHeight, width, height - firstHeight, depth + 1),
  ];
}

export default function Treemap({ data, width, height }: Props) {
  const normalized = useMemo(
    () => [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value),
    [data],
  );

  const tiles = useMemo(() => layoutTiles(normalized, 0, 0, width, height), [normalized, width, height]);

  if (tiles.length === 0) return null;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {tiles.map((tile) => {
          const area = tile.width * tile.height;
          const showLabel = area >= 2200;
          const showValue = area >= 1400;
          const label = tile.label.length > 8 ? `${tile.label.slice(0, 8)}...` : tile.label;
          return (
            <React.Fragment key={tile.id}>
              <Rect
                x={tile.x}
                y={tile.y}
                width={Math.max(0, tile.width - 1)}
                height={Math.max(0, tile.height - 1)}
                fill={tile.color}
                rx={4}
                ry={4}
              />
              {showLabel && (
                <SvgText
                  x={tile.x + 6}
                  y={tile.y + 14}
                  fill="#fff"
                  fontSize={10}
                  fontWeight="700"
                >
                  {label}
                </SvgText>
              )}
              {showValue && (
                <SvgText
                  x={tile.x + 6}
                  y={tile.y + (showLabel ? 28 : 14)}
                  fill="rgba(255,255,255,0.96)"
                  fontSize={11}
                  fontWeight="800"
                >
                  {tile.value}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

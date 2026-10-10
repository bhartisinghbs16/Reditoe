import React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Txt, colors } from "@/components/ui";

/**
 * The two charts on the reference Earnings screen.
 *
 * Both are drawn with plain views — the app has no SVG dependency, and a
 * thirteen-point line plus a four-slice ring do not justify adding one.
 */

const FILL_COLUMNS = 60;

/** Width of one category tick's label box. */
const TICK_W = 46;

/**
 * Round the axis up so the gridlines land on values a tick label can state
 * exactly — 8K/6K/4K/2K/0, never a line at 6,800 labelled "8K".
 */
function niceCeiling(value: number) {
  const rough = value / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const step =
    (normalised <= 1
      ? 1
      : normalised <= 2
        ? 2
        : normalised <= 2.5
          ? 2.5
          : normalised <= 5
            ? 5
            : 10) * magnitude;
  return step * 4;
}

export function AreaChart({
  data,
  color = colors.green[600],
  height = 150,
  /**
   * Formats the axis ticks. Thousands get the "8K" form; smaller scales print
   * plainly, since a ₹180 week rendered as "0K 0K 0K" tells the reader nothing.
   */
  formatTick = (value: number) =>
    value >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value)),
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  formatTick?: (value: number) => string;
}) {
  const [width, setWidth] = React.useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  // Fewer than two readings is not a chart; say so rather than crash indexing.
  const enough = Array.isArray(data) && data.length >= 2;

  const max = niceCeiling(Math.max(...(enough ? data.map((d) => d.value) : [0]), 1));
  const gutter = 30;
  const plotW = Math.max(0, width - gutter);
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;

  const y = (value: number) => height - (value / max) * height;
  const points = data.map((d, i) => ({ x: i * step, y: y(d.value) }));

  /** Value on the line at a fractional index, for the wash columns. */
  const valueAt = (t: number) => {
    const i = Math.min(data.length - 2, Math.floor(t));
    const frac = t - i;
    return data[i].value + (data[i + 1].value - data[i].value) * frac;
  };

  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

  if (!enough) {
    return (
      <View style={{ height: height + 20 }} className="items-center justify-center">
        <Txt size="tiny" tone="faint">
          No earnings recorded yet
        </Txt>
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      <View style={{ height, flexDirection: "row" }}>
        {/* Value axis */}
        <View style={{ width: gutter, height }} className="justify-between">
          {ticks.map((tick) => (
            <Txt key={tick} size="micro" tone="faint">
              {tick === 0 ? "0" : formatTick(tick)}
            </Txt>
          ))}
        </View>

        <View style={{ width: plotW, height }}>
          {/* Gridlines — horizontal hairlines only. */}
          {ticks.map((tick) => (
            <View
              key={tick}
              style={{ position: "absolute", left: 0, right: 0, top: y(tick), height: 1 }}
              className="bg-line"
            />
          ))}

          {width > 0 && (
            <>
              {/* Wash under the line. */}
              {Array.from({ length: FILL_COLUMNS }, (_, k) => {
                const t = (k / (FILL_COLUMNS - 1)) * (data.length - 1);
                const top = y(valueAt(t));
                return (
                  <View
                    key={`fill-${k}`}
                    style={{
                      position: "absolute",
                      left: (k * plotW) / FILL_COLUMNS,
                      width: plotW / FILL_COLUMNS + 1,
                      top,
                      height: Math.max(0, height - top),
                      backgroundColor: color,
                      opacity: 0.13,
                    }}
                  />
                );
              })}

              {/* The line itself, one rotated segment per interval. */}
              {points.slice(0, -1).map((from, i) => {
                const to = points[i + 1];
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                return (
                  <View
                    key={`seg-${i}`}
                    style={{
                      position: "absolute",
                      left: (from.x + to.x) / 2 - length / 2,
                      top: (from.y + to.y) / 2 - 1,
                      width: length,
                      height: 2,
                      backgroundColor: color,
                      borderRadius: 1,
                      transform: [{ rotate: `${angle}rad` }],
                    }}
                  />
                );
              })}

              {/* A hollow marker at every reading, as the reference draws. */}
              {points.map((point, i) => (
                <View
                  key={`dot-${i}`}
                  style={{
                    position: "absolute",
                    left: point.x - 4,
                    top: point.y - 4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: color,
                    backgroundColor: "#ffffff",
                  }}
                />
              ))}
            </>
          )}
        </View>
      </View>

      {/*
       * Category axis. Only about half the readings are labelled, so each tick
       * is centred on its own point rather than given an equal share of the
       * width — in equal slots a label like "31 May" has a thirteenth of the
       * chart to sit in and truncates to "3…".
       */}
      <View style={{ marginLeft: gutter, width: plotW, height: 16 }} className="mt-1.5">
        {data.map((d, i) =>
          d.label ? (
            <Txt
              key={`x-${i}`}
              size="micro"
              tone="faint"
              numberOfLines={1}
              style={{
                position: "absolute",
                // Clamped to the plot so the first and last ticks stay inside it.
                left: Math.max(0, Math.min(plotW - TICK_W, points[i].x - TICK_W / 2)),
                width: TICK_W,
                textAlign: "center",
              }}
            >
              {d.label}
            </Txt>
          ) : null
        )}
      </View>
    </View>
  );
}

/**
 * The earnings-breakup ring.
 *
 * Each slice is a run of thin radial spokes laid on the circle's edge; at a
 * hundred-odd spokes across the whole ring the joins are invisible and the
 * result reads as a smooth donut without pulling in a drawing library.
 */
export function Donut({
  data,
  size = 132,
  thickness = 26,
  children,
}: {
  data: { label: string; amount: number; color: string }[];
  size?: number;
  thickness?: number;
  /** Centred content — the reference prints the total and the word "Total". */
  children?: React.ReactNode;
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Txt size="tiny" tone="faint">
          No breakdown yet
        </Txt>
      </View>
    );
  }

  const total = data.reduce((sum, d) => sum + d.amount, 0) || 1;
  const centre = size / 2;
  const radius = centre - thickness / 2;
  /** One spoke every ~2.8°, so a slice never shows its seams. */
  const spokes = 128;
  const chord = (2 * Math.PI * radius) / spokes;

  let cursor = 0;
  const marks: { angle: number; color: string }[] = [];

  data.forEach((slice) => {
    const count = Math.max(1, Math.round((slice.amount / total) * spokes));
    for (let i = 0; i < count; i += 1) {
      marks.push({ angle: ((cursor + i) / spokes) * 2 * Math.PI, color: slice.color });
    }
    cursor += count;
  });

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      {marks.map((mark, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            width: chord + 1.5,
            height: thickness,
            backgroundColor: mark.color,
            left: centre + radius * Math.sin(mark.angle) - (chord + 1.5) / 2,
            top: centre - radius * Math.cos(mark.angle) - thickness / 2,
            transform: [{ rotate: `${mark.angle}rad` }],
          }}
        />
      ))}

      <View
        style={{
          width: size - thickness * 2,
          height: size - thickness * 2,
          borderRadius: size,
          backgroundColor: "#ffffff",
        }}
        className="items-center justify-center"
      >
        {children}
      </View>
    </View>
  );
}

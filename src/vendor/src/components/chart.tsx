import React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Txt, colors } from "@/components/ui";

/**
 * The earnings line chart of the reference Payments screen: a 2px line with a
 * dot per day, a soft wash beneath it, hairline gridlines and a value axis.
 *
 * Drawn with plain views rather than a chart library — the app has no SVG
 * dependency, and seven points do not justify one. The wash is a run of thin
 * columns clipped to the interpolated line height, which reads as a smooth
 * area at this size.
 */

const FILL_COLUMNS = 60;

/**
 * Round the axis up so the four gridlines land on values a tick label can
 * state exactly — 4K/3K/2K/1K/0, never a line at 3,500 labelled "4K".
 */
/**
 * Tick labels that stay distinct. A 2,000 axis steps in 500s, so whole-K
 * rounding would print "2K 2K 1K 1K 0" — one decimal keeps them apart, and
 * small axes drop the K entirely.
 */
function defaultTick(value: number) {
  if (value === 0) return "0";
  if (value < 1000) return String(Math.round(value));
  const thousands = value / 1000;
  return Number.isInteger(thousands) ? `${thousands}K` : `${thousands.toFixed(1)}K`;
}

function niceCeiling(value: number) {
  const rough = value / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) *
    magnitude;
  return step * 4;
}

export function AreaChart({
  data,
  color = colors.indigo[600],
  height = 140,
  /**
   * Formats the axis ticks. The default adapts to the range: rounding every
   * tick to whole thousands turns 2000/1500/1000/500 into "2K 2K 1K 1K".
   */
  formatTick = defaultTick,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  formatTick?: (value: number) => string;
}) {
  const [width, setWidth] = React.useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  // A line needs two points. One or none is a legitimate state — a brand new
  // restaurant, or a stats call that came back empty — not a crash.
  if (data.length < 2) {
    return (
      <View onLayout={onLayout} style={{ height: height + 20 }} className="items-center justify-center">
        <Txt size="tiny" tone="faint">
          {data.length === 1
            ? `${data[0].label}: ${formatTick(data[0].value)}`
            : "No earnings recorded yet"}
        </Txt>
        <Txt size="micro" tone="faint" className="mt-1">
          A trend appears once there are a few days of sales.
        </Txt>
      </View>
    );
  }

  const max = niceCeiling(Math.max(...data.map((d) => d.value), 1));
  const gutter = 34;
  const plotW = Math.max(0, width - gutter);
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;

  const y = (value: number) => height - (value / max) * height;
  const points = data.map((d, i) => ({ x: i * step, y: y(d.value) }));

  /** Value on the line at a fractional index, for the wash columns. */
  const valueAt = (t: number) => {
    // Clamp to a real segment: t can land exactly on the last index, and a
    // negative index would read past the start of the array.
    const i = Math.max(0, Math.min(data.length - 2, Math.floor(t)));
    const frac = t - i;
    return data[i].value + (data[i + 1].value - data[i].value) * frac;
  };

  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

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
                      opacity: 0.12,
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

              {/* A marker per day. */}
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
                    backgroundColor: color,
                  }}
                />
              ))}
            </>
          )}
        </View>
      </View>

      {/* Category axis */}
      <View style={{ marginLeft: gutter, width: plotW }} className="mt-1.5 flex-row">
        {data.map((d) => (
          <View key={d.label} style={{ width: plotW / data.length }} className="items-center">
            <Txt size="micro" tone="faint">
              {d.label}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

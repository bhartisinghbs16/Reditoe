"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { compact, number as formatNumber } from "@/lib/format";
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_SURFACE,
  ChartFrame,
  ChartLegend,
  ChartTableView,
  ChartTooltip,
  axisTickStyle,
  slotColor,
  useTableView,
  type SeriesConfig,
} from "@/components/charts/chart-kit";

type Datum = Record<string, string | number>;

function resolveColors(series: SeriesConfig[]) {
  return series.map((entry, index) => entry.color ?? slotColor(index));
}

/* ── Trend (line / area over time) ──────────────────────────────────────── */

export function TrendChart({
  data,
  categoryKey,
  categoryLabel = "Period",
  series,
  height = 260,
  variant = "area",
  formatCategory,
  caption,
  className,
}: {
  data: Datum[];
  categoryKey: string;
  categoryLabel?: string;
  series: SeriesConfig[];
  height?: number;
  variant?: "area" | "line";
  formatCategory?: (value: unknown) => string;
  /** Names a single-series chart, where a legend box would be noise. */
  caption?: React.ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useTableView();
  const colors = resolveColors(series);
  const Chart = variant === "area" ? AreaChart : LineChart;

  return (
    <ChartFrame
      height={height}
      className={className}
      legend={
        series.length > 1 ? (
          <ChartLegend series={series} colors={colors} />
        ) : caption ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: colors[0] }}
            />
            {caption}
          </span>
        ) : null
      }
      showTable={showTable}
      onToggleTable={() => setShowTable((v) => !v)}
      table={
        <ChartTableView
          data={data}
          categoryKey={categoryKey}
          categoryLabel={categoryLabel}
          series={series}
          colors={colors}
          formatCategory={formatCategory}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            {series.map((entry, index) => (
              <linearGradient
                key={entry.key}
                id={`fill-${entry.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                {/* Area fills are a wash (~10%), never a saturated block. */}
                <stop offset="0%" stopColor={colors[index]} stopOpacity={0.14} />
                <stop offset="100%" stopColor={colors[index]} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            stroke={CHART_GRID}
            strokeWidth={1}
            vertical={false}
          />
          <XAxis
            dataKey={categoryKey}
            tick={axisTickStyle}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID }}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={56}
            tickFormatter={(value: number) => compact(value) ?? ""}
          />
          <Tooltip
            cursor={{ stroke: CHART_AXIS, strokeWidth: 1 }}
            // Only the three fields the tooltip reads — spreading recharts'
            // full prop bag drags in its own conflicting `labelFormatter`.
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                label={label}
                series={series}
              />
            )}
          />

          {series.map((entry, index) =>
            variant === "area" ? (
              <Area
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                stroke={colors[index]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={`url(#fill-${entry.key})`}
                // No entrance animation: an ops console is read, not watched,
                // and a sweeping reveal delays the first honest read of the data.
                isAnimationActive={false}
                // Dots appear on hover only; a 2px surface ring keeps them
                // legible where series cross.
                dot={false}
                activeDot={{
                  r: 4.5,
                  strokeWidth: 2,
                  stroke: CHART_SURFACE,
                  fill: colors[index],
                }}
              />
            ) : (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                stroke={colors[index]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
                dot={false}
                activeDot={{
                  r: 4.5,
                  strokeWidth: 2,
                  stroke: CHART_SURFACE,
                  fill: colors[index],
                }}
              />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* ── Categorical bars ───────────────────────────────────────────────────── */

export function CategoryBarChart({
  data,
  categoryKey,
  categoryLabel = "Category",
  series,
  height = 260,
  layout = "vertical",
  stacked,
  formatCategory,
  className,
}: {
  data: Datum[];
  categoryKey: string;
  categoryLabel?: string;
  series: SeriesConfig[];
  height?: number;
  /** "vertical" draws columns; "horizontal" draws bars running right. */
  layout?: "vertical" | "horizontal";
  stacked?: boolean;
  formatCategory?: (value: unknown) => string;
  className?: string;
}) {
  const [showTable, setShowTable] = useTableView();
  const colors = resolveColors(series);
  const horizontal = layout === "horizontal";

  return (
    <ChartFrame
      height={height}
      className={className}
      legend={<ChartLegend series={series} colors={colors} />}
      showTable={showTable}
      onToggleTable={() => setShowTable((v) => !v)}
      table={
        <ChartTableView
          data={data}
          categoryKey={categoryKey}
          categoryLabel={categoryLabel}
          series={series}
          colors={colors}
          formatCategory={formatCategory}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, bottom: 0, left: horizontal ? 8 : -12 }}
          barCategoryGap={horizontal ? "22%" : "28%"}
        >
          <CartesianGrid
            stroke={CHART_GRID}
            strokeWidth={1}
            vertical={horizontal}
            horizontal={!horizontal}
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tick={axisTickStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => compact(value) ?? ""}
              />
              <YAxis
                type="category"
                dataKey={categoryKey}
                tick={axisTickStyle}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                width={110}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={categoryKey}
                tick={axisTickStyle}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                tickMargin={8}
                minTickGap={12}
              />
              <YAxis
                tick={axisTickStyle}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) => compact(value) ?? ""}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: CHART_GRID, fillOpacity: 0.6 }}
            // Only the three fields the tooltip reads — spreading recharts'
            // full prop bag drags in its own conflicting `labelFormatter`.
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                label={label}
                series={series}
              />
            )}
          />

          {series.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              stackId={stacked ? "stack" : undefined}
              fill={colors[index]}
              // Thin marks: cap the thickness so the band keeps its air.
              maxBarSize={24}
              // 4px rounded data-end, square at the baseline.
              radius={
                horizontal
                  ? ([0, 4, 4, 0] as [number, number, number, number])
                  : ([4, 4, 0, 0] as [number, number, number, number])
              }
              // 2px gap in the surface colour separates stacked segments.
              stroke={stacked ? CHART_SURFACE : undefined}
              strokeWidth={stacked ? 2 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* ── Donut (part-to-whole, ≤ 6 segments) ────────────────────────────────── */

export interface DonutSlice {
  label: string;
  value: number;
  /** Overrides the slot colour — used for status breakdowns. */
  color?: string;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  height = 260,
  format = (value: number) => formatNumber(value),
  className,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: React.ReactNode;
  height?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const [showTable, setShowTable] = useTableView();

  // Past 6 segments a donut stops being readable — fold the tail into "Other"
  // rather than generating more hues.
  const prepared = React.useMemo(() => {
    const sorted = [...slices].sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const head = sorted.slice(0, 5);
    const tail = sorted.slice(5);
    return [
      ...head,
      { label: "Other", value: tail.reduce((sum, s) => sum + s.value, 0) },
    ];
  }, [slices]);

  const colors = prepared.map((slice, index) => slice.color ?? slotColor(index));
  const total = prepared.reduce((sum, slice) => sum + slice.value, 0);

  const series: SeriesConfig[] = [{ key: "value", label: "Value", format }];
  const tableData = prepared.map((slice) => ({
    label: slice.label,
    value: slice.value,
  }));

  // One legend row is ~34px; keep the frame at least that tall so the legend
  // never has to overflow its box.
  const frameHeight = Math.max(height, prepared.length * 34 + 16);

  return (
    <ChartFrame
      height={frameHeight}
      className={className}
      showTable={showTable}
      onToggleTable={() => setShowTable((v) => !v)}
      table={
        <ChartTableView
          data={tableData}
          categoryKey="label"
          categoryLabel="Segment"
          series={series}
          colors={[slotColor(0)]}
        />
      }
      legend={null}
    >
      <div className="flex h-full flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative h-full min-h-[10rem] w-full sm:w-[55%]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={prepared}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="92%"
                // paddingAngle + a surface-coloured stroke is the 2px gap.
                paddingAngle={1.5}
                stroke={CHART_SURFACE}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {prepared.map((slice, index) => (
                  <Cell key={slice.label} fill={colors[index]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0];
                  const value = Number(entry.value);
                  return (
                    <div className="surface-raised px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 rounded-[2px]"
                          style={{ backgroundColor: entry.payload?.fill }}
                        />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto font-medium tabular-nums">
                          {format(value)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {(centerValue !== undefined || centerLabel) && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {centerValue !== undefined && (
                <span className="text-xl font-semibold tracking-tight">
                  {centerValue}
                </span>
              )}
              {centerLabel && (
                <span className="text-xs text-muted-foreground">{centerLabel}</span>
              )}
            </div>
          )}
        </div>

        {/* Direct value labels beside every segment — the donut never relies on
            hover, and text stays in ink tokens with a colour chip alongside.
            Label and value sit on separate lines: on one line a long currency
            figure squeezes the label until it clips, and the label is the part
            that identifies the slice. */}
        <ul className="w-full space-y-2.5 sm:w-[45%]">
          {prepared.map((slice, index) => (
            <li key={slice.label} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className="mt-1.5 size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: colors[index] }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-muted-foreground" title={slice.label}>
                  {slice.label}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium tabular-nums">
                    {format(slice.value)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {total > 0 ? `${((slice.value / total) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

/* ── Sparkline (stat-tile companion) ────────────────────────────────────── */

export function Sparkline({
  data,
  dataKey = "value",
  color = slotColor(0),
  height = 36,
  className,
}: {
  data: Datum[];
  dataKey?: string;
  color?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill={`url(#spark-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Horizontal ranking meter (top restaurants, top locations) ──────────── */

export function RankedBarList({
  items,
  format = (value: number) => formatNumber(value),
  className,
}: {
  items: Array<{ label: string; value: number; secondary?: string }>;
  format?: (value: number) => string;
  className?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ol className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{item.label}</span>
              <span className="shrink-0 text-sm tabular-nums">{format(item.value)}</span>
            </div>
            {/* Track is a lighter step of the fill's own hue, so state reads
                across the whole bar. */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, (item.value / max) * 100)}%`,
                  backgroundColor: slotColor(0),
                }}
              />
            </div>
            {item.secondary && (
              <p className="mt-1 text-xs text-muted-foreground">{item.secondary}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

"use client";

import * as React from "react";
import { Table2, ChartLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Categorical slots, in fixed order. A series keeps its slot for the life of a
 * chart — colour follows the entity, never its rank — and the order itself is
 * the colour-blind-safety mechanism, so it is never shuffled or cycled past 8.
 */
export const SERIES_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export const MAX_SERIES = SERIES_SLOTS.length;

export function slotColor(index: number) {
  // Past the 8th slot the caller should have folded the tail into "Other";
  // clamping is the safe failure, never a generated hue.
  return SERIES_SLOTS[Math.min(index, MAX_SERIES - 1)];
}

export const CHART_SURFACE = "var(--chart-surface)";
export const CHART_GRID = "var(--chart-grid)";
export const CHART_AXIS = "var(--chart-axis)";

export interface SeriesConfig {
  /** Key into each datum. */
  key: string;
  label: string;
  /** Defaults to the slot matching the series' position. */
  color?: string;
  /** Formats values in the tooltip, table view and direct labels. */
  format?: (value: number) => string;
}

export const axisTickStyle = {
  fill: CHART_AXIS,
  fontSize: 11,
} as const;

/* ── Legend ─────────────────────────────────────────────────────────────── */

/**
 * Always rendered for two or more series — identity must never rest on colour
 * matching alone. A single series gets none; the panel title names it.
 */
export function ChartLegend({
  series,
  colors,
  className,
}: {
  series: SeriesConfig[];
  colors: string[];
  className?: string;
}) {
  if (series.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {series.map((entry, index) => (
        <li key={entry.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: colors[index] }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */

interface TooltipPayloadEntry {
  // Recharts allows an accessor function here, so this stays `unknown` and is
  // compared as a string against the series keys.
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
}

/**
 * Recharts hands the payload in as a readonly array of its own loosely-typed
 * entries, so the props here stay deliberately wide and narrow at the edges.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  labelFormatter,
}: {
  active?: boolean;
  payload?: readonly TooltipPayloadEntry[];
  label?: React.ReactNode;
  series: SeriesConfig[];
  labelFormatter?: (label: React.ReactNode) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="surface-raised min-w-[10rem] px-3 py-2 text-xs">
      {label !== undefined && (
        <p className="mb-1.5 font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? "");
          const config = series.find((s) => s.key === key);
          const value = Number(entry.value);
          return (
            <li key={key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">
                {config?.label ?? String(entry.name ?? "")}
              </span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {config?.format && Number.isFinite(value)
                  ? config.format(value)
                  : String(entry.value ?? "—")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Table view ─────────────────────────────────────────────────────────── */

/**
 * Every chart ships a table twin, so no value is reachable only by hovering and
 * nothing is encoded by colour alone.
 */
export function ChartTableView<T extends Record<string, unknown>>({
  data,
  categoryKey,
  categoryLabel,
  series,
  colors,
  formatCategory,
}: {
  data: T[];
  categoryKey: string;
  categoryLabel: string;
  series: SeriesConfig[];
  colors: string[];
  formatCategory?: (value: unknown) => string;
}) {
  return (
    <div className="scrollbar-slim max-h-[19rem] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {categoryLabel}
            </th>
            {series.map((entry, index) => (
              <th
                key={entry.key}
                className="px-2 py-2 text-right text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: colors[index] }}
                  />
                  {entry.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/70 last:border-0">
              <td className="px-2 py-1.5 whitespace-nowrap">
                {formatCategory
                  ? formatCategory(row[categoryKey])
                  : String(row[categoryKey] ?? "—")}
              </td>
              {series.map((entry) => {
                const value = Number(row[entry.key]);
                return (
                  <td
                    key={entry.key}
                    className="px-2 py-1.5 text-right tabular-nums"
                  >
                    {Number.isFinite(value)
                      ? (entry.format?.(value) ?? value.toLocaleString("en-IN"))
                      : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Frame ──────────────────────────────────────────────────────────────── */

/**
 * Wraps a chart with its legend and the chart/table toggle. Height covers the
 * plot *and* the axis band so the card never grows an inner scrollbar.
 */
export function ChartFrame({
  legend,
  showTable,
  onToggleTable,
  table,
  children,
  height = 260,
  className,
}: {
  legend?: React.ReactNode;
  showTable: boolean;
  onToggleTable: () => void;
  table: React.ReactNode;
  children: React.ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">{legend}</div>
        <Button
          variant="ghost"
          size="xs"
          onClick={onToggleTable}
          className="shrink-0 text-muted-foreground"
          aria-pressed={showTable}
        >
          {showTable ? (
            <>
              <ChartLine className="size-3" />
              Chart
            </>
          ) : (
            <>
              <Table2 className="size-3" />
              Table
            </>
          )}
        </Button>
      </div>
      {showTable ? table : <div style={{ height }}>{children}</div>}
    </div>
  );
}

export function useTableView() {
  return React.useState(false);
}

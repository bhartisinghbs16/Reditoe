"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The reference's headline metric card: tinted icon square, value, the signed
 * delta, the comparison period, and a small tinted sparkline across the foot.
 */

export type MetricTone = "red" | "green" | "purple" | "blue" | "amber";

const TONES: Record<MetricTone, { tile: string; stroke: string; fill: string }> = {
  red: { tile: "bg-red-50 text-red-600", stroke: "#e8112d", fill: "#e8112d" },
  green: { tile: "bg-emerald-50 text-emerald-600", stroke: "#22a45d", fill: "#22a45d" },
  purple: { tile: "bg-violet-50 text-violet-600", stroke: "#7c3aed", fill: "#7c3aed" },
  blue: { tile: "bg-sky-50 text-sky-600", stroke: "#2563eb", fill: "#2563eb" },
  amber: { tile: "bg-amber-50 text-amber-600", stroke: "#f59e0b", fill: "#f59e0b" },
};

/**
 * The delta beside a metric. The reference draws a fall in red with the arrow
 * turned down, so the sign has to drive both — a red −3.02% under an up arrow
 * reads as a rise.
 */
function DeltaChip({ delta }: { delta: number }) {
  const down = delta < 0;
  const Arrow = down ? ArrowDown : ArrowUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        down ? "text-rose-600" : "text-emerald-600"
      )}
    >
      <Arrow className="size-3" />
      {Math.abs(delta)}%
    </span>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  compare,
  icon: Icon,
  tone = "red",
  spark,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  /** Percentage change; the sign drives the arrow and the colour. */
  delta?: number;
  compare?: string;
  icon: LucideIcon;
  tone?: MetricTone;
  /** Seven or so points; shape only, no axes — it's a trend hint, not a chart. */
  spark?: number[];
  loading?: boolean;
}) {
  const palette = TONES[tone];
  const data = React.useMemo(
    () => (spark ?? []).map((v, i) => ({ i, v })),
    [spark]
  );

  return (
    <div className="surface flex flex-col overflow-hidden p-3">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            palette.tile
          )}
        >
          <Icon className="size-[1.05rem]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{label}</p>

          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-24" />
          ) : (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span data-numeric className="text-lg font-semibold tracking-tight">
                {value}
              </span>
              {delta !== undefined && <DeltaChip delta={delta} />}
            </div>
          )}

          {compare && (
            <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
              {compare}
            </p>
          )}
        </div>
      </div>

      {data.length > 0 && (
        <div className="-mx-3 -mb-3 mt-1.5 h-7">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.fill} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={palette.fill} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={palette.stroke}
                strokeWidth={1.75}
                fill={`url(#spark-${tone})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/**
 * Figure-first tile: the icon sits left of a large value, with the label and a
 * qualifier beneath it. The reference uses this shape wherever a count is the
 * point and there is no period to compare against — customer groups, coupon
 * totals, campaign counts.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "red",
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: MetricTone;
  loading?: boolean;
}) {
  const palette = TONES[tone];
  return (
    <div className="surface flex items-start gap-3 p-3.5">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          palette.tile
        )}
      >
        <Icon className="size-[1.15rem]" />
      </span>
      <div className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p data-numeric className="truncate text-[1.375rem] font-semibold tracking-tight">
            {value}
          </p>
        )}
        <p className="truncate text-[0.8125rem] font-medium">{label}</p>
        {hint && (
          <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}

/** Compact variant used by the reference's second metric row (no sparkline). */
export function MiniMetricCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  tone = "red",
}: {
  label: string;
  value: React.ReactNode;
  delta?: number;
  hint?: string;
  icon: LucideIcon;
  tone?: MetricTone;
}) {
  const palette = TONES[tone];
  return (
    <div className="surface flex items-start gap-2.5 p-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          palette.tile
        )}
      >
        <Icon className="size-[1.05rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span data-numeric className="text-xl font-semibold tracking-tight">
            {value}
          </span>
          {delta !== undefined && <DeltaChip delta={delta} />}
        </div>
        {hint && (
          <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}

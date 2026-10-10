import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { delta as formatDelta } from "@/lib/format";
import { HUES, type Hue } from "@/lib/accent";
import { Skeleton } from "@/components/ui/skeleton";

/** Kept as the prop name so existing screens don't have to change. */
export type StatTone = Hue;

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  tone = "indigo",
  hint,
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Percentage change. Positive is rendered as an improvement. */
  delta?: number | null;
  deltaLabel?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  hint?: string;
  loading?: boolean;
  className?: string;
}) {
  const direction = delta === null || delta === undefined ? null : Math.sign(delta);
  const style = HUES[tone];

  return (
    <div className={cn("surface p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-6 w-20" />
          ) : (
            <p
              data-numeric
              className="mt-1 text-xl leading-none font-semibold tracking-tight"
            >
              {value}
            </p>
          )}
        </div>
        {Icon && (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", style.soft)}>
            <Icon className="size-[1.05rem]" />
          </span>
        )}
      </div>

      {(direction !== null || hint) && !loading && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2">
          {direction !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
                direction > 0 && "bg-success-muted text-success-foreground",
                direction < 0 && "bg-danger-muted text-danger-foreground",
                direction === 0 && "bg-muted text-muted-foreground"
              )}
            >
              {direction > 0 ? (
                <ArrowUpRight className="size-3" />
              ) : direction < 0 ? (
                <ArrowDownRight className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              {formatDelta(Math.abs(delta as number))}
            </span>
          )}
          {(deltaLabel || hint) && (
            <span className="truncate text-xs text-muted-foreground">
              {deltaLabel ?? hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StatGrid({
  children,
  className,
  columns = 5,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 3 | 4 | 5;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        columns === 5 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  );
}

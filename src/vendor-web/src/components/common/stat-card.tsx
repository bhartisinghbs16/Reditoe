import * as React from "react";
import Link from "next/link";
import { MoveDownRight, MoveUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, type Tone } from "@/lib/accent";
import { Skeleton } from "@/components/ui/skeleton";

/** Kept as the prop name so screens read the same as the reference labels. */
export type StatTone = Tone;

/**
 * The reference's headline metric: a pastel circle, the metric's name, the
 * number, and a coloured change line. The circle is the only colour on the
 * card — the number itself always stays on white so figures compare cleanly
 * down a row.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "green",
  delta,
  deltaLabel = "vs yesterday",
  hint,
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Percentage change. Positive is rendered as an improvement. */
  delta?: number | null;
  deltaLabel?: string;
  /** Printed instead of a delta — "Since Joined", "Awaiting acceptance". */
  hint?: string;
  loading?: boolean;
  className?: string;
}) {
  const style = TONES[tone];
  const direction = delta === null || delta === undefined ? null : Math.sign(delta);

  return (
    <div className={cn("surface min-w-0 p-4", className)}>
      {Icon && (
        <span className={cn("icon-circle", style.circle)}>
          <Icon className="size-[1.15rem]" />
        </span>
      )}

      <p className={cn("truncate text-[0.8125rem] text-muted-foreground", Icon && "mt-3")}>
        {label}
      </p>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p
          data-numeric
          className="mt-1 truncate text-[1.375rem] leading-tight font-bold tracking-tight"
        >
          {value}
        </p>
      )}

      {!loading && (direction !== null || hint) && (
        <p className="mt-1.5 flex items-center gap-1 truncate text-xs">
          {direction !== null ? (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold",
                  direction >= 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                {direction >= 0 ? (
                  <MoveUpRight className="size-3" />
                ) : (
                  <MoveDownRight className="size-3" />
                )}
                {Math.abs(delta as number)}%
              </span>
              <span className="truncate text-muted-foreground">{deltaLabel}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">{hint}</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The tinted tile used by the Order Status strip and the quick-action grid —
 * same anatomy as a stat card, but the whole face carries the tone because the
 * tiles are read as a set rather than compared as numbers.
 */
export function StatTile({
  icon: Icon,
  tone = "green",
  value,
  label,
  caption,
  href,
  /**
   * Puts the metric's name above its number. The reference does this wherever
   * the figure is a currency amount long enough to be read as a heading —
   * Payments and Offers — and leads with the number where it is a count.
   */
  labelFirst,
  className,
}: {
  icon: LucideIcon;
  tone?: StatTone;
  value?: React.ReactNode;
  label: string;
  caption?: string;
  href?: string;
  labelFirst?: boolean;
  className?: string;
}) {
  const style = TONES[tone];

  const name = (
    <p
      className={cn(
        "truncate text-[0.8125rem] font-medium",
        labelFirst || value === undefined ? "mt-2.5" : "mt-1.5"
      )}
    >
      {label}
    </p>
  );

  const figure = value !== undefined && (
    <p
      data-numeric
      className={cn(
        "truncate text-xl leading-none font-bold",
        labelFirst ? "mt-1.5" : "mt-2.5"
      )}
    >
      {value}
    </p>
  );

  const body = (
    <>
      <span className={cn("icon-circle size-10", style.circle)}>
        <Icon className="size-[1.05rem]" />
      </span>
      {labelFirst ? (
        <>
          {name}
          {figure}
        </>
      ) : (
        <>
          {figure}
          {name}
        </>
      )}
      {caption && (
        <p className={cn("mt-0.5 truncate text-[0.6875rem]", style.text)}>{caption}</p>
      )}
    </>
  );

  const classes = cn(
    "flex min-w-0 flex-col rounded-xl border p-3.5 transition-colors",
    style.soft,
    href && "hover:brightness-[0.98]",
    className
  );

  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export function StatGrid({
  children,
  className,
  columns = 4,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 3 | 4 | 5 | 6;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        columns === 5 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        columns === 6 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}

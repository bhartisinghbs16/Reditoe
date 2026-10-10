import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The standard content container: a white card with a bold title on the left
 * and an action or "View All" link on the right.
 *
 * The reference draws no rule under a panel title — the padding separates the
 * header from the body — so `divided` is opt-in, for panels whose body is a
 * table that starts flush against the header.
 */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  /** Removes body padding — for tables that manage their own. */
  flush,
  /** Draws the rule the reference only uses above a flush table. */
  divided,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  divided?: boolean;
}) {
  return (
    // min-w-0: a Panel is always a grid or flex child, and those default to
    // min-width:auto — without this, one nowrap badge inside widens the
    // entire track and the page scrolls sideways on a phone.
    <section className={cn("surface flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <header
          className={cn(
            "flex items-center justify-between gap-3 px-4 pt-4",
            divided ? "pb-3.5 border-b border-border" : "pb-3"
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[0.9375rem] font-bold tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[0.8125rem] text-muted-foreground text-pretty">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("flex-1", !flush && "px-4 pb-4", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/**
 * "View All ›". The reference colours these indigo rather than brand red —
 * red is kept for actions that change something, so a link that only navigates
 * never competes with the Accept / Publish / Request Payout buttons near it.
 */
export function PanelLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-indigo-600 transition-opacity hover:opacity-80 dark:text-indigo-400",
        className
      )}
    >
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

/** Label/value row used in detail side panels. */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2.5 text-sm not-last:border-b not-last:border-border",
        className
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-semibold break-words">{value}</span>
    </div>
  );
}

/** Stacked label above a value — the reference's review / summary grids. */
export function FieldRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[0.8125rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

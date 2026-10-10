import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The standard content container: a titled surface with an optional action on
 * the right. Used for every chart, list and form block in the console.
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
  /** Anchor target, for in-page links like "View breakup". */
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    // min-w-0: a Panel is always a grid or flex child, and those default to
    // min-width:auto — without this, one nowrap badge inside widens the
    // entire track and the page scrolls sideways on a phone.
    <section id={id} className={cn("surface flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <header className="flex min-h-[3.5rem] items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
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
      <div className={cn("flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary transition-opacity hover:opacity-80"
    >
      {children}
      <ArrowRight className="size-3.5" />
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
        "flex items-start justify-between gap-4 py-2 text-sm not-last:border-b not-last:border-border/70",
        className
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{value}</span>
    </div>
  );
}

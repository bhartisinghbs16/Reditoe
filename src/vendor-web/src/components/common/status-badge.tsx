import * as React from "react";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

export type Tone =
  | "neutral"
  | "success"
  | "warning"
  | "info"
  | "violet"
  | "danger"
  | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  danger: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  brand: "bg-primary text-primary-foreground",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  violet: "bg-violet-500",
  danger: "bg-red-500",
  brand: "bg-primary-foreground",
};

/**
 * Single source of truth for how a domain status is coloured — matched to the
 * reference screens, where an order in flight is violet, one being cooked is
 * amber, and anything finished is green. Anything not listed falls back to
 * neutral rather than guessing.
 */
const statusTones: Record<string, Tone> = {
  // Orders
  new: "success",
  preparing: "warning",
  ready: "warning",
  ready_for_pickup: "warning",
  out_for_delivery: "violet",
  on_the_way: "violet",
  picked_up: "violet",
  delivered: "success",
  completed: "success",
  cancelled: "danger",
  canceled: "danger",
  rejected: "danger",
  failed: "danger",
  refunded: "neutral",

  // Accounts / verification
  active: "success",
  verified: "success",
  approved: "success",
  online: "success",
  inactive: "danger",
  offline: "neutral",
  draft: "neutral",
  suspended: "danger",
  blocked: "danger",
  busy: "warning",
  under_review: "warning",
  in_review: "warning",
  expired: "neutral",
  scheduled: "violet",

  // Money
  paid: "success",
  settled: "info",
  processing: "warning",
  unpaid: "warning",
  partial: "warning",
  overdue: "danger",

  // Support
  open: "warning",
  resolved: "success",
  closed: "neutral",
  escalated: "danger",
};

export function toneForStatus(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  return statusTones[status.toLowerCase().replace(/[\s-]+/g, "_")] ?? "neutral";
}

export function StatusBadge({
  status,
  tone,
  label,
  dot = true,
  className,
}: {
  status?: string | null;
  /** Overrides the status→tone mapping. */
  tone?: Tone;
  label?: string;
  dot?: boolean;
  className?: string;
}) {
  const resolved = tone ?? toneForStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold whitespace-nowrap",
        toneClasses[resolved],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dotClasses[resolved])} />}
      {label ?? titleCase(status)}
    </span>
  );
}

/**
 * The small square that marks a dish veg or non-veg, as Indian menus require.
 * Every screen that lists food shows one, so it lives beside the badges.
 */
export function VegMark({
  veg,
  className,
}: {
  veg: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px]",
        veg ? "border-emerald-600" : "border-red-600",
        className
      )}
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
    >
      <span
        className={cn("size-1.5 rounded-full", veg ? "bg-emerald-600" : "bg-red-600")}
      />
    </span>
  );
}

/** Item tags — Bestseller / Popular / New / Chef's Special, as coloured chips. */
const TAG_TONES: Record<string, string> = {
  Bestseller: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Popular: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  New: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "Chef's Special": "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

export function ItemTagChip({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap",
        TAG_TONES[tag] ?? "bg-muted text-muted-foreground"
      )}
    >
      {tag}
    </span>
  );
}

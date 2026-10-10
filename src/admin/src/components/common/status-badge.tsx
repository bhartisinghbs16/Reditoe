import * as React from "react";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

export type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-muted text-success-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  info: "bg-info-muted text-info-foreground",
  danger: "bg-danger-muted text-danger-foreground",
  accent: "bg-accent text-accent-foreground",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  accent: "bg-primary",
};

/**
 * Single source of truth for how a domain status is coloured. Anything not
 * listed falls back to neutral rather than guessing.
 */
const statusTones: Record<string, Tone> = {
  // Orders
  delivered: "success",
  completed: "success",
  picked_up: "info",
  pickedup: "info",
  out_for_delivery: "info",
  on_the_way: "info",
  ontheway: "info",
  confirmed: "warning",
  accepted: "warning",
  preparing: "accent",
  ready: "accent",
  pending: "warning",
  placed: "warning",
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
  inactive: "neutral",
  offline: "neutral",
  draft: "neutral",
  suspended: "danger",
  blocked: "danger",
  banned: "danger",
  busy: "warning",
  under_review: "warning",
  in_review: "warning",
  expired: "danger",
  scheduled: "info",

  // Money
  paid: "success",
  settled: "success",
  processing: "info",
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
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[resolved],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dotClasses[resolved])} />}
      {label ?? titleCase(status)}
    </span>
  );
}

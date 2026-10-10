"use client";

import * as React from "react";
import {
  BadgeIndianRupee,
  Check,
  ChefHat,
  CircleCheck,
  CircleX,
  Eye,
  Bike,
  Loader2,
  MapPin,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currency, time as formatTime } from "@/lib/format";
import { FoodThumb } from "@/components/common/food-thumb";
import { StatusBadge } from "@/components/common/status-badge";
import {
  CANCELLABLE,
  NEXT_STATUS,
  type Order,
  type OrderStage,
} from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/** The rail down the left edge — the reference's stage colour code. */
const railStyles: Record<OrderStage, string> = {
  new: "bg-emerald-500",
  preparing: "bg-orange-500",
  ready: "bg-amber-500",
  out_for_delivery: "bg-violet-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-500",
};

/** The glyph on the button that moves an order on from each state. */
const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "Accept Order": Check,
  "Start Preparing": ChefHat,
  "Mark as Ready": ShoppingBag,
  "Hand to Rider": Bike,
  "Mark Delivered": CircleCheck,
};

/** Minutes since the order landed — the number a kitchen actually works to. */
function waitingMinutes(placedAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(placedAt).getTime()) / 60_000));
}

function ago(minutes: number) {
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/* ── Buttons ────────────────────────────────────────────────────────────── */

const actionTones = {
  green: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300",
  red: "border-red-300 text-red-600 hover:bg-red-50 dark:text-red-300",
  violet: "border-violet-300 text-violet-700 hover:bg-violet-50 dark:text-violet-300",
  neutral: "border-border text-foreground hover:bg-muted",
} as const;

function ActionButton({
  icon: Icon,
  label,
  tone = "neutral",
  busy,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: keyof typeof actionTones;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border bg-card text-[0.8125rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        actionTones[tone]
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </button>
  );
}

/** A read-only state panel — "Delivered", "Cancelled". */
function StatePanel({
  icon: Icon,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "green" | "red";
}) {
  const tones = {
    green:
      "border-emerald-100 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    red: "border-red-100 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  } as const;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold",
        tones[tone]
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </div>
  );
}

/* ── Card ───────────────────────────────────────────────────────────────── */

export function OrderCard({
  order,
  onOpenDetail,
}: {
  order: Order;
  onOpenDetail?: () => void;
}) {
  const { advance, advancing } = useVendor();
  const next = NEXT_STATUS[order.status];
  const canCancel = CANCELLABLE.includes(order.status);
  const busy = advancing === order.id;

  // Re-render each minute so the waiting clock stays honest without a refresh.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const waiting = waitingMinutes(order.placedAt);
  const NextIcon = next ? (ACTION_ICON[next.label] ?? Check) : Check;

  return (
    <article className="surface relative min-w-0 overflow-hidden">
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", railStyles[order.stage])}
      />

      {/* The two clocks are computed from "now", so the server render and the
          client one can differ by a minute. Hydration corrects them. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 pr-4 pl-5">
        <StatusBadge status={order.stage} dot={false} />
        <span suppressHydrationWarning className="text-xs text-muted-foreground">
          {ago(waiting)}
        </span>
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-[0.9375rem] font-bold tracking-tight underline-offset-4 hover:underline"
        >
          #{order.reference}
        </button>
        <span suppressHydrationWarning className="ml-auto text-xs text-muted-foreground">
          {formatTime(order.placedAt)}
        </span>
      </header>

      <div className="grid gap-4 border-t border-border py-4 pr-4 pl-5 lg:grid-cols-[1.1fr_1.2fr_0.9fr] lg:gap-0">
        {/* Customer */}
        <div className="min-w-0 space-y-2.5 lg:pr-5">
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{order.customer}</p>
              <p className="truncate text-[0.8125rem] text-muted-foreground">
                {order.phone}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[0.8125rem] text-muted-foreground text-pretty">
              {order.address}
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="min-w-0 lg:border-x lg:border-border lg:px-5">
          <ul className="space-y-2">
            {order.lines.map((line, index) => (
              <li key={index} className="flex items-center gap-2.5">
                <FoodThumb
                  src={line.image}
                  name={line.name}
                  size={28}
                  rounded="rounded-full"
                />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                  {line.name}
                </span>
                <span
                  data-numeric
                  className="shrink-0 text-[0.8125rem] text-muted-foreground"
                >
                  x{line.quantity}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[0.8125rem]">
            <span className="text-muted-foreground">Total Items</span>
            <span data-numeric className="font-semibold">
              {order.itemCount}
            </span>
          </div>
        </div>

        {/* Money and the next action */}
        <div className="min-w-0 space-y-2.5 lg:pl-5">
          <div>
            <p data-numeric className="text-lg leading-tight font-bold">
              {currency(order.total, true)}
            </p>
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1.5 text-[0.8125rem] font-medium",
                order.payment === "COD" ? "text-blue-600" : "text-emerald-600"
              )}
            >
              <BadgeIndianRupee className="size-3.5" />
              {order.payment === "COD"
                ? "COD"
                : order.paid
                  ? "Online Payment"
                  : "Online · unpaid"}
            </p>
          </div>

          {/* One button per allowed transition, straight off the backend's
              state machine — a button here can never produce a 400. */}
          <div className="space-y-2">
            {next && (
              <ActionButton
                icon={NextIcon}
                label={next.label}
                tone={order.status === "Waiting for Confirmation" ? "green" : "violet"}
                busy={busy}
                onClick={() => advance(order.id, next.to)}
              />
            )}
            {canCancel && (
              <ActionButton
                icon={X}
                label="Reject"
                tone="red"
                busy={busy}
                onClick={() => advance(order.id, "Cancelled")}
              />
            )}
            {order.stage === "completed" && (
              <>
                <StatePanel icon={CircleCheck} label="Delivered" tone="green" />
                <ActionButton icon={Eye} label="View Details" onClick={onOpenDetail} />
              </>
            )}
            {order.stage === "cancelled" && (
              <>
                <StatePanel icon={CircleX} label="Cancelled" tone="red" />
                {order.cancelReason && (
                  <p className="text-[0.75rem] text-muted-foreground">
                    Reason: {order.cancelReason}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * The condensed row the dashboard's Recent Orders list uses — same colour
 * code, none of the detail.
 */
export function OrderMiniRow({ order }: { order: Order }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden
        className={cn("h-9 w-[3px] shrink-0 rounded-full", railStyles[order.stage])}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[0.8125rem] font-bold">#{order.reference}</p>
          <span
            suppressHydrationWarning
            className="shrink-0 text-[0.6875rem] text-muted-foreground"
          >
            {formatTime(order.placedAt)}
          </span>
        </div>
        <p className="truncate text-[0.75rem] text-muted-foreground">
          {order.customer} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
        </p>
      </div>
      <StatusBadge status={order.stage} dot={false} className="shrink-0" />
      <span data-numeric className="shrink-0 text-[0.8125rem] font-bold">
        {currency(order.total, true)}
      </span>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Ban,
  Bike,
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Hash,
  Info,
  MapPin,
  MessageSquare,
  NotebookPen,
  Package,
  Phone,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Share2,
  ShoppingBag,
  Star,
  Truck,
  Utensils,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { OrderRouteMap } from "@/components/orders/order-route-map";
import { OrderConversation } from "@/components/orders/order-conversation";
import { AssignRiderButton } from "@/components/orders/assign-rider";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCancelOrder,
  useOrder,
  useRefundOrder,
  useUpdateOrderNotes,
  useUpdateOrderStatus,
} from "@/lib/queries";
import { ORDER_STATUS_OPTIONS, orderAmountLines, orderStatusLabel } from "@/lib/domain";
import {
  currency,
  date as formatDate,
  dateTime,
  initials,
  number as formatNumber,
  phone as formatPhone,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, MenuItem, Order, Restaurant, Rider } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Order Details, built to the client's reference screen: a six-tile summary
 * strip, then items / summary / the party panels / a tracking rail, and a
 * payment breakdown with notes beneath.
 */

type Tint = "red" | "green" | "blue" | "amber" | "violet" | "rose";

const TINTS: Record<Tint, string> = {
  red: "bg-red-50 text-red-600",
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
};

/** The reference's stepper ladder, in the order an order moves through it. */
const TRACKING_STAGES = [
  { status: "Waiting for Confirmation", label: "Order Placed" },
  { status: "Order Confirmed", label: "Confirmed" },
  { status: "Processing", label: "Preparing" },
  { status: "Ready", label: "Picked Up" },
  { status: "OnWay", label: "On the Way" },
  { status: "Delivered", label: "Delivered" },
];

const REFUND_REASONS: Record<string, string[]> = {
  "Customer Cancelled": ["Ordered by Mistake", "Changed Mind", "Duplicate Order"],
  "Food Quality Issue": ["Food was not fresh", "Taste issue", "Spillage"],
  "Late Delivery": ["Delivery was too late", "Order never arrived"],
  "Wrong Item Received": ["Received different item", "Item missing"],
  "Restaurant Cancelled": ["Kitchen closed", "Item unavailable"],
  Other: [],
};

/* ── Small pieces the screen repeats ────────────────────────────────────── */

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  hintTone,
  tint,
}: {
  icon: typeof Receipt;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: "link" | "success";
  tint: Tint;
}) {
  return (
    <div className="surface flex items-start gap-2.5 p-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          TINTS[tint]
        )}
      >
        <Icon className="size-[1.05rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p data-numeric className="mt-0.5 truncate text-base font-semibold tracking-tight">
          {value}
        </p>
        {hint && (
          <p
            className={cn(
              "mt-0.5 truncate text-[0.6875rem]",
              hintTone === "link" && "font-medium text-primary",
              hintTone === "success" && "font-medium text-emerald-600",
              !hintTone && "text-muted-foreground"
            )}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        } catch {
          toast.error("Couldn't copy to the clipboard");
        }
      }}
    >
      <Copy className="size-3.5" />
    </button>
  );
}

/** Icon-led label/value row — the shape of the Order Summary panel. */
function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-right font-medium break-words">
        {children}
      </span>
    </div>
  );
}

function PartyLine({
  icon: Icon,
  children,
}: {
  icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-[0.8125rem]">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

function BreakdownLine({
  label,
  value,
  info,
  tone,
  chip,
}: {
  label: string;
  value: React.ReactNode;
  info?: boolean;
  tone?: "danger";
  chip?: "success" | "info";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[0.8125rem]">
      <span
        className={cn(
          "flex items-center gap-1",
          tone === "danger" ? "font-semibold text-primary" : "text-muted-foreground"
        )}
      >
        {label}
        {info && <Info className="size-3 opacity-60" />}
      </span>
      {chip ? (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-semibold",
            chip === "success"
              ? "bg-success-muted text-success-foreground"
              : "bg-info-muted text-info-foreground"
          )}
        >
          {value}
        </span>
      ) : (
        <span
          data-numeric
          className={cn(
            "font-medium tabular-nums",
            tone === "danger" && "text-base font-semibold text-primary"
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const order = useOrder(params.id);

  if (order.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.75rem] w-full" />
          ))}
        </div>
        <Skeleton className="mt-3 h-96 w-full" />
      </>
    );
  }

  if (order.isError) {
    return (
      <div className="surface">
        <ErrorState
          title="Couldn't load this order"
          description={order.error?.message}
          onRetry={() => order.refetch()}
        />
      </div>
    );
  }

  if (!order.data) {
    return (
      <div className="surface">
        <EmptyState
          title="Order not found"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/orders">Back to orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <OrderDetail order={order.data} />;
}

function OrderDetail({ order }: { order: Order }) {
  const customer = refDoc<Customer>(order.userId);
  const restaurant = refDoc<Restaurant>(order.restaurantId);
  const rider = refDoc<Rider>(order.riderId);

  const updateStatus = useUpdateOrderStatus();
  const cancelOrder = useCancelOrder();
  const refundOrder = useRefundOrder();
  const updateNotes = useUpdateOrderNotes();

  const [notes, setNotes] = React.useState(order.adminNotes ?? "");
  const [addingNote, setAddingNote] = React.useState(false);
  const [nextStatus, setNextStatus] = React.useState("");

  const reference = order.orderNumber;
  const terminal = order.status === "Delivered" || order.status === "Cancelled";
  const cancelled = order.status === "Cancelled";
  const amountLines = orderAmountLines(order);
  /** The tax charged on the fees rather than on the food. Never below zero. */
  const gstOnFees = Math.max(
    0,
    (order.gstAndPackaging ?? 0) - (order.tax ?? 0) - (order.packagingFee ?? 0)
  );
  const itemCount = (order.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 1),
    0
  );
  const commission = restaurant?.commissionPercent
    ? ((order.subtotal ?? 0) * restaurant.commissionPercent) / 100
    : (order.platformFee ?? 0);
  const restaurantEarns = Math.max((order.subtotal ?? 0) - commission, 0);

  const address = order.deliveryAddress;
  const addressLine = address
    ? [address.street, address.city, address.state, address.zipCode]
        .filter(Boolean)
        .join(", ")
    : null;

  /** Timestamp for a stage, taken from the timeline the backend records. */
  const stageTime = React.useCallback(
    (status: string) =>
      order.timeline?.find((entry) => entry.status === status)?.timestamp,
    [order.timeline]
  );
  const reachedIndex = TRACKING_STAGES.reduce(
    (last, stage, index) => (stageTime(stage.status) ? index : last),
    order.createdAt ? 0 : -1
  );

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  return (
    <>
      <PageHeader
        title={`Order Details - ${reference}`}
        badge={
          <StatusBadge
            status={order.status}
            label={orderStatusLabel(order.status)}
            className="px-2.5 py-1 text-[0.8125rem]"
          />
        }
        description={`Order placed on ${dateTime(order.createdAt)}`}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: "Order Details" },
        ]}
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print Invoice
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied to the clipboard");
                } catch {
                  toast.error("Couldn't copy the link");
                }
              }}
            >
              <Share2 className="size-4" />
              Share
            </Button>
            <RefundDialog
              order={order}
              customer={customer}
              pending={refundOrder.isPending}
              onConfirm={(amount, reason) =>
                run(
                  () => refundOrder.mutateAsync({ id: order._id, amount, reason }),
                  "Refund recorded"
                )
              }
            />
          </>
        }
      />

      {/* Summary strip — the six figures the reference puts above everything. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryTile
          icon={Receipt}
          tint="amber"
          label="Order Amount"
          value={currency(order.total)}
          hint={<a href="#payment-breakdown">View Breakup</a>}
          hintTone="link"
        />
        <SummaryTile
          icon={CreditCard}
          tint="green"
          label="Payment Method"
          value={order.paymentMethod ?? "—"}
          hint={order.paymentStatus ?? undefined}
          hintTone="success"
        />
        <SummaryTile
          icon={Bike}
          tint="blue"
          label="Order Type"
          value={order.deliveryAddress ? "Delivery" : "Pickup"}
        />
        <SummaryTile
          icon={ShoppingBag}
          tint="amber"
          label="Total Items"
          value={`${formatNumber(itemCount)} ${itemCount === 1 ? "Item" : "Items"}`}
        />
        <SummaryTile
          icon={Truck}
          tint="violet"
          label="Delivery Charge"
          value={currency(order.deliveryFee ?? 0)}
          hint={<a href="#payment-breakdown">View Breakup</a>}
          hintTone="link"
        />
        <SummaryTile
          icon={Package}
          tint="rose"
          label="Platform Fee"
          value={currency(order.platformFee ?? 0, true)}
          hint={<a href="#payment-breakdown">View Breakup</a>}
          hintTone="link"
        />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[1.5fr_1.1fr_1fr_0.95fr]">
        {/* Items and what they add up to. */}
        <Panel title="Order Items" flush>
          {(order.items?.length ?? 0) === 0 ? (
            <EmptyState title="No items on this order" />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[0.6875rem] text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Item
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items!.map((item, index) => {
                  const menuItem = refDoc<MenuItem>(item.foodItemId);
                  const addons = (item.selectedAddons ?? [])
                    .map((addon) => addon.name)
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <tr
                      key={item._id ?? index}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-9 shrink-0 rounded-md">
                            {menuItem?.image && (
                              <AvatarImage
                                src={menuItem.image}
                                alt=""
                                className="rounded-md object-cover"
                              />
                            )}
                            <AvatarFallback className="rounded-md bg-muted">
                              <Utensils className="size-4 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-[0.8125rem] font-medium">
                              {item.name ?? "Item"}
                            </div>
                            {addons && (
                              <div className="truncate text-[0.6875rem] text-muted-foreground">
                                {addons}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right text-[0.8125rem] tabular-nums">
                        {item.quantity ?? 1}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[0.8125rem] tabular-nums">
                        {currency(item.price)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-medium tabular-nums">
                        {currency((item.price ?? 0) * (item.quantity ?? 1))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="border-t border-border px-4 py-3">
            {amountLines
              .filter((line) => !line.emphasis)
              .map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between gap-3 py-1.5 text-[0.8125rem]"
                >
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="tabular-nums">
                    {line.negative ? "−" : ""}
                    {currency(line.value, true)}
                  </span>
                </div>
              ))}
          </div>

          <div className="mx-4 mb-4 flex items-center justify-between rounded-lg bg-primary/8 px-4 py-3">
            <span className="text-sm font-semibold text-primary">Total Amount</span>
            <span data-numeric className="text-lg font-semibold text-primary">
              {currency(order.total)}
            </span>
          </div>
        </Panel>

        {/* The order's own facts. */}
        <Panel title="Order Summary" bodyClassName="px-4 py-1">
          <SummaryRow icon={Hash} label="Order ID">
            {reference}
            <CopyButton value={reference} label="Order ID" />
          </SummaryRow>
          <SummaryRow icon={Clock} label="Order Time">
            {dateTime(order.createdAt)}
          </SummaryRow>
          <SummaryRow icon={CreditCard} label="Payment Status">
            <StatusBadge status={order.paymentStatus} dot={false} />
          </SummaryRow>
          {order.razorpayPaymentId && (
            <SummaryRow icon={Wallet} label="Payment ID">
              <span className="truncate font-mono text-xs">
                {order.razorpayPaymentId}
              </span>
              <CopyButton value={order.razorpayPaymentId} label="Payment ID" />
            </SummaryRow>
          )}
          <SummaryRow icon={Bike} label="Order Type">
            {order.deliveryAddress ? "Delivery" : "Pickup"}
          </SummaryRow>
          <SummaryRow icon={MapPin} label="Delivery Address">
            {addressLine ? (
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-[0.75rem] leading-snug font-normal">
                  {addressLine}
                </span>
                {/*
                  Was a Google Maps search for the address, which showed a pin
                  on a street and nothing about the delivery. It now goes to
                  the route below: where it was collected, where it went, and
                  the way the rider took.
                */}
                <a
                  href="#delivery-route"
                  className="text-[0.6875rem] font-medium text-primary hover:underline"
                >
                  View Map
                </a>
              </span>
            ) : (
              "—"
            )}
          </SummaryRow>
          {order.couponCode && (
            <SummaryRow icon={Receipt} label="Coupon">
              {order.couponCode}
            </SummaryRow>
          )}
          <SummaryRow icon={MessageSquare} label="Special Instructions">
            {order.notes ? (
              <span className="text-[0.75rem] leading-snug font-normal">
                {order.notes}
              </span>
            ) : (
              "—"
            )}
          </SummaryRow>
          <SummaryRow icon={NotebookPen} label="Note">
            {order.adminNotes ? (
              <span className="text-[0.75rem] leading-snug font-normal">
                {order.adminNotes}
              </span>
            ) : (
              "—"
            )}
          </SummaryRow>
        </Panel>

        {/* Who the order belongs to. */}
        <div className="flex flex-col gap-3">
          <Panel title="Customer Details">
            {customer ? (
              <>
                <div className="flex items-start gap-2.5">
                  <Avatar className="size-10">
                    <AvatarImage src={customer.avatar ?? customer.profilePhoto} alt="" />
                    <AvatarFallback>{initials(customer.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {customer.name ?? "Customer"}
                      </span>
                      <Link
                        href={`/customers/${customer._id}`}
                        className="shrink-0 text-[0.75rem] font-medium text-primary hover:underline"
                      >
                        View Profile
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <PartyLine icon={Phone}>{formatPhone(customer.phone)}</PartyLine>
                  {customer.email && (
                    <PartyLine icon={MessageSquare}>{customer.email}</PartyLine>
                  )}
                </div>
                <div className="mt-3 border-t border-border/70 pt-2.5">
                  <div className="flex items-center justify-between py-1 text-[0.8125rem]">
                    <span className="text-muted-foreground">Total Orders</span>
                    <span className="font-medium tabular-nums">
                      {formatNumber(customer.totalOrders)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-[0.8125rem]">
                    <span className="text-muted-foreground">Member Since</span>
                    <span className="font-medium">{formatDate(customer.createdAt)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Guest checkout.</p>
            )}
          </Panel>

          <Panel title="Restaurant Details">
            {restaurant ? (
              <>
                <div className="flex items-start gap-2.5">
                  <Avatar className="size-10 shrink-0 rounded-md">
                    {restaurant.image && (
                      <AvatarImage
                        src={restaurant.image}
                        alt=""
                        className="rounded-md object-cover"
                      />
                    )}
                    <AvatarFallback className="rounded-md bg-muted">
                      <Utensils className="size-4 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {restaurant.name ?? "Restaurant"}
                    </div>
                    <div className="truncate text-[0.75rem] text-muted-foreground">
                      {restaurant.address?.city ?? "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <PartyLine icon={Phone}>{formatPhone(restaurant.phone)}</PartyLine>
                </div>
                <Link
                  href={`/restaurants/${restaurant._id}`}
                  className="mt-2.5 inline-flex items-center gap-1 text-[0.75rem] font-medium text-primary hover:underline"
                >
                  View Restaurant
                  <ChevronRight className="size-3" />
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not available.</p>
            )}
          </Panel>

          <Panel title="Delivery Partner Details">
            {rider ? (
              <>
                <div className="flex items-start gap-2.5">
                  <Avatar className="size-10">
                    <AvatarImage src={rider.image} alt="" />
                    <AvatarFallback>{initials(rider.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {rider.name ?? "Partner"}
                      </span>
                      {(rider.currentRating ?? rider.rating) !== undefined && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[0.75rem] font-medium">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {(rider.currentRating ?? rider.rating)!.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">
                      {[rider.vehicleName ?? rider.vehicleType, rider.vehicleNumber]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <PartyLine icon={Phone}>{formatPhone(rider.phone)}</PartyLine>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <a href={`tel:${rider.phone ?? ""}`}>
                      <Phone className="size-3.5" />
                      Call
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/support?rider=${rider._id}`}>
                      <MessageSquare className="size-3.5" />
                      Chat
                    </Link>
                  </Button>
                </div>
                <div className="mt-2">
                  <AssignRiderButton orderId={order._id} assigned disabled={terminal} />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {terminal
                    ? "This order finished without a delivery partner recorded."
                    : "No delivery partner has taken this order yet."}
                </p>
                {/*
                  Dispatch offers an order round and gives up when nobody
                  takes it. Without this the order simply sat here and the
                  only way to move it on was the database.
                */}
                {!terminal && <AssignRiderButton orderId={order._id} />}
              </div>
            )}
          </Panel>
        </div>

        {/* Where the order has got to, and how to move it on. */}
        <Panel title="Order Tracking">
          <ol className="relative space-y-4 pl-8">
            <span
              aria-hidden
              className="absolute top-2 bottom-2 left-[0.6875rem] w-px bg-border"
            />
            {TRACKING_STAGES.map((stage, index) => {
              // On a finished order the last stage reached is complete, not
              // in-flight — only a live order has a blue "current" step.
              const done = index < reachedIndex || (index === reachedIndex && terminal);
              const current = index === reachedIndex && !terminal;
              const timestamp = stageTime(stage.status) ?? (index === 0 ? order.createdAt : null);
              return (
                <li key={stage.status} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-0 -left-8 flex size-6 items-center justify-center rounded-full ring-4 ring-card",
                      done && "bg-success text-white",
                      current && "bg-info text-white",
                      !done && !current && "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" />
                    ) : current ? (
                      <Bike className="size-3.5" />
                    ) : (
                      <Clock className="size-3" />
                    )}
                  </span>
                  <div
                    className={cn(
                      "text-[0.8125rem] font-medium",
                      current && "text-info-foreground",
                      !done && !current && "text-muted-foreground"
                    )}
                  >
                    {stage.label}
                  </div>
                  <div className="text-[0.6875rem] text-muted-foreground">
                    {timestamp ? dateTime(timestamp) : "—"}
                  </div>
                </li>
              );
            })}
          </ol>

          {cancelled && (
            <p className="mt-3 rounded-lg bg-danger-muted px-3 py-2 text-[0.75rem] text-danger-foreground">
              Cancelled{order.cancellationReason ? ` — ${order.cancellationReason}` : ""}.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger disabled={terminal}>
                <SelectValue placeholder="Advance to…" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!nextStatus || terminal || updateStatus.isPending}
              onClick={() =>
                run(
                  () => updateStatus.mutateAsync({ id: order._id, status: nextStatus }),
                  "Status updated"
                )
              }
            >
              Update Status
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={terminal}>
                  <Ban className="size-3.5" />
                  Cancel Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel this order?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Cancellation is final. The customer and the restaurant are notified.
                </p>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Keep order</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        run(
                          () =>
                            cancelOrder.mutateAsync({
                              id: order._id,
                              reason: "Cancelled by admin",
                            }),
                          "Order cancelled"
                        )
                      }
                    >
                      Cancel order
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {terminal && (
              <p className="text-[0.6875rem] text-muted-foreground">
                {orderStatusLabel(order.status)} is a final state.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Delivery Route" className="mt-3 scroll-mt-20" id="delivery-route">
        <p className="mb-3 text-[0.8125rem] text-muted-foreground">
          Where this order was collected, where it was delivered, and the route
          the delivery partner took. Nothing else is shown.
        </p>
        <OrderRouteMap orderId={order._id} />
      </Panel>

      {/*
        Kept beside the route because they answer the same question together:
        where the partner went, and what was said while they were going.
      */}
      <Panel title="Customer & Partner Messages" className="mt-3 scroll-mt-20" id="order-chat">
        <p className="mb-3 text-[0.8125rem] text-muted-foreground">
          What the customer and the delivery partner said to each other on this
          order. Read-only.
        </p>
        <OrderConversation orderId={order._id} />
      </Panel>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[2fr_1fr]">
        {/*
          `gstAndPackaging` is the entire tax charge on the order: GST on the
          food, GST on the delivery and platform fees, and packaging. `tax` is
          the food's share of it. This line wants what is left once the food's
          share and the packaging are taken out - printing the whole figure
          here showed it twice and made the breakdown add up to more than the
          total beneath it.
        */}
        <Panel title="Payment Breakdown" className="scroll-mt-20" id="payment-breakdown">
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <BreakdownLine label="Item Total" value={currency(order.subtotal, true)} />
              <BreakdownLine
                label="Restaurant Packaging Charge"
                value={currency(order.packagingFee ?? 0, true)}
              />
              <BreakdownLine
                label="Delivery Charge"
                value={currency(order.deliveryFee ?? 0, true)}
              />
            </div>
            <div>
              <BreakdownLine
                label="Platform Fee"
                info
                value={currency(order.platformFee ?? 0, true)}
              />
              <BreakdownLine
                label="GST on Items"
                value={currency(order.tax ?? 0, true)}
              />
              <BreakdownLine
                label="GST on Delivery & Platform Fee"
                value={currency(gstOnFees, true)}
              />
            </div>
            <div>
              <BreakdownLine
                label="Total Amount Paid"
                tone="danger"
                value={currency(order.total, true)}
              />
              <BreakdownLine
                label="You Earn (Restaurant)"
                chip="success"
                value={currency(restaurantEarns, true)}
              />
              <BreakdownLine
                label="Reditoe Commission"
                chip="info"
                value={currency(commission, true)}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="Order Notes"
          action={
            !addingNote && (
              <Button variant="outline" size="sm" onClick={() => setAddingNote(true)}>
                <Plus className="size-3.5" />
                Add Note
              </Button>
            )
          }
        >
          {addingNote ? (
            <div className="space-y-2">
              <Label htmlFor="order-notes" className="sr-only">
                Internal note
              </Label>
              <Textarea
                id="order-notes"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add context for the next person who opens this order…"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNotes(order.adminNotes ?? "");
                    setAddingNote(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateNotes.isPending || notes === (order.adminNotes ?? "")}
                  onClick={async () => {
                    await run(
                      () =>
                        updateNotes.mutateAsync({ id: order._id, adminNotes: notes }),
                      "Notes saved"
                    );
                    setAddingNote(false);
                  }}
                >
                  <NotebookPen className="size-3.5" />
                  Save
                </Button>
              </div>
            </div>
          ) : order.adminNotes ? (
            <p className="text-[0.8125rem] whitespace-pre-line">{order.adminNotes}</p>
          ) : (
            <p className="text-[0.8125rem] text-muted-foreground">
              No notes added for this order.
            </p>
          )}
          <p className="mt-3 text-[0.6875rem] text-muted-foreground">
            Notes are visible to admins only — never shown to the customer.
          </p>
        </Panel>
      </div>
    </>
  );
}

/* ── Refund ─────────────────────────────────────────────────────────────── */

function RefundDialog({
  order,
  customer,
  pending,
  onConfirm,
}: {
  order: Order;
  customer: Customer | null;
  pending: boolean;
  onConfirm: (amount: number, reason: string | undefined) => void;
}) {
  const max = order.total ?? 0;
  const [mode, setMode] = React.useState("full");
  const [amount, setAmount] = React.useState(String(max));
  const [reason, setReason] = React.useState("");
  const [subReason, setSubReason] = React.useState("");
  const [note, setNote] = React.useState("");

  const value = mode === "full" ? max : Math.min(Number(amount) || 0, max);
  const reasonLine = [reason, subReason, note].filter(Boolean).join(" — ");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg">
          <RotateCcw className="size-4" />
          Refund Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Refund Order -{" "}
            {order.orderNumber}
          </DialogTitle>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-lg bg-warning-muted px-3 py-2.5 text-[0.8125rem] text-warning-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          Confirm the refund details. The amount is returned to the customer through
          their original payment method.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-[0.8125rem] font-semibold">1. Refund Amount</h3>
            <RadioGroup value={mode} onValueChange={setMode} className="mt-2 gap-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="full" id="refund-full" className="mt-0.5" />
                <div className="min-w-0">
                  <Label htmlFor="refund-full" className="text-[0.8125rem]">
                    Full Refund ({currency(max, true)})
                  </Label>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Refund the full order amount to the customer.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="partial" id="refund-partial" className="mt-0.5" />
                <div className="min-w-0">
                  <Label htmlFor="refund-partial" className="text-[0.8125rem]">
                    Partial Refund
                  </Label>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Refund a specific amount to the customer.
                  </p>
                </div>
              </div>
            </RadioGroup>

            <div className="mt-3 space-y-1.5">
              <Label htmlFor="refund-amount">Refund Amount (₹)</Label>
              <div className="relative">
                <Input
                  id="refund-amount"
                  type="number"
                  min={0}
                  max={max}
                  disabled={mode === "full"}
                  value={mode === "full" ? max : amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.6875rem] text-muted-foreground">
                  Max: {currency(max)}
                </span>
              </div>
            </div>

            <div className="mt-3 border-t border-border pt-2">
              <p className="text-[0.75rem] font-semibold">Refund Breakdown</p>
              {orderAmountLines(order)
                .filter((line) => !line.emphasis)
                .map((line) => (
                  <div
                    key={line.label}
                    className="flex items-center justify-between gap-3 py-1 text-[0.75rem]"
                  >
                    <span className="text-muted-foreground">{line.label}</span>
                    <span className="tabular-nums">{currency(line.value, true)}</span>
                  </div>
                ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1.5 text-[0.8125rem] font-semibold">
                <span className="text-emerald-600">Total Refund Amount</span>
                <span className="tabular-nums text-emerald-600">
                  {currency(value, true)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[0.8125rem] font-semibold">2. Refund Reason</h3>
            <div className="mt-2 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">
                  Select Reason <span className="text-primary">*</span>
                </Label>
                <Select
                  value={reason}
                  onValueChange={(next) => {
                    setReason(next);
                    setSubReason("");
                  }}
                >
                  <SelectTrigger id="refund-reason">
                    <SelectValue placeholder="Choose a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(REFUND_REASONS).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(REFUND_REASONS[reason]?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="refund-sub-reason">Sub Reason (Optional)</Label>
                  <Select value={subReason} onValueChange={setSubReason}>
                    <SelectTrigger id="refund-sub-reason">
                      <SelectValue placeholder="Choose a sub reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REFUND_REASONS[reason].map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="refund-note">Additional Notes (Optional)</Label>
                <Textarea
                  id="refund-note"
                  rows={3}
                  maxLength={200}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Anything the finance team should know…"
                />
                <p className="text-right text-[0.6875rem] text-muted-foreground">
                  {note.length}/200
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <h3 className="text-[0.8125rem] font-semibold">3. Refund Summary</h3>
          <div className="mt-1.5 grid gap-x-8 sm:grid-cols-2">
            <BreakdownLine
              label="Refund To"
              value={customer?.name ?? "Customer"}
            />
            <BreakdownLine label="Refund Amount" value={currency(value, true)} />
            <BreakdownLine
              label="Refund Method"
              value={`Original method${order.paymentMethod ? ` (${order.paymentMethod})` : ""}`}
            />
            <BreakdownLine label="Estimated Refund Time" value="5 – 10 minutes" />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              disabled={pending || value <= 0 || !reason}
              onClick={() => onConfirm(value, reasonLine || undefined)}
            >
              <RotateCcw className="size-4" />
              Confirm Refund
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

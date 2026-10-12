"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bike,
  Check,
  Clock,
  Copy,
  CreditCard,
  Hash,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  Share2,
  ShoppingBag,
  Star,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrder } from "@/lib/queries";
import { orderStatusLabel } from "@/lib/domain";
import {
  currency,
  dateTime,
  initials,
  number as formatNumber,
  phone as formatPhone,
  time as formatTime,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Customer, Order, Restaurant, Rider } from "@/lib/types";

/**
 * Order Summary with live tracking, built to the client's reference screen:
 * the order's facts and the three parties down the left, the tracking panel
 * and a horizontal status stepper on the right.
 *
 * The map itself needs a Google Maps key, which isn't configured — and no
 * coordinates are stored on an order, restaurant or rider either, so even with
 * a key there would be nothing to plot. The panel shows the route as the three
 * places it runs between and says exactly what is missing, rather than
 * rendering a decorative map of nowhere.
 */

/** The reference's horizontal stepper, in the order an order moves through. */
const STAGES = [
  { status: "Waiting for Confirmation", label: "Order Placed" },
  { status: "Order Confirmed", label: "Confirmed" },
  { status: "Processing", label: "Preparing" },
  { status: "Ready", label: "Picked Up" },
  { status: "OnWay", label: "On the Way" },
  { status: "Delivered", label: "Delivered" },
];

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

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[0.8125rem] not-last:border-b not-last:border-border/70">
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

/** One stop on the route — restaurant, partner, customer. */
function Stop({
  icon: Icon,
  tint,
  title,
  subtitle,
  detail,
  last,
}: {
  icon: typeof MapPin;
  tint: string;
  title: string;
  subtitle?: string;
  detail?: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="absolute top-9 bottom-1 left-[1.0625rem] w-px bg-border"
        />
      )}
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          tint
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium">{title}</p>
        {subtitle && (
          <p className="text-[0.75rem] text-muted-foreground">{subtitle}</p>
        )}
        {detail && (
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{detail}</p>
        )}
      </div>
    </li>
  );
}

export default function OrderTrackPage() {
  const params = useParams<{ id: string }>();
  const order = useOrder(params.id);

  if (order.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-72" />
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_2fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
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
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/orders">Back to orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <OrderTrack order={order.data} />;
}

function OrderTrack({ order }: { order: Order }) {
  const customer = refDoc<Customer>(order.userId);
  const restaurant = refDoc<Restaurant>(order.restaurantId);
  const rider = refDoc<Rider>(order.riderId);

  const reference = order.orderNumber;
  const terminal = order.status === "Delivered" || order.status === "Cancelled";
  const itemCount = (order.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 1),
    0
  );

  const stageTime = React.useCallback(
    (status: string) =>
      order.timeline?.find((entry) => entry.status === status)?.timestamp,
    [order.timeline]
  );
  const reached = STAGES.reduce(
    (last, stage, index) => (stageTime(stage.status) ? index : last),
    order.createdAt ? 0 : -1
  );

  const address = order.deliveryAddress;
  const addressLine = address
    ? [address.street, address.city, address.state, address.zipCode]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <>
      <PageHeader
        title={`Order Summary - ${reference}`}
        badge={
          <StatusBadge
            status={order.status}
            label={orderStatusLabel(order.status)}
            className="px-2.5 py-1 text-[0.8125rem]"
          />
        }
        description={`Placed on ${dateTime(order.createdAt)}`}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: "Order Details", href: `/orders/${order._id}` },
          { label: "Order Summary" },
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
            <Button asChild size="lg">
              <Link href={`/orders/${order._id}#refund`}>Refund Order</Link>
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[1fr_2fr]">
        {/* The order and its parties. */}
        <div className="flex flex-col gap-3">
          <Panel title="Order Summary" bodyClassName="px-4 py-1">
            <Row icon={Hash} label="Order ID">
              {reference}
              <CopyButton value={reference} label="Order ID" />
            </Row>
            <Row icon={Clock} label="Order Time">
              {dateTime(order.createdAt)}
            </Row>
            <Row icon={CreditCard} label="Payment Method">
              {order.paymentMethod ?? "—"}
            </Row>
            <Row icon={Wallet} label="Payment Status">
              <StatusBadge status={order.paymentStatus} dot={false} />
            </Row>
            <Row icon={Bike} label="Order Type">
              {order.deliveryAddress ? "Delivery" : "Pickup"}
            </Row>
            <Row icon={ShoppingBag} label="Total Items">
              {formatNumber(itemCount)} {itemCount === 1 ? "item" : "items"}
            </Row>
            <Row icon={Wallet} label="Total Amount">
              {currency(order.total, true)}
            </Row>
          </Panel>

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
                      <span className="truncate text-[0.8125rem] font-semibold">
                        {customer.name ?? "Customer"}
                      </span>
                      <Link
                        href={`/customers/${customer._id}`}
                        className="shrink-0 text-[0.6875rem] font-medium text-primary hover:underline"
                      >
                        View Profile
                      </Link>
                    </div>
                    <p className="mt-1 text-[0.75rem] text-muted-foreground">
                      {formatPhone(customer.phone)}
                    </p>
                    {customer.email && (
                      <p className="truncate text-[0.75rem] text-muted-foreground">
                        {customer.email}
                      </p>
                    )}
                  </div>
                </div>
                {addressLine && (
                  <p className="mt-2.5 flex items-start gap-2 border-t border-border pt-2.5 text-[0.75rem] text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{addressLine}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">Guest checkout.</p>
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
                      <span className="truncate text-[0.8125rem] font-semibold">
                        {rider.name ?? "Partner"}
                      </span>
                      {(rider.currentRating ?? rider.rating) !== undefined && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[0.75rem] font-medium">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {(rider.currentRating ?? rider.rating)!.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.75rem] text-muted-foreground">
                      {formatPhone(rider.phone)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <a href={`tel:${rider.phone ?? ""}`}>
                      <Phone className="size-3.5" />
                      Call
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/support?riderId=${rider._id}`}>
                      <MessageSquare className="size-3.5" />
                      Chat
                    </Link>
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-2.5">
                  <div>
                    <p className="text-[0.6875rem] text-muted-foreground">Vehicle</p>
                    <p className="text-[0.8125rem] font-medium">
                      {rider.vehicleName ?? rider.vehicleType ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Number Plate
                    </p>
                    <p className="text-[0.8125rem] font-medium">
                      {rider.vehicleNumber ?? "—"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">
                No delivery partner assigned yet.
              </p>
            )}
          </Panel>

          <Panel title="Restaurant Details">
            {restaurant ? (
              <div className="flex items-start gap-2.5">
                <Avatar className="size-10 rounded-md">
                  {restaurant.image && (
                    <AvatarImage
                      src={restaurant.image}
                      alt=""
                      className="rounded-md object-cover"
                    />
                  )}
                  <AvatarFallback className="rounded-md bg-muted">
                    <UtensilsCrossed className="size-4 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[0.8125rem] font-semibold">
                      {restaurant.name ?? "Restaurant"}
                    </span>
                    <Link
                      href={`/restaurants/${restaurant._id}`}
                      className="shrink-0 text-[0.6875rem] font-medium text-primary hover:underline"
                    >
                      View Restaurant
                    </Link>
                  </div>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    {formatPhone(restaurant.phone)}
                  </p>
                  <p className="truncate text-[0.75rem] text-muted-foreground">
                    {[restaurant.address?.city, restaurant.address?.state]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">Not available.</p>
            )}
          </Panel>
        </div>

        {/* Where it is, and how far along. */}
        <div className="flex flex-col gap-3">
          <Panel title="Live Order Tracking">
            <ol className="relative">
              <Stop
                icon={UtensilsCrossed}
                tint="bg-amber-50 text-amber-600"
                title={restaurant?.name ?? "Restaurant"}
                subtitle="Pickup"
                detail={
                  [restaurant?.address?.street, restaurant?.address?.city]
                    .filter(Boolean)
                    .join(", ") || undefined
                }
              />
              <Stop
                icon={Bike}
                tint={
                  rider
                    ? "bg-sky-50 text-sky-600"
                    : "bg-muted text-muted-foreground"
                }
                title={rider?.name ?? "Not assigned"}
                subtitle={
                  rider
                    ? orderStatusLabel(order.status)
                    : "Waiting for a delivery partner"
                }
                detail={
                  rider
                    ? [rider.vehicleName ?? rider.vehicleType, rider.vehicleNumber]
                        .filter(Boolean)
                        .join(" · ")
                    : undefined
                }
              />
              <Stop
                last
                icon={MapPin}
                tint="bg-rose-50 text-rose-600"
                title={customer?.name ?? "Customer"}
                subtitle="Drop-off"
                detail={addressLine ?? undefined}
              />
            </ol>

            {/*
              No latitude or longitude is stored on an order, restaurant or
              rider, and no Maps key is configured — so a map here would plot
              nothing. The route reads as its three stops instead, and the
              note says exactly what is needed to draw it.
            */}
            <p className="mt-3 rounded-lg bg-info-muted px-3 py-2.5 text-[0.75rem] text-info-foreground">
              A live map needs two things this build doesn&apos;t have: coordinates on
              the order, restaurant and rider records, and a Google Maps key in
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. The stops above are the route the
              order actually takes.
            </p>
          </Panel>

          <Panel title="Order Status">
            <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {STAGES.map((stage, index) => {
                const done = index < reached || (index === reached && terminal);
                const current = index === reached && !terminal;
                const timestamp =
                  stageTime(stage.status) ?? (index === 0 ? order.createdAt : null);
                return (
                  <li key={stage.status} className="min-w-0 text-center">
                    <span
                      className={cn(
                        "mx-auto flex size-8 items-center justify-center rounded-full",
                        done && "bg-success text-white",
                        current && "bg-info text-white",
                        !done && !current && "bg-muted text-muted-foreground"
                      )}
                    >
                      {done ? (
                        <Check className="size-4" />
                      ) : current ? (
                        <Bike className="size-4" />
                      ) : (
                        <Clock className="size-3.5" />
                      )}
                    </span>
                    <p
                      className={cn(
                        "mt-1.5 truncate text-[0.75rem] font-medium",
                        !done && !current && "text-muted-foreground"
                      )}
                    >
                      {stage.label}
                    </p>
                    <p className="text-[0.6875rem] text-muted-foreground">
                      {timestamp ? formatTime(timestamp) : "—"}
                    </p>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-info-muted px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[0.6875rem] text-info-foreground/80">
                  Estimated delivery time
                </p>
                <p className="text-base font-semibold text-info-foreground">
                  {restaurant?.deliveryTime ?? "—"}
                </p>
                <p className="text-[0.6875rem] text-info-foreground/80">
                  {/* Not a live ETA: it's the window the restaurant advertises. */}
                  The restaurant&apos;s stated window, not a live estimate.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/orders/${order._id}`}>
                  <ArrowLeft className="size-3.5" />
                  Back to Order Details
                </Link>
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

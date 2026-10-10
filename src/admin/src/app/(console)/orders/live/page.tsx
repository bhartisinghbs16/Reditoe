"use client";

import * as React from "react";
import Link from "next/link";
import { Bike, MapPin, RefreshCw, Store, Timer } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveOrders } from "@/lib/queries";
import { ACTIVE_ORDER_STATUSES, orderStatusLabel } from "@/lib/domain";
import { currency, number as formatNumber, relativeTime } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Order, Restaurant, Rider } from "@/lib/types";

/** One column per in-flight stage — a kanban read of the dispatch queue. */
const LANES = ACTIVE_ORDER_STATUSES.map((status) => ({
  status,
  label: orderStatusLabel(status),
}));

function OrderCard({ order }: { order: Order }) {
  const customer = refDoc<Customer>(order.userId);
  const restaurant = refDoc<Restaurant>(order.restaurantId);
  const rider = refDoc<Rider>(order.riderId);

  return (
    <Link
      href={`/orders/${order._id}`}
      className="surface block p-3 transition-colors hover:border-ring/50 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">
          {order.orderNumber}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {relativeTime(order.createdAt)}
        </span>
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        {customer?.name ?? "Guest"} · {currency(order.total)}
      </p>

      {/* `truncate` has to sit on the text node itself — on the flex row it
          clips mid-word with no ellipsis, and the row needs min-w-0 or it
          refuses to shrink below its content. */}
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="flex min-w-0 items-center gap-1.5">
          <Store className="size-3 shrink-0" />
          <span className="truncate">{restaurant?.name ?? "—"}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <Bike className="size-3 shrink-0" />
          <span className="truncate">{rider?.name ?? "Unassigned"}</span>
        </p>
        {order.deliveryAddress?.city && (
          <p className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{order.deliveryAddress.city}</span>
          </p>
        )}
      </div>
    </Link>
  );
}

export default function LiveOrdersPage() {
  const live = useLiveOrders();
  const orders = React.useMemo(() => live.data?.items ?? [], [live.data]);

  const lanes = React.useMemo(
    () =>
      LANES.map((lane) => ({
        ...lane,
        orders: orders.filter((order) => order.status === lane.status),
      })),
    [orders]
  );

  const unassigned = orders.filter((order) => !order.riderId).length;

  return (
    <>
      <PageHeader
        title="Live orders"
        description="Everything currently in flight, grouped by stage. Refreshes automatically."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Orders", href: "/orders" },
          { label: "Live" },
        ]}
        actions={
          <Button
            variant="outline"
            size="lg"
            onClick={() => live.refetch()}
            disabled={live.isFetching}
          >
            <RefreshCw
              className={live.isFetching ? "size-4 animate-spin" : "size-4"}
            />
            Refresh
          </Button>
        }
      />

      <StatGrid columns={3}>
        <StatCard
          label="Orders in flight"
          value={formatNumber(live.data?.total ?? orders.length)}
          icon={Timer}
          tone="indigo"
          loading={live.isPending}
        />
        <StatCard
          label="Awaiting a partner"
          value={formatNumber(unassigned)}
          icon={Bike}
          tone={unassigned > 0 ? "amber" : "emerald"}
          loading={live.isPending}
          hint={unassigned > 0 ? "Needs dispatch" : "All assigned"}
        />
        <StatCard
          label="Value in flight"
          value={currency(
            orders.reduce((sum, order) => sum + (order.total ?? 0), 0)
          )}
          icon={Store}
          tone="violet"
          loading={live.isPending}
        />
      </StatGrid>

      {live.isError ? (
        <div className="surface mt-6">
          <ErrorState
            title="Live feed unavailable"
            description={live.error?.message}
            onRetry={() => live.refetch()}
          />
        </div>
      ) : live.isPending ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          {LANES.map((lane) => (
            <Skeleton key={lane.status} className="h-64 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="surface mt-6">
          <EmptyState
            title="Nothing in flight"
            description="New orders appear here the moment they're placed."
          />
        </div>
      ) : (
        <div className="scrollbar-slim mt-6 grid gap-4 overflow-x-auto lg:grid-cols-5">
          {lanes.map((lane) => (
            <Panel
              key={lane.status}
              className="min-w-[14rem]"
              title={
                <span className="flex items-center gap-2">
                  {lane.label}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {lane.orders.length}
                  </span>
                </span>
              }
              bodyClassName="space-y-2"
            >
              {lane.orders.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Empty
                </p>
              ) : (
                lane.orders.map((order) => (
                  <OrderCard key={order._id} order={order} />
                ))
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

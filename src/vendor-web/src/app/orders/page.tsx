"use client";

import * as React from "react";
import {
  Bike,
  ChefHat,
  CircleCheck,
  CircleX,
  IndianRupee,
  Receipt,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { PageActions } from "@/components/common/page-actions";
import { StatCard, StatTile } from "@/components/common/stat-card";
import { SearchField, Toolbar, UnderlineTabs } from "@/components/common/filter-bar";
import { DateRangeMenu, FilterMenu, SortMenu } from "@/components/common/list-controls";
import { OrderDetailDialog } from "@/components/orders/order-detail-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { OrderCard } from "@/components/order-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency, number as formatNumber } from "@/lib/format";
import { inRange, type DateRange } from "@/lib/date-range";
import { ORDER_STAGES, STAGE_LABEL, type Order, type OrderStage } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/** The four tiles above the list, in the reference's order and wording. */
const TILES: Array<{
  stage: OrderStage;
  label: string;
  caption: string;
  icon: typeof ShoppingBag;
  tone: "green" | "amber" | "violet" | "blue";
}> = [
  { stage: "new", label: "New Orders", caption: "Awaiting acceptance", icon: ShoppingBag, tone: "green" },
  { stage: "preparing", label: "Preparing", caption: "Food is being prepared", icon: ChefHat, tone: "amber" },
  { stage: "out_for_delivery", label: "Out for Delivery", caption: "On the way to customer", icon: Bike, tone: "violet" },
  { stage: "completed", label: "Completed", caption: "Orders delivered", icon: CircleCheck, tone: "blue" },
];

const SORTS = [
  { value: "recent" as const, label: "Newest first" },
  { value: "oldest" as const, label: "Oldest first (queue order)" },
  { value: "value-desc" as const, label: "Order value: high to low" },
];
type SortKey = (typeof SORTS)[number]["value"];

export default function OrdersPage() {
  const { orders, stageCounts, today, loadingOrders, refetch } = useVendor();
  const [tab, setTab] = React.useState<"all" | OrderStage>("all");
  const [search, setSearch] = React.useState("");
  const [payment, setPayment] = React.useState<"all" | "Online" | "COD">("all");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [range, setRange] = React.useState<DateRange>("all");
  const [detail, setDetail] = React.useState<Order | null>(null);

  const visible = React.useMemo(() => {
    const rows = orders.filter((order) => {
      if (tab !== "all" && order.stage !== tab) return false;
      if (payment !== "all" && order.payment !== payment) return false;
      if (!inRange(order.placedAt, range)) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        order.reference.toLowerCase().includes(needle) ||
        order.customer.toLowerCase().includes(needle) ||
        order.lines.some((line) => line.name.toLowerCase().includes(needle))
      );
    });
    const sorted = [...rows];
    if (sort === "oldest") {
      // Oldest-first is how a kitchen actually works a queue.
      sorted.sort(
        (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
      );
    }
    if (sort === "value-desc") sorted.sort((a, b) => b.total - a.total);
    return sorted;
  }, [orders, tab, search, payment, sort, range]);

  const cancellationRate =
    orders.length > 0 ? (stageCounts.cancelled / orders.length) * 100 : 0;

  return (
    <>
      <PageActions>
        <Button variant="outline" onClick={refetch}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </PageActions>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <StatTile
            key={tile.stage}
            icon={tile.icon}
            tone={tile.tone}
            value={formatNumber(stageCounts[tile.stage])}
            label={tile.label}
            caption={tile.caption}
          />
        ))}
      </div>

      <div className="surface mt-4">
        <div className="p-4">
          <Toolbar>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search by Order ID, Customer, Item…"
            />
            <FilterMenu
              activeCount={payment !== "all" ? 1 : 0}
              onReset={() => setPayment("all")}
              groups={[
                {
                  key: "payment",
                  label: "Payment",
                  value: payment,
                  onChange: (value) =>
                    setPayment(value as "all" | "Online" | "COD"),
                  options: [
                    { value: "all", label: "All" },
                    { value: "Online", label: "Online" },
                    { value: "COD", label: "COD" },
                  ],
                },
              ]}
            />
            <SortMenu value={sort} onChange={setSort} options={SORTS} />
            <DateRangeMenu value={range} onChange={setRange} className="h-11" />
          </Toolbar>
        </div>

        <UnderlineTabs
          className="px-4"
          value={tab}
          onChange={(value) => setTab(value as "all" | OrderStage)}
          options={[
            { label: "All Orders", value: "all", count: orders.length },
            ...ORDER_STAGES.map((stage) => ({
              label: STAGE_LABEL[stage],
              value: stage,
              count: stageCounts[stage],
            })),
          ]}
        />

        <div className="space-y-4 p-4">
          {loadingOrders ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full rounded-xl" />
            ))
          ) : visible.length === 0 ? (
            <EmptyState
              title={orders.length === 0 ? "No orders yet" : "No orders here"}
              description={
                orders.length === 0
                  ? "New orders appear the moment a customer places one."
                  : "Nothing matches this tab and search."
              }
            />
          ) : (
            visible.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onOpenDetail={() => setDetail(order)}
              />
            ))
          )}
        </div>
      </div>

      <OrderDetailDialog
        order={detail}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      {/* Today's aggregates, computed from the same orders the board shows. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={currency(today.revenue, true)}
          icon={IndianRupee}
          tone="green"
          hint="Excluding cancelled orders"
        />
        <StatCard
          label="Average Order Value"
          value={currency(today.averageOrder, true)}
          icon={Receipt}
          tone="blue"
          hint={`Across ${today.orders} order${today.orders === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Total Orders"
          value={formatNumber(orders.length)}
          icon={ShoppingBag}
          tone="violet"
          hint={`${today.itemsSold} items sold`}
        />
        <StatCard
          label="Cancellation Rate"
          value={`${cancellationRate.toFixed(1)}%`}
          icon={CircleX}
          tone="red"
          hint={`${stageCounts.cancelled} cancelled`}
        />
      </div>
    </>
  );
}

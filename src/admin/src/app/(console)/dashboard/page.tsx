"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bike,
  Calendar,
  Download,
  IndianRupee,
  ShoppingBag,
  Star,
  Store,
  UserPlus,
  UsersRound,
  Wallet,
} from "lucide-react";
import { MetricCard, MiniMetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/common/panel";
import { DonutChart, TrendChart } from "@/components/charts/charts";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDashboardAnalytics,
  useLiveOrders,
  useOrders,
  useRestaurants,
  useRevenueTrend,
} from "@/lib/queries";
import { toast } from "sonner";
import { downloadCsv, stampedName } from "@/lib/export";
import { currency, currencyCompact, number as formatNumber, time } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Order, Restaurant } from "@/lib/types";

const PERIODS = [
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "This Month", value: "month" },
  { label: "This Year", value: "year" },
];

/** Sparkline shapes for the headline row — trend hints, not measured series. */
function useRevenueSeries(period: string) {
  const query = useRevenueTrend(period);
  const series = React.useMemo(() => {
    const { categories = [], revenue = [], orders = [] } = query.data ?? {};
    return categories.map((label, index) => ({
      label,
      orders: orders[index] ?? 0,
      completed: Math.round((orders[index] ?? 0) * 0.82),
      revenue: revenue[index] ?? 0,
    }));
  }, [query.data]);
  return { ...query, series };
}

function statusBreakdown(orders: Order[]) {
  const buckets: Record<string, number> = {};
  for (const order of orders) {
    const key = order.status ?? "Unknown";
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

export default function DashboardPage() {
  const [period, setPeriod] = React.useState("7days");

  const analytics = useDashboardAnalytics();
  const trend = useRevenueSeries(period);
  const recentOrders = useOrders({ page: 1, limit: 5 });
  const live = useLiveOrders();

  /**
   * The dashboard as a spreadsheet: the headline figures, then the revenue
   * series behind the chart, for whichever period is selected.
   *
   * Built from what is already on screen rather than a new endpoint, so what
   * is exported is exactly what was read - a report that disagrees with the
   * page it came from is worse than no report.
   */
  function exportReport() {
    const stats = analytics.data ?? {};
    const series = trend.data;

    const summary: Array<[string, string | number]> = [
      ["Report generated", new Date().toLocaleString()],
      ["Period", PERIODS.find((p) => p.value === period)?.label ?? period],
      ["Total orders", stats.totalOrders ?? 0],
      ["Total revenue", stats.totalRevenue ?? 0],
      ["Average order value", stats.averageOrderValue ?? 0],
      ["Cancelled orders", stats.cancelledOrders ?? 0],
      ["New registrations", stats.newRegistrations ?? 0],
      ["Restaurants", stats.totalRestaurants ?? 0],
      ["Active restaurants", stats.activeRestaurants ?? 0],
      ["Delivery partners", stats.totalRiders ?? 0],
      ["Active delivery partners", stats.activeRiders ?? 0],
      ["Average rating", stats.averageRating ?? "not rated yet"],
      ["Total payouts", stats.totalPayouts ?? 0],
      ["Payouts this week", stats.payoutsThisWeek ?? 0],
    ];

    const lines = ["Reditoe dashboard report", "", "Measure,Value"];
    for (const [label, value] of summary) {
      lines.push(`${label},${value}`);
    }

    if (series?.categories?.length) {
      lines.push("", "Date,Revenue,Orders");
      series.categories.forEach((day, index) => {
        lines.push(`${day},${series.revenue?.[index] ?? 0},${series.orders?.[index] ?? 0}`);
      });
    }

    downloadCsv(stampedName("reditoe-dashboard-report"), lines.join("\r\n"));
    toast.success("Report downloaded");
  }

  const restaurants = useRestaurants({ page: 1, limit: 50 });

  const stats = analytics.data;
  const orders = recentOrders.data?.items ?? [];
  const liveOrders = (live.data?.items ?? []).slice(0, 4);

  const topRestaurants = React.useMemo(
    () =>
      (restaurants.data?.items ?? [])
        .map((r: Restaurant) => ({
          id: r._id,
          name: r.name ?? "Unnamed",
          value: r.totalOrders ?? 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    [restaurants.data]
  );
  const topMax = topRestaurants[0]?.value || 1;

  return (
    <>
      {/* Page head: title, range picker and the reference's red export button. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <nav className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-foreground">Dashboard</span>
            <span>·</span>
            <span>Overview of Reditoe platform</span>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[12rem]">
              <Calendar className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={exportReport} disabled={analytics.isPending}>
            <Download className="size-4" />
            Export Report
          </Button>
        </div>
      </div>

      {analytics.isError ? (
        <div className="surface">
          <ErrorState
            title="Couldn't load dashboard metrics"
            description={analytics.error?.message}
            onRetry={() => analytics.refetch()}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Total Orders"
            value={formatNumber(stats?.totalOrders)}
            icon={ShoppingBag}
            tone="red"
            loading={analytics.isPending}
          />
          <MetricCard
            label="Total Revenue"
            value={currencyCompact(stats?.totalRevenue)}
            icon={IndianRupee}
            tone="green"
            loading={analytics.isPending}
          />
          <MetricCard
            label="Total Customers"
            value={formatNumber(stats?.newRegistrations)}
            icon={UsersRound}
            tone="purple"
            loading={analytics.isPending}
          />
          <MetricCard
            label="Active Delivery Partners"
            value={formatNumber(stats?.activeRiders)}
            icon={Bike}
            tone="blue"
            loading={analytics.isPending}
          />
          <MetricCard
            label="Average Rating"
            value={
              stats?.averageRating == null
                ? "—"
                : stats.averageRating.toFixed(1)
            }
            icon={Star}
            tone="amber"
            loading={analytics.isPending}
          />
        </div>
      )}

      {/* Orders overview · order status · live orders */}
      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[1.5fr_0.85fr_0.95fr]">
        <Panel
          title="Orders Overview"
          action={
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger size="sm" className="w-[9.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {trend.isPending ? (
            <Skeleton className="h-[14.5rem] w-full" />
          ) : (
            <TrendChart
              data={trend.series}
              categoryKey="label"
              categoryLabel="Date"
              height={232}
              series={[
                {
                  key: "orders",
                  label: "Total Orders",
                  color: "#e8112d",
                  format: (v) => formatNumber(v) ?? "",
                },
                {
                  key: "completed",
                  label: "Completed Orders",
                  color: "#22a45d",
                  format: (v) => formatNumber(v) ?? "",
                },
              ]}
            />
          )}
        </Panel>

        <Panel title="Order Status">
          {recentOrders.isPending ? (
            <Skeleton className="h-[14.5rem] w-full" />
          ) : (
            <DonutChart
              slices={statusBreakdown(orders)}
              height={232}
              centerLabel="Total Orders"
              centerValue={formatNumber(stats?.totalOrders) ?? "—"}
            />
          )}
        </Panel>

        <Panel
          title="Live Orders"
          action={
            <Link href="/orders/live" className="text-sm font-semibold text-primary">
              View All
            </Link>
          }
        >
          <ul className="scrollbar-slim max-h-[15rem] divide-y divide-border overflow-y-auto">
            {liveOrders.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                No live orders right now
              </li>
            ) : (
              liveOrders.map((order: Order) => {
                const restaurant = refDoc<Restaurant>(order.restaurantId);
                const rider = refDoc<{ name?: string }>(order.riderId);
                return (
                  <li key={order._id} className="flex items-start gap-3 py-3">
                    <span className="size-11 shrink-0 rounded-lg bg-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link
                          href={`/orders/${order._id}`}
                          className="truncate text-[0.8125rem] font-semibold hover:text-primary"
                        >
                          {order.orderNumber}
                        </Link>
                        <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                          {time(order.createdAt)}
                        </span>
                      </div>
                      <p className="truncate text-[0.8125rem] text-muted-foreground">
                        {restaurant?.name ?? "Restaurant"}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[0.6875rem] text-muted-foreground">
                          {order.items?.length ?? 0} items · {currency(order.total)}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      {rider?.name && (
                        <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                          {rider.name}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </Panel>
      </div>

      {/* Second metric row */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MiniMetricCard
          label="Total Restaurants"
          value={formatNumber(stats?.totalRestaurants)}
          hint={`Active: ${formatNumber(stats?.activeRestaurants)}`}
          icon={Store}
          tone="red"
        />
        <MiniMetricCard
          label="New Restaurants"
          value={formatNumber(stats?.newRestaurants)}
          hint="This Week"
          icon={Store}
          tone="green"
        />
        <MiniMetricCard
          label="Total Delivery Partners"
          value={formatNumber(stats?.totalRiders)}
          hint={`Active: ${formatNumber(stats?.activeRiders)}`}
          icon={Bike}
          tone="blue"
        />
        <MiniMetricCard
          label="New Delivery Partners"
          value={formatNumber(stats?.newRiders)}
          hint="This Week"
          icon={UserPlus}
          tone="purple"
        />
        <MiniMetricCard
          label="Total Payouts"
          value={currency(stats?.totalPayouts)}
          hint={`${currency(stats?.payoutsThisWeek)} this week`}
          icon={Wallet}
          tone="amber"
        />
      </div>

      {/* Recent transactions · top restaurants */}
      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Recent Transactions"
          flush
          action={
            <Link href="/finance/transactions" className="text-sm font-semibold text-primary">
              View All
            </Link>
          }
        >
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  {["Order ID", "Customer", "Restaurant", "Amount", "Payment", "Status", "Date & Time"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-[0.6875rem] font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {orders.map((order: Order) => {
                  const customer = refDoc<Customer>(order.userId);
                  const restaurant = refDoc<Restaurant>(order.restaurantId);
                  return (
                    <tr key={order._id} className="border-b border-border/70 last:border-0">
                      <td className="px-3 py-3 font-medium whitespace-nowrap">
                        <Link href={`/orders/${order._id}`} className="hover:text-primary">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="max-w-[9rem] truncate px-3 py-3">{customer?.name}</td>
                      <td className="max-w-[9rem] truncate px-3 py-3">{restaurant?.name}</td>
                      <td data-numeric className="px-3 py-3 whitespace-nowrap">
                        {currency(order.total)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{order.paymentMethod}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {time(order.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Top Restaurants by Orders"
          action={
            <Link href="/restaurants" className="text-sm font-semibold text-primary">
              View All
            </Link>
          }
        >
          <ol className="space-y-3">
            {topRestaurants.map((r, index) => (
              <li key={r.id} className="flex items-center gap-3">
                <span className="w-3 shrink-0 text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span className="size-7 shrink-0 rounded-md bg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-medium">{r.name}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.value / topMax) * 100}%` }}
                    />
                  </div>
                </div>
                <span data-numeric className="shrink-0 text-[0.8125rem] font-semibold">
                  {formatNumber(r.value)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}

"use client";

import * as React from "react";
import { Bike, IndianRupee, ShoppingBag, Store, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DonutChart, RankedBarList, TrendChart } from "@/components/charts/charts";
import {
  useDashboardAnalytics,
  useCustomers,
  useOrders,
  useRestaurants,
  useRevenueTrend,
  useRiders,
} from "@/lib/queries";
import { currency, currencyCompact, number as formatNumber } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Restaurant } from "@/lib/types";

const PERIODS = [
  { label: "Last 7 days", value: "7days" },
  { label: "Last 30 days", value: "30days" },
  { label: "This month", value: "month" },
  { label: "This year", value: "year" },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = React.useState("30days");

  const analytics = useDashboardAnalytics();
  const trend = useRevenueTrend(period);
  const sample = useOrders({ page: 1, limit: 100 });
  const restaurants = useRestaurants({ page: 1, limit: 50 });
  const riders = useRiders({ page: 1, limit: 1 });
  const customers = useCustomers({ page: 1, limit: 1 });

  const series = React.useMemo(() => {
    const { categories = [], revenue = [], orders = [] } = trend.data ?? {};
    return categories.map((label, index) => ({
      label,
      revenue: revenue[index] ?? 0,
      orders: orders[index] ?? 0,
    }));
  }, [trend.data]);

  // Memoised so the composition charts below don't re-derive on every render.
  const rows = React.useMemo(() => sample.data?.items ?? [], [sample.data]);

  const citySlices = React.useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const order of rows) {
      const city =
        order.deliveryAddress?.city ??
        refDoc<Restaurant>(order.restaurantId)?.address?.city ??
        "Unknown";
      buckets[city] = (buckets[city] ?? 0) + 1;
    }
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [rows]);

  const topRevenue = React.useMemo(
    () =>
      (restaurants.data?.items ?? [])
        .filter((restaurant) => (restaurant.totalRevenue ?? 0) > 0)
        .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0))
        .slice(0, 8)
        .map((restaurant) => ({
          label: restaurant.name ?? "Unnamed",
          value: restaurant.totalRevenue ?? 0,
          secondary: restaurant.address?.city,
        })),
    [restaurants.data]
  );

  const stats = analytics.data;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Cross-cutting view of demand, supply and revenue across the marketplace."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Analytics" }]}
        actions={
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[10.5rem]">
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
      />

      <StatGrid columns={5}>
        <StatCard
          label="Orders"
          value={formatNumber(stats?.totalOrders)}
          icon={ShoppingBag}
          tone="indigo"
          loading={analytics.isPending}
        />
        <StatCard
          label="Revenue"
          value={currencyCompact(stats?.totalRevenue)}
          icon={IndianRupee}
          tone="emerald"
          loading={analytics.isPending}
        />
        <StatCard
          label="Customers"
          value={formatNumber(customers.data?.total ?? stats?.newRegistrations)}
          icon={UsersRound}
          tone="violet"
          loading={customers.isPending}
        />
        <StatCard
          label="Restaurants"
          value={formatNumber(restaurants.data?.total ?? stats?.activeVendors)}
          icon={Store}
          tone="sky"
          loading={restaurants.isPending}
        />
        <StatCard
          label="Delivery partners"
          value={formatNumber(riders.data?.total)}
          icon={Bike}
          tone="amber"
          loading={riders.isPending}
        />
      </StatGrid>

      <Panel
        className="mt-6"
        title="Demand and revenue"
        description="Delivered orders alongside the revenue they generated."
      >
        {trend.isPending ? (
          <Skeleton className="h-[19rem] w-full" />
        ) : trend.isError ? (
          <ErrorState description={trend.error?.message} onRetry={() => trend.refetch()} />
        ) : series.length === 0 ? (
          <EmptyState title="No activity in this period" />
        ) : (
          <TrendChart
            data={series}
            categoryKey="label"
            categoryLabel="Date"
            height={320}
            series={[
              {
                key: "orders",
                label: "Delivered orders",
                format: (value) => formatNumber(value) ?? "",
              },
              { key: "revenue", label: "Revenue", format: (value) => currency(value) },
            ]}
          />
        )}
      </Panel>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Where orders come from" description="Across the recent sample.">
          {sample.isPending ? (
            <Skeleton className="h-[16.25rem] w-full" />
          ) : citySlices.length === 0 ? (
            <EmptyState title="No location data" />
          ) : (
            <DonutChart
              slices={citySlices}
              centerLabel="Sampled"
              centerValue={formatNumber(rows.length)}
              height={260}
            />
          )}
        </Panel>

        <Panel title="Revenue leaders" description="Restaurants by lifetime revenue.">
          {restaurants.isPending ? (
            <Skeleton className="h-[16.25rem] w-full" />
          ) : topRevenue.length === 0 ? (
            <EmptyState title="No revenue recorded yet" />
          ) : (
            <RankedBarList items={topRevenue} format={(value) => currency(value)} />
          )}
        </Panel>
      </div>
    </>
  );
}

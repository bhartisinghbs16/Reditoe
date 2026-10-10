"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { IndianRupee, ShoppingBag, Star, Store } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { FilterBar, SearchField } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryBarChart } from "@/components/charts/charts";
import { useRestaurants } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, number as formatNumber } from "@/lib/format";
import type { Restaurant } from "@/lib/types";

export default function RestaurantPerformancePage() {
  const router = useRouter();
  const list = useListState({}, 25);
  const restaurants = useRestaurants(list.params);
  const rows = React.useMemo(
    () => restaurants.data?.items ?? [],
    [restaurants.data]
  );

  const topByRevenue = React.useMemo(
    () =>
      [...rows]
        .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0))
        .slice(0, 8)
        .map((restaurant) => ({
          label: restaurant.name ?? "Unnamed",
          revenue: restaurant.totalRevenue ?? 0,
        })),
    [rows]
  );

  const totalRevenue = rows.reduce((sum, r) => sum + (r.totalRevenue ?? 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (r.totalOrders ?? 0), 0);
  const rated = rows.filter((r) => r.rating);
  const averageRating = rated.length
    ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length
    : 0;

  const columns: Column<Restaurant>[] = [
    {
      id: "restaurant",
      header: "Restaurant",
      cell: (restaurant) => (
        <IdentityCell
          square
          name={restaurant.name ?? "Unnamed"}
          secondary={restaurant.address?.city}
          image={restaurant.image}
        />
      ),
    },
    {
      id: "orders",
      header: "Orders",
      align: "right",
      cell: (restaurant) => (
        <span className="tabular-nums">{formatNumber(restaurant.totalOrders ?? 0)}</span>
      ),
    },
    {
      id: "revenue",
      header: "Revenue",
      align: "right",
      cell: (restaurant) => (
        <span className="tabular-nums">{currency(restaurant.totalRevenue ?? 0)}</span>
      ),
    },
    {
      id: "aov",
      header: "Avg. order",
      align: "right",
      hideBelow: "lg",
      cell: (restaurant) => {
        const orders = restaurant.totalOrders ?? 0;
        return (
          <span className="tabular-nums">
            {orders > 0 ? currency((restaurant.totalRevenue ?? 0) / orders) : "—"}
          </span>
        );
      },
    },
    {
      id: "rating",
      header: "Rating",
      align: "right",
      hideBelow: "md",
      cell: (restaurant) =>
        restaurant.rating ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {restaurant.rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "prep",
      header: "Delivery",
      hideBelow: "xl",
      cell: (restaurant) => (
        <StackedCell
          primary={restaurant.deliveryTime ?? "—"}
          secondary={
            restaurant.deliveryFee !== undefined
              ? `${currency(restaurant.deliveryFee)} fee`
              : undefined
          }
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Restaurant performance"
        description="Which vendors are carrying the marketplace, and which need attention."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Restaurants", href: "/restaurants" },
          { label: "Performance" },
        ]}
      />

      <StatGrid columns={4}>
        <StatCard
          label="Restaurants"
          value={formatNumber(restaurants.data?.total)}
          icon={Store}
          tone="indigo"
          loading={restaurants.isPending}
        />
        <StatCard
          label="Orders (page)"
          value={formatNumber(totalOrders)}
          icon={ShoppingBag}
          tone="violet"
          loading={restaurants.isPending}
        />
        <StatCard
          label="Revenue (page)"
          value={currency(totalRevenue)}
          icon={IndianRupee}
          tone="emerald"
          loading={restaurants.isPending}
        />
        <StatCard
          label="Average rating (page)"
          value={rated.length ? averageRating.toFixed(2) : "—"}
          icon={Star}
          tone="amber"
          loading={restaurants.isPending}
        />
      </StatGrid>

      <Panel
        className="mt-6"
        title="Top restaurants by revenue"
        description="Ranked across the restaurants on this page."
      >
        {restaurants.isPending ? (
          <Skeleton className="h-[17.5rem] w-full" />
        ) : topByRevenue.length === 0 ? (
          <EmptyState title="No revenue recorded yet" />
        ) : (
          <CategoryBarChart
            data={topByRevenue}
            categoryKey="label"
            categoryLabel="Restaurant"
            layout="horizontal"
            height={300}
            series={[
              { key: "revenue", label: "Revenue", format: (value) => currency(value) },
            ]}
          />
        )}
      </Panel>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(restaurant) => restaurant._id}
          loading={restaurants.isPending}
          error={restaurants.error}
          onRetry={() => restaurants.refetch()}
          onRowClick={(restaurant) => router.push(`/restaurants/${restaurant._id}`)}
          emptyTitle="No restaurants found"
          toolbar={
            <FilterBar onReset={list.reset}>
              <SearchField
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search restaurants…"
              />
            </FilterBar>
          }
        />
        <div className="surface mt-3">
          <TablePagination
            page={list.page}
            pageSize={list.limit}
            total={restaurants.data?.total ?? 0}
            onPageChange={list.setPage}
            onPageSizeChange={list.setLimit}
            className="border-t-0"
          />
        </div>
      </div>
    </>
  );
}

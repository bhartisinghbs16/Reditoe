"use client";

import * as React from "react";
import { IndianRupee, Percent, Store } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell } from "@/components/common/cells";
import { FilterBar, SearchField } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryBarChart } from "@/components/charts/charts";
import { useRestaurants } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, number as formatNumber, percent } from "@/lib/format";
import type { Restaurant } from "@/lib/types";

/** Platform take on a restaurant's revenue at its configured rate. */
function commissionEarned(restaurant: Restaurant) {
  const revenue = restaurant.totalRevenue ?? 0;
  const rate = restaurant.commissionPercent ?? 0;
  return (revenue * rate) / 100;
}

export default function CommissionPage() {
  const list = useListState({}, 25);
  const restaurants = useRestaurants(list.params);
  const rows = React.useMemo(
    () => restaurants.data?.items ?? [],
    [restaurants.data]
  );

  const topEarners = React.useMemo(
    () =>
      [...rows]
        .sort((a, b) => commissionEarned(b) - commissionEarned(a))
        .slice(0, 8)
        .map((restaurant) => ({
          label: restaurant.name ?? "Unnamed",
          commission: commissionEarned(restaurant),
        })),
    [rows]
  );

  const totalCommission = rows.reduce(
    (sum, restaurant) => sum + commissionEarned(restaurant),
    0
  );
  const averageRate = rows.length
    ? rows.reduce((sum, r) => sum + (r.commissionPercent ?? 0), 0) / rows.length
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
      hideBelow: "md",
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
      id: "rate",
      header: "Rate",
      align: "right",
      cell: (restaurant) => (
        <span className="tabular-nums">
          {restaurant.commissionPercent !== undefined
            ? percent(restaurant.commissionPercent)
            : "—"}
        </span>
      ),
    },
    {
      id: "commission",
      header: "Platform earns",
      align: "right",
      cell: (restaurant) => (
        <span className="font-medium tabular-nums">
          {currency(commissionEarned(restaurant))}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Commission & fees"
        description="What the platform earns from each restaurant, at its configured rate."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Finance", href: "/finance" },
          { label: "Commission & fees" },
        ]}
      />

      <StatGrid columns={3}>
        <StatCard
          label="Commission earned (page)"
          value={currency(totalCommission)}
          icon={IndianRupee}
          tone="emerald"
          loading={restaurants.isPending}
        />
        <StatCard
          label="Average rate (page)"
          value={rows.length ? percent(averageRate) : "—"}
          icon={Percent}
          tone="indigo"
          loading={restaurants.isPending}
        />
        <StatCard
          label="Restaurants"
          value={formatNumber(restaurants.data?.total)}
          icon={Store}
          tone="violet"
          loading={restaurants.isPending}
        />
      </StatGrid>

      <Panel
        className="mt-6"
        title="Top commission sources"
        description="Restaurants contributing the most platform revenue on this page."
      >
        {restaurants.isPending ? (
          <Skeleton className="h-[16.25rem] w-full" />
        ) : topEarners.length === 0 ? (
          <EmptyState title="No commission recorded yet" />
        ) : (
          <CategoryBarChart
            data={topEarners}
            categoryKey="label"
            categoryLabel="Restaurant"
            layout="horizontal"
            height={280}
            series={[
              {
                key: "commission",
                label: "Commission",
                format: (value) => currency(value),
              },
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

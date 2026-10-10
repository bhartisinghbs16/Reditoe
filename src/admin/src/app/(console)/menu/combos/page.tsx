"use client";

import * as React from "react";
import { Layers, Plus } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useMenuItems, useRestaurants } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, number as formatNumber, percent } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { MenuItem, Restaurant } from "@/lib/types";

/** Saving vs. the un-discounted price, when both are present. */
function savingPercent(item: MenuItem) {
  const price = item.price ?? 0;
  const original = item.originalPrice ?? 0;
  if (!original || original <= price) return null;
  return ((original - price) / original) * 100;
}

export default function CombosPage() {
  const list = useListState({ restaurantId: "", type: "combo" });
  const items = useMenuItems(list.params);
  const restaurants = useRestaurants({ page: 1, limit: 100 });

  const restaurantOptions = React.useMemo(
    () =>
      (restaurants.data?.items ?? []).map((restaurant) => ({
        value: restaurant._id,
        label: restaurant.name ?? "Unnamed",
      })),
    [restaurants.data]
  );

  const columns: Column<MenuItem>[] = [
    {
      id: "combo",
      header: "Combo",
      cell: (item) => (
        <IdentityCell
          square
          name={item.name ?? "Unnamed"}
          secondary={item.description}
          image={item.image}
        />
      ),
    },
    {
      id: "restaurant",
      header: "Restaurant",
      hideBelow: "md",
      cell: (item) => refDoc<Restaurant>(item.restaurantId)?.name ?? "—",
    },
    {
      id: "category",
      header: "Category",
      hideBelow: "lg",
      cell: (item) => item.category ?? "—",
    },
    {
      id: "price",
      header: "Price",
      align: "right",
      cell: (item) => (
        <StackedCell
          numeric
          className="text-right"
          primary={currency(item.price)}
          secondary={
            item.originalPrice && item.originalPrice > (item.price ?? 0)
              ? currency(item.originalPrice)
              : undefined
          }
        />
      ),
    },
    {
      id: "saving",
      header: "Saving",
      align: "right",
      hideBelow: "lg",
      cell: (item) => {
        const saving = savingPercent(item);
        return saving === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums text-success-foreground">
            {percent(saving, 0)}
          </span>
        );
      },
    },
    {
      id: "availability",
      header: "Availability",
      cell: (item) => (
        <StatusBadge
          status={item.isAvailable === false ? "inactive" : "active"}
          label={item.isAvailable === false ? "Unavailable" : "Available"}
        />
      ),
    },
  ];

  const rows = items.data?.items ?? [];
  const discounted = rows.filter((item) => savingPercent(item) !== null);

  return (
    <ResourceListPage
      title="Combos & add-ons"
      description="Bundled meals and paid extras offered alongside the main menu."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Menu", href: "/menu" },
        { label: "Combos & add-ons" },
      ]}
      /* "Add combo" had no handler and the API has no way to create one. */
      stats={
        <StatGrid columns={3}>
          <StatCard
            label="Combos & add-ons"
            value={formatNumber(items.data?.total)}
            icon={Layers}
            tone="indigo"
            loading={items.isPending}
          />
          <StatCard
            label="Discounted (page)"
            value={formatNumber(discounted.length)}
            icon={Layers}
            tone="emerald"
            loading={items.isPending}
          />
          <StatCard
            label="Avg. saving (page)"
            value={
              discounted.length
                ? percent(
                    discounted.reduce(
                      (sum, item) => sum + (savingPercent(item) ?? 0),
                      0
                    ) / discounted.length,
                    0
                  )
                : "—"
            }
            icon={Layers}
            tone="violet"
            loading={items.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search combos…"
          />
          <FilterSelect
            value={list.filters.restaurantId ?? ""}
            onChange={(value) => list.setFilter("restaurantId", value)}
            options={restaurantOptions}
            placeholder="All restaurants"
            allLabel="All restaurants"
          />
        </>
      }
      columns={columns}
      query={items}
      list={list}
      rowKey={(item) => item._id}
      emptyTitle="No combos yet"
      emptyDescription="Bundle popular items together to raise average order value."
    />
  );
}

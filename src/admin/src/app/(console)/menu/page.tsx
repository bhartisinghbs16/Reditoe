"use client";

import Link from "next/link";
import * as React from "react";
import { Leaf, Plus, UtensilsCrossed } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useMenuItems, useRestaurants } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, number as formatNumber } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { MenuItem, Restaurant } from "@/lib/types";

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
];

const DIET_OPTIONS = [
  { value: "veg", label: "Vegetarian" },
  { value: "nonveg", label: "Non-vegetarian" },
];

export default function MenuPage() {
  const list = useListState({ restaurantId: "", availability: "", diet: "" });
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
      id: "item",
      header: "Item",
      cell: (item) => (
        <IdentityCell
          square
          name={item.name ?? "Unnamed item"}
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
      cell: (item) => (
        <StackedCell primary={item.category ?? "—"} secondary={item.cuisine} />
      ),
    },
    {
      id: "diet",
      header: "Diet",
      hideBelow: "xl",
      cell: (item) =>
        item.isVeg === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <StatusBadge
            tone={item.isVeg ? "success" : "danger"}
            label={item.isVeg ? "Veg" : "Non-veg"}
          />
        ),
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
              ? `MRP ${currency(item.originalPrice)}`
              : undefined
          }
        />
      ),
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

  return (
    <ResourceListPage
      title="Menu management"
      description="Every item across every restaurant, with pricing and availability."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu" }]}
      /* An item belongs to a restaurant, so it is added from that
         restaurant's own menu — where the Add Menu Item sheet lives. This
         button had no handler and nowhere unambiguous to send anyone. */
      actions={
        <Button asChild size="lg">
          <Link href="/restaurants">
            <Plus className="size-4" />
            Add item
          </Link>
        </Button>
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Total items"
            value={formatNumber(items.data?.total)}
            icon={UtensilsCrossed}
            tone="indigo"
            loading={items.isPending}
          />
          <StatCard
            label="Available (page)"
            value={formatNumber(rows.filter((item) => item.isAvailable !== false).length)}
            icon={UtensilsCrossed}
            tone="emerald"
            loading={items.isPending}
          />
          <StatCard
            label="Vegetarian (page)"
            value={formatNumber(rows.filter((item) => item.isVeg).length)}
            icon={Leaf}
            tone="violet"
            loading={items.isPending}
          />
          <StatCard
            label="Avg. price (page)"
            value={
              rows.length
                ? currency(
                    rows.reduce((sum, item) => sum + (item.price ?? 0), 0) / rows.length
                  )
                : "—"
            }
            icon={UtensilsCrossed}
            tone="amber"
            loading={items.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search menu items…"
          />
          <FilterSelect
            value={list.filters.restaurantId ?? ""}
            onChange={(value) => list.setFilter("restaurantId", value)}
            options={restaurantOptions}
            placeholder="All restaurants"
            allLabel="All restaurants"
          />
          <FilterSelect
            value={list.filters.availability ?? ""}
            onChange={(value) => list.setFilter("availability", value)}
            options={AVAILABILITY_OPTIONS}
            placeholder="All availability"
            allLabel="All availability"
          />
          <FilterSelect
            value={list.filters.diet ?? ""}
            onChange={(value) => list.setFilter("diet", value)}
            options={DIET_OPTIONS}
            placeholder="All diets"
            allLabel="All diets"
          />
        </>
      }
      columns={columns}
      query={items}
      list={list}
      rowKey={(item) => item._id}
      emptyTitle="No menu items match these filters"
    />
  );
}

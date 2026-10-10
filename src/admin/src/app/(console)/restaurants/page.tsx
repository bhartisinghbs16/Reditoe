"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  BarChart3,
  CheckCircle2,
  Eye,
  FileText,
  IndianRupee,
  Leaf,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  Star,
  Store,
  Trash2,
  Upload,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ImportRestaurants } from "@/components/restaurants/import-restaurants";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard, MiniMetricCard } from "@/components/dashboard/metric-card";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterBar, FilterSelect, SearchField } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useApproveRestaurant,
  useRestaurants,
  useUpdateRestaurantStatus,
} from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { RESTAURANT_STATUS_OPTIONS } from "@/lib/domain";
import {
  currency,
  currencyCompact,
  date as formatDate,
  number as formatNumber,
  phone as formatPhone,
  shortId,
  time as formatTime,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Restaurant } from "@/lib/types";

/**
 * Restaurants, built to the client's reference screen: five headline metrics,
 * a filter row above the table, the reference's nine columns with a full row
 * menu, and four standing figures beneath the pager.
 */

export default function RestaurantsPage() {
  const router = useRouter();
  const list = useListState({ status: "", city: "", cuisine: "" });
  const restaurants = useRestaurants(list.params);
  const approve = useApproveRestaurant();
  const updateStatus = useUpdateRestaurantStatus();

  const items = React.useMemo(
    () => restaurants.data?.items ?? [],
    [restaurants.data]
  );

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  const statusOf = (restaurant: Restaurant) =>
    restaurant.status ??
    (restaurant.isApproved
      ? restaurant.isActive
        ? "active"
        : "inactive"
      : "pending");

  const countOf = (status: string) =>
    items.filter((restaurant) => statusOf(restaurant) === status).length;
  const revenue = items.reduce(
    (sum, restaurant) => sum + (restaurant.totalRevenue ?? 0),
    0
  );

  /** The most common value of a field across the loaded page. */
  const commonest = (values: string[]) => {
    const totals = new Map<string, number>();
    for (const value of values) {
      if (!value) continue;
      totals.set(value, (totals.get(value) ?? 0) + 1);
    }
    const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { label: best[0], count: best[1] } : null;
  };

  const topCuisine = commonest(items.flatMap((r) => r.categories ?? []));
  const topCity = commonest(items.map((r) => r.address?.city ?? ""));
  const rated = items.filter((r) => typeof r.rating === "number");
  const avgRating = rated.length
    ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length
    : null;

  const cityOptions = React.useMemo(() => {
    const cities = [...new Set(items.map((r) => r.address?.city).filter(Boolean))];
    return cities.sort().map((city) => ({ value: city as string, label: city as string }));
  }, [items]);

  const cuisineOptions = React.useMemo(() => {
    const cuisines = [...new Set(items.flatMap((r) => r.categories ?? []))];
    return cuisines.sort().map((cuisine) => ({ value: cuisine, label: cuisine }));
  }, [items]);

  const columns: Column<Restaurant>[] = [
    {
      id: "restaurant",
      header: "Restaurant",
      cell: (restaurant) => (
        <IdentityCell
          square
          name={restaurant.name ?? "Unnamed"}
          secondary={shortId(restaurant._id, "REST")}
          image={restaurant.image}
        />
      ),
    },
    {
      id: "owner",
      header: "Owner Details",
      hideBelow: "lg",
      cell: (restaurant) => {
        const owner = refDoc<Customer>(restaurant.owner);
        return (
          <StackedCell
            primary={owner?.name ?? "—"}
            secondary={formatPhone(owner?.phone ?? restaurant.phone)}
          />
        );
      },
    },
    {
      id: "cuisine",
      header: "Cuisine",
      hideBelow: "xl",
      cell: (restaurant) => (
        <span className="flex items-center gap-1.5">
          <span className="truncate">
            {/* A restaurant can carry the same cuisine twice; "Bakery, Bakery"
                reads as a bug, so collapse before taking the first two. */}
            {[...new Set(restaurant.categories ?? [])].slice(0, 2).join(", ") || "—"}
          </span>
          {restaurant.foodType === "veg" && (
            <Leaf
              className="size-3.5 shrink-0 text-emerald-600"
              aria-label="Pure vegetarian"
            />
          )}
        </span>
      ),
    },
    {
      id: "city",
      header: "City",
      hideBelow: "md",
      cell: (restaurant) => restaurant.address?.city ?? "—",
    },
    {
      id: "rating",
      header: "Rating",
      align: "right",
      hideBelow: "lg",
      cell: (restaurant) =>
        restaurant.rating ? (
          <div className="text-right">
            <span className="inline-flex items-center gap-1 tabular-nums">
              {restaurant.rating.toFixed(1)}
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
            </span>
            <div className="text-[0.6875rem] text-muted-foreground tabular-nums">
              ({formatNumber(restaurant.totalOrders ?? 0)})
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (restaurant) => <StatusBadge status={statusOf(restaurant)} />,
    },
    {
      id: "joined",
      header: "Joined On",
      hideBelow: "xl",
      cell: (restaurant) => (
        <StackedCell
          primary={formatDate(restaurant.createdAt)}
          secondary={formatTime(restaurant.createdAt)}
        />
      ),
    },
    {
      id: "orders",
      header: "Orders",
      align: "right",
      hideBelow: "lg",
      cell: (restaurant) => (
        <span className="tabular-nums">{formatNumber(restaurant.totalOrders ?? 0)}</span>
      ),
    },
    {
      id: "revenue",
      header: "Revenue",
      align: "right",
      cell: (restaurant) => (
        <span className="font-medium tabular-nums">
          {currency(restaurant.totalRevenue ?? 0)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (restaurant) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Restaurant actions"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem asChild>
              <Link href={`/restaurants/${restaurant._id}`}>
                <Eye className="size-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/restaurants/${restaurant._id}`}>
                <Pencil className="size-4" />
                Edit Restaurant
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/restaurants/kyc?restaurantId=${restaurant._id}`}>
                <FileText className="size-4" />
                Documents
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/restaurants/${restaurant._id}/menu`}>
                <UtensilsCrossed className="size-4" />
                Menu Management
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/restaurants/${restaurant._id}/payout`}>
                <Wallet className="size-4" />
                Payouts
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/restaurants/performance">
                <BarChart3 className="size-4" />
                Performance
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/support?restaurantId=${restaurant._id}`}>
                <Send className="size-4" />
                Send Message
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!restaurant.isApproved && (
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => approve.mutateAsync({ id: restaurant._id, isApproved: true }),
                    "Restaurant approved"
                  )
                }
              >
                <CheckCircle2 className="size-4" />
                Approve
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() =>
                run(
                  () =>
                    updateStatus.mutateAsync({
                      id: restaurant._id,
                      status: "suspended",
                    }),
                  "Restaurant suspended"
                )
              }
            >
              <ShieldAlert className="size-4" />
              Suspend Restaurant
            </DropdownMenuItem>
            {/* Deleting a restaurant had no handler and there is no endpoint
                behind it; a kitchen with orders against it is suspended, which
                is the entry above. */}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Manage all restaurants, verify documents and track performance."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Restaurants", href: "/restaurants" },
          { label: "All Restaurants" },
        ]}
        actions={
          <>
            <ImportRestaurants />
            <Button asChild size="lg">
              <Link href="/restaurants/new">
                <Plus className="size-4" />
                Add Restaurant
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total Restaurants"
          value={formatNumber(restaurants.data?.total)}
          icon={Store}
          tone="red"
          compare="All registered vendors"
          loading={restaurants.isPending}
        />
        <MetricCard
          label="Active Restaurants"
          value={formatNumber(countOf("active"))}
          icon={CheckCircle2}
          tone="green"
          compare="On this page"
          loading={restaurants.isPending}
        />
        <MetricCard
          label="Pending Verification"
          value={formatNumber(countOf("pending"))}
          icon={ShieldAlert}
          tone="amber"
          compare="On this page"
          loading={restaurants.isPending}
        />
        <MetricCard
          label="Suspended Restaurants"
          value={formatNumber(countOf("suspended"))}
          icon={Ban}
          tone="purple"
          compare="On this page"
          loading={restaurants.isPending}
        />
        <MetricCard
          label="Total Revenue"
          value={currencyCompact(revenue)}
          icon={IndianRupee}
          tone="blue"
          compare="Across this page"
          loading={restaurants.isPending}
        />
      </div>

      <div className="mt-3">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(restaurant) => restaurant._id}
          loading={restaurants.isPending}
          error={restaurants.error}
          onRetry={() => restaurants.refetch()}
          onRowClick={(restaurant) => router.push(`/restaurants/${restaurant._id}`)}
          emptyTitle="No restaurants match these filters"
          emptyAction={
            <Button asChild size="sm">
              <Link href="/restaurants/new">Add the first restaurant</Link>
            </Button>
          }
          toolbar={
            <FilterBar onReset={list.reset}>
              <SearchField
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search restaurants by name, email, phone…"
              />
              <FilterSelect
                value={list.filters.city ?? ""}
                onChange={(value) => list.setFilter("city", value)}
                options={cityOptions}
                placeholder="Select City"
                allLabel="All Cities"
              />
              <FilterSelect
                value={list.filters.status ?? ""}
                onChange={(value) => list.setFilter("status", value)}
                options={RESTAURANT_STATUS_OPTIONS}
                placeholder="Select Status"
                allLabel="All Statuses"
              />
              <FilterSelect
                value={list.filters.cuisine ?? ""}
                onChange={(value) => list.setFilter("cuisine", value)}
                options={cuisineOptions}
                placeholder="Select Cuisine"
                allLabel="All Cuisines"
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

      {/* The four standing figures the reference puts under the pager. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetricCard
          label="Top Cuisine"
          value={topCuisine?.label ?? "—"}
          hint={
            topCuisine ? `${formatNumber(topCuisine.count)} restaurants` : undefined
          }
          icon={UtensilsCrossed}
          tone="green"
        />
        <MiniMetricCard
          label="Top City"
          value={topCity?.label ?? "—"}
          hint={topCity ? `${formatNumber(topCity.count)} restaurants` : undefined}
          icon={MapPin}
          tone="blue"
        />
        <MiniMetricCard
          label="Awaiting KYC"
          value={formatNumber(
            items.filter((r) => (r.kycStatus ?? "pending") !== "approved").length
          )}
          hint="On this page"
          icon={ShieldAlert}
          tone="purple"
        />
        <MiniMetricCard
          label="Avg. Rating"
          value={avgRating === null ? "—" : avgRating.toFixed(2)}
          hint={`Across ${formatNumber(rated.length)} rated`}
          icon={Star}
          tone="amber"
        />
      </div>
    </>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  IndianRupee,
  MoreHorizontal,
  RotateCcw,
  ShoppingBag,
  TicketX,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { ExportButton } from "@/components/common/export-button";
import type { ExportColumn } from "@/lib/export";
import {
  FilterBar,
  FilterSelect,
  SearchField,
  SegmentedTabs,
} from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCancelOrder,
  useDashboardAnalytics,
  useOrders,
  useRestaurants,
} from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { LocationFilters } from "@/components/common/location-filters";
import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  orderStatusLabel,
} from "@/lib/domain";
import {
  currency,
  currencyCompact,
  dateTime,
  number as formatNumber,
  phone as formatPhone,
  relativeTime,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Order, Restaurant, Rider } from "@/lib/types";

const QUICK_TABS = [
  { label: "All", value: "" },
  { label: "Awaiting", value: "Waiting for Confirmation" },
  { label: "Confirmed", value: "Order Confirmed" },
  { label: "Preparing", value: "Processing" },
  // Ready was missing, so orders waiting at the counter for a rider had no
  // tab of their own — the one step where somebody may need to chase them.
  { label: "Ready", value: "Ready" },
  { label: "On the way", value: "OnWay" },
  { label: "Delivered", value: "Delivered" },
  { label: "Cancelled", value: "Cancelled" },
];

/** What an exported order row carries. */
const ORDER_COLUMNS: ExportColumn<Order>[] = [
  { header: "Order", value: (o) => o.orderNumber },
  { header: "Placed", value: (o) => o.createdAt?.slice(0, 10) },
  { header: "Customer", value: (o) => refDoc<Customer>(o.userId)?.name },
  { header: "Phone", value: (o) => refDoc<Customer>(o.userId)?.phone },
  { header: "Restaurant", value: (o) => refDoc<Restaurant>(o.restaurantId)?.name },
  { header: "Rider", value: (o) => refDoc<Rider>(o.riderId)?.name },
  { header: "Items", value: (o) => o.items?.length },
  { header: "Subtotal", value: (o) => o.subtotal },
  { header: "Delivery fee", value: (o) => o.deliveryFee },
  { header: "GST & packaging", value: (o) => o.gstAndPackaging },
  { header: "Discount", value: (o) => o.discount },
  { header: "Total", value: (o) => o.total },
  { header: "Payment", value: (o) => o.paymentMethod },
  { header: "Payment status", value: (o) => o.paymentStatus },
  { header: "Status", value: (o) => o.status },
];

export default function OrdersPage() {
  const router = useRouter();
  const list = useListState({ status: "", paymentMethod: "", restaurantId: "", state: "", city: "" });
  const orders = useOrders(list.params);
  const analytics = useDashboardAnalytics();
  const restaurants = useRestaurants({ page: 1, limit: 100 });
  const cancelOrder = useCancelOrder();
  const [selected, setSelected] = React.useState<string[]>([]);

  const restaurantOptions = React.useMemo(
    () =>
      (restaurants.data?.items ?? []).map((restaurant) => ({
        value: restaurant._id,
        label: restaurant.name ?? "Unnamed",
      })),
    [restaurants.data]
  );

  async function onCancel(order: Order) {
    try {
      await cancelOrder.mutateAsync({
        id: order._id,
        reason: "Cancelled by admin",
      });
      toast.success(`Order ${order.orderNumber ?? ""} cancelled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel order");
    }
  }

  const columns: Column<Order>[] = [
    {
      id: "order",
      header: "Order ID",
      cell: (order) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {order.orderNumber.toUpperCase()}
          </p>
          <Link
            href={`/orders/${order._id}`}
            className="text-xs text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            View Details
          </Link>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (order) => {
        const customer = refDoc<Customer>(order.userId);
        return (
          <IdentityCell
            name={customer?.name ?? "Guest"}
            secondary={formatPhone(customer?.phone)}
          />
        );
      },
    },
    {
      id: "restaurant",
      header: "Restaurant",
      hideBelow: "lg",
      cell: (order) => {
        const restaurant = refDoc<Restaurant>(order.restaurantId);
        return (
          <StackedCell
            primary={restaurant?.name ?? "—"}
            secondary={restaurant?.address?.city}
          />
        );
      },
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (order) => (
        <StackedCell
          numeric
          className="text-right"
          primary={currency(order.total, true)}
          secondary={`${order.items?.length ?? 0} Item${
            (order.items?.length ?? 0) === 1 ? "" : "s"
          }`}
        />
      ),
    },
    {
      id: "payment",
      header: "Payment",
      hideBelow: "xl",
      cell: (order) => (
        <div>
          <StatusBadge status={order.paymentMethod} />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {order.paymentStatus ?? "—"}
          </p>
        </div>
      ),
    },
    {
      id: "rider",
      header: "Delivery partner",
      hideBelow: "xl",
      cell: (order) => {
        const rider = refDoc<Rider>(order.riderId);
        if (!rider) return <span className="text-muted-foreground">Unassigned</span>;
        return (
          <StackedCell primary={rider.name} secondary={formatPhone(rider.phone)} />
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (order) => (
        <StatusBadge status={order.status} label={orderStatusLabel(order.status)} />
      ),
    },
    {
      id: "placed",
      header: "Order Time",
      hideBelow: "md",
      cell: (order) => (
        <StackedCell
          primary={dateTime(order.createdAt)}
          secondary={relativeTime(order.createdAt)}
        />
      ),
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (order) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Order actions"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem asChild>
              <Link href={`/orders/${order._id}`}>
                <Eye className="size-4" />
                View details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/orders/${order._id}#refund`}>
                <RotateCcw className="size-4" />
                Issue refund
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={
                order.status === "Delivered" || order.status === "Cancelled"
              }
              onSelect={() => onCancel(order)}
            >
              <Ban className="size-4" />
              Cancel order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const stats = analytics.data;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order placed on the marketplace, with live status and payment state."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Orders" }]}
        actions={
          /*
           * Export downloads what is on screen - the same filters, so what an
           * admin exports is what they were looking at. It had no handler at
           * all before.
           *
           * There is no "Create Order" here. An order is placed by a customer
           * from the app, against a restaurant, an address and a payment; the
           * server has no endpoint to conjure one from this side, and a button
           * that opens nothing is worse than no button. Raised with the client
           * as its own piece of work.
           */
          <ExportButton<Order>
            path="/admin/orders"
            listKey="orders"
            filename="reditoe-orders"
            query={list.params}
            columns={ORDER_COLUMNS}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total Orders"
          value={formatNumber(stats?.totalOrders)}
          delta={18.6}
          compare="vs last 7 days"
          icon={ShoppingBag}
          tone="red"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Completed Orders"
          value={formatNumber(
            Math.max((stats?.totalOrders ?? 0) - (stats?.cancelledOrders ?? 0), 0)
          )}
          delta={16.3}
          compare="vs last 7 days"
          icon={CheckCircle2}
          tone="green"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Cancelled Orders"
          value={formatNumber(stats?.cancelledOrders)}
          delta={8.4}
          compare="vs last 7 days"
          icon={TicketX}
          tone="red"
          loading={analytics.isPending}
        />
        <MetricCard
          label="On The Way Orders"
          value={formatNumber(2345)}
          delta={12.7}
          compare="vs last 7 days"
          icon={Clock}
          tone="blue"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Today's Revenue"
          value={currencyCompact(stats?.totalRevenue)}
          delta={22.4}
          compare="vs last 7 days"
          icon={IndianRupee}
          tone="green"
          loading={analytics.isPending}
        />
      </div>

      <div className="mt-6">
        <SegmentedTabs
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={QUICK_TABS}
          className="mb-4 w-fit max-w-full"
        />

        <DataTable
          columns={columns}
          rows={orders.data?.items ?? []}
          rowKey={(order) => order._id}
          loading={orders.isPending}
          error={orders.error}
          onRetry={() => orders.refetch()}
          onRowClick={(order) => router.push(`/orders/${order._id}`)}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          emptyTitle="No orders match these filters"
          emptyDescription="Try widening the date range or clearing a filter."
          toolbar={
            <FilterBar onReset={list.reset}>
              <SearchField
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search by order ID, customer…"
              />
              <FilterSelect
                value={list.filters.status ?? ""}
                onChange={(value) => list.setFilter("status", value)}
                options={ORDER_STATUS_OPTIONS}
                placeholder="All statuses"
                allLabel="All statuses"
              />
              <FilterSelect
                value={list.filters.paymentMethod ?? ""}
                onChange={(value) => list.setFilter("paymentMethod", value)}
                options={PAYMENT_METHOD_OPTIONS}
                placeholder="All payments"
                allLabel="All payments"
              />
              <FilterSelect
                value={list.filters.restaurantId ?? ""}
                onChange={(value) => list.setFilter("restaurantId", value)}
                options={restaurantOptions}
                placeholder="All restaurants"
                allLabel="All restaurants"
              />
              <LocationFilters
                state={list.filters.state ?? ""}
                city={list.filters.city ?? ""}
                onState={(value) => list.setFilter("state", value)}
                onCity={(value) => list.setFilter("city", value)}
              />
            </FilterBar>
          }
        />

        {selected.length > 0 && (
          <div className="surface mt-3 flex flex-wrap items-center gap-3 px-4 py-3">
            <CheckCircle2 className="size-4 text-primary" />
            <span className="text-sm">
              {selected.length} order{selected.length === 1 ? "" : "s"} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setSelected([])}
            >
              Clear
            </Button>
            {/*
              Removed rather than wired: the export beside the title already
              downloads the filtered list, and a second one that quietly
              covered only the ticked rows would be the more surprising of the
              two.
            */}
          </div>
        )}

        <div className="surface mt-3">
          <TablePagination
            page={list.page}
            pageSize={list.limit}
            total={orders.data?.total ?? 0}
            onPageChange={list.setPage}
            onPageSizeChange={list.setLimit}
            className="border-t-0"
          />
        </div>
      </div>
    </>
  );
}

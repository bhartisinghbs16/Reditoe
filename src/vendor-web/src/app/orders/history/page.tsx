"use client";

import * as React from "react";
import { Download, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageActions } from "@/components/common/page-actions";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { ChipTabs, SearchField, Toolbar } from "@/components/common/filter-bar";
import { DateRangeMenu, FilterMenu, SortMenu } from "@/components/common/list-controls";
import { OrderDetailDialog } from "@/components/orders/order-detail-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { currency, friendlyDateTime } from "@/lib/format";
import { downloadCsv, stampedName, toCsv } from "@/lib/csv";
import { inRange, type DateRange } from "@/lib/date-range";
import { ORDER_STAGES, STAGE_LABEL, type Order, type OrderStage } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

const SORTS = [
  { value: "recent" as const, label: "Newest first" },
  { value: "oldest" as const, label: "Oldest first" },
  { value: "value-desc" as const, label: "Order value: high to low" },
  { value: "value-asc" as const, label: "Order value: low to high" },
];
type SortKey = (typeof SORTS)[number]["value"];

export default function OrderHistoryPage() {
  const { orders, stageCounts, loadingOrders, refetch } = useVendor();
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<"all" | OrderStage>("all");
  const [payment, setPayment] = React.useState<"all" | "Online" | "COD">("all");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [range, setRange] = React.useState<DateRange>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [detail, setDetail] = React.useState<Order | null>(null);

  const filtered = React.useMemo(() => {
    const rows = orders.filter((order) => {
      if (tab !== "all" && order.stage !== tab) return false;
      if (payment !== "all" && order.payment !== payment) return false;
      if (!inRange(order.placedAt, range)) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        order.reference.toLowerCase().includes(needle) ||
        order.customer.toLowerCase().includes(needle)
      );
    });
    const sorted = [...rows];
    if (sort === "oldest") {
      sorted.sort(
        (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
      );
    }
    if (sort === "value-desc") sorted.sort((a, b) => b.total - a.total);
    if (sort === "value-asc") sorted.sort((a, b) => a.total - b.total);
    // "recent" keeps the API's own order, which is newest-first.
    return sorted;
  }, [orders, tab, search, payment, sort, range]);

  // Keep the viewport inside the result set when a filter shrinks it.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns: Column<Order>[] = [
    {
      id: "id",
      header: "Order Details",
      cell: (order) => (
        <div className="min-w-0">
          <p className="font-bold">#{order.reference}</p>
          <p className="text-xs text-muted-foreground">
            {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·{" "}
            {order.payment === "COD" ? "COD" : "Online"}
          </p>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (order) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{order.customer}</p>
          <p className="truncate text-xs text-muted-foreground">{order.phone}</p>
        </div>
      ),
    },
    {
      id: "placedAt",
      header: "Date & Time",
      hideBelow: "md",
      // Computed from "now", so server and client renders can differ by a
      // minute; hydration corrects it.
      cell: (order) => (
        <span suppressHydrationWarning className="text-muted-foreground">
          {friendlyDateTime(order.placedAt)}
        </span>
      ),
    },
    {
      id: "city",
      header: "Deliver To",
      hideBelow: "lg",
      cell: (order) => (
        <span className="line-clamp-1 text-muted-foreground">{order.address}</span>
      ),
    },
    {
      id: "total",
      header: "Amount",
      align: "right",
      cell: (order) => (
        <span data-numeric className="font-bold">
          {currency(order.total, true)}
        </span>
      ),
    },
    {
      id: "stage",
      header: "Status",
      align: "center",
      cell: (order) => <StatusBadge status={order.stage} />,
    },
    {
      id: "actions",
      header: "Actions",
      align: "center",
      cell: (order) => (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`View order ${order.reference}`}
          onClick={(event) => {
            event.stopPropagation();
            setDetail(order);
          }}
        >
          <Eye className="size-4" />
        </Button>
      ),
    },
  ];

  const exportCsv = () => {
    downloadCsv(
      stampedName("orders"),
      toCsv(
        [
          { header: "Order", value: (o: Order) => o.reference },
          { header: "Placed", value: (o: Order) => o.placedAt },
          { header: "Customer", value: (o: Order) => o.customer },
          { header: "Phone", value: (o: Order) => o.phone },
          { header: "Address", value: (o: Order) => o.address },
          { header: "Items", value: (o: Order) => o.itemCount },
          { header: "Subtotal", value: (o: Order) => o.subtotal },
          { header: "Delivery fee", value: (o: Order) => o.deliveryFee },
          { header: "Tax", value: (o: Order) => o.tax },
          { header: "Total", value: (o: Order) => o.total },
          { header: "Payment", value: (o: Order) => o.payment },
          { header: "Status", value: (o: Order) => STAGE_LABEL[o.stage] },
        ],
        filtered
      )
    );
    toast.success(`Exported ${filtered.length} order${filtered.length === 1 ? "" : "s"}`);
  };

  return (
    <>
      <PageActions>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="size-4" />
          Export
        </Button>
        <Button variant="outline" onClick={refetch}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </PageActions>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(order) => order.id}
        loading={loadingOrders}
        onRowClick={(order) => setDetail(order)}
        emptyTitle={orders.length === 0 ? "No orders yet" : "No orders match"}
        emptyDescription={
          orders.length === 0
            ? "Every order this restaurant takes will be listed here."
            : "Try a different search, or clear the status filter."
        }
        toolbar={
          <div className="space-y-3">
            <Toolbar>
              <SearchField
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder="Search by Order ID or Customer…"
              />
              <FilterMenu
                activeCount={payment !== "all" ? 1 : 0}
                onReset={() => {
                  setPayment("all");
                  setPage(1);
                }}
                groups={[
                  {
                    key: "payment",
                    label: "Payment",
                    value: payment,
                    onChange: (value) => {
                      setPayment(value as "all" | "Online" | "COD");
                      setPage(1);
                    },
                    options: [
                      { value: "all", label: "All" },
                      { value: "Online", label: "Online" },
                      { value: "COD", label: "COD" },
                    ],
                  },
                ]}
              />
              <SortMenu value={sort} onChange={setSort} options={SORTS} />
              <DateRangeMenu
                value={range}
                onChange={(next) => {
                  setRange(next);
                  setPage(1);
                }}
                className="h-11"
              />
            </Toolbar>
            <ChipTabs
              value={tab}
              onChange={(value) => {
                setTab(value as "all" | OrderStage);
                setPage(1);
              }}
              options={[
                { label: "All Orders", value: "all", count: orders.length },
                ...ORDER_STAGES.map((stage) => ({
                  label: STAGE_LABEL[stage],
                  value: stage,
                  count: stageCounts[stage],
                })),
              ]}
            />
          </div>
        }
      />

      <OrderDetailDialog
        order={detail}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      {filtered.length > 0 && (
        <div className="surface mt-4">
          <TablePagination
            className="border-t-0"
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
    </>
  );
}

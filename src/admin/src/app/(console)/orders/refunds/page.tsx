"use client";

import * as React from "react";
import Link from "next/link";
import {
  CircleCheck,
  Clock,
  Download,
  Eye,
  IndianRupee,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/common/panel";
import { DonutChart, TrendChart } from "@/components/charts/charts";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import {
  FilterBar,
  FilterSelect,
  SearchField,
  SegmentedTabs,
} from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportButton } from "@/components/common/export-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRefundTotals, useRefunds } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import {
  currency,
  currencyCompact,
  date as formatDate,
  dateTime,
  number as formatNumber,
  phone as formatPhone,
  relativeTime,
  titleCase,
} from "@/lib/format";
import { refDoc, refId } from "@/lib/types";
import type { Customer, Order, Refund } from "@/lib/types";

/**
 * Returns & Refunds, built to the client's reference screen: five headline
 * metrics, the refund trend beside two breakdown donuts, then the request
 * queue under a status tab strip.
 *
 * The charts describe the requests currently loaded — the API returns a page
 * of refunds, not period aggregates — so each panel says so rather than
 * implying it covers the whole date range.
 */

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "processing", label: "Processing" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
];

const TABS = [
  { label: "All Requests", value: "" },
  { label: "Approved", value: "approved" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
];

/** Groups rows into `{ label, value }` slices, largest first. */
function tally<T>(rows: T[], key: (row: T) => string, weight: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = key(row);
    if (!label) continue;
    totals.set(label, (totals.get(label) ?? 0) + weight(row));
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export default function RefundsPage() {
  const list = useListState({ status: "", fromDate: "", toDate: "" });
  const refunds = useRefunds(list.params);
  /* Totals for the whole filtered window, not just the page on screen. */
  const totals = useRefundTotals({
    status: list.filters.status ?? "",
    fromDate: list.filters.fromDate ?? "",
    toDate: list.filters.toDate ?? "",
  });
  const byStatus = (status: string) =>
    totals.data?.byStatus?.find(
      (row) => (row._id ?? "").toLowerCase() === status
    );
  const [grain, setGrain] = React.useState("daily");

  const rows = React.useMemo(() => refunds.data?.items ?? [], [refunds.data]);

  const statusIs = (refund: Refund, status: string) =>
    (refund.status ?? "").toLowerCase() === status;
  const countOf = (status: string) =>
    rows.filter((refund) => statusIs(refund, status)).length;
  const refundedTotal = rows
    .filter((refund) => statusIs(refund, "refunded"))
    .reduce((sum, refund) => sum + (refund.amount ?? 0), 0);

  /** Refund value per day across the loaded requests. */
  const trend = React.useMemo(() => {
    const span = grain === "weekly" ? 8 : 7;
    const step = grain === "weekly" ? 7 : 1;
    const buckets = Array.from({ length: span }, (_, index) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (span - 1 - index) * step);
      return {
        start: start.getTime(),
        end: start.getTime() + step * 86_400_000,
        label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        amount: 0,
      };
    });

    for (const refund of rows) {
      const at = refund.createdAt ? new Date(refund.createdAt).getTime() : NaN;
      if (Number.isNaN(at)) continue;
      const bucket = buckets.find((slot) => at >= slot.start && at < slot.end);
      if (bucket) bucket.amount += refund.amount ?? 0;
    }

    return buckets.map(({ label, amount }) => ({ label, amount }));
  }, [rows, grain]);

  const reasonMix = React.useMemo(
    () => tally(rows, (refund) => titleCase(refund.reason), () => 1),
    [rows]
  );
  const methodMix = React.useMemo(
    () => tally(rows, (refund) => refund.method ?? "", (refund) => refund.amount ?? 0),
    [rows]
  );
  const loadedTotal = rows.reduce((sum, refund) => sum + (refund.amount ?? 0), 0);

  const columns: Column<Refund>[] = [
    {
      id: "request",
      header: "Request ID",
      cell: (refund) => (
        <span className="font-medium">
          {refund.refundId ?? refund._id.slice(-10).toUpperCase()}
        </span>
      ),
    },
    {
      id: "order",
      header: "Order / Bank RRN",
      /*
       * The order until it is approved, the bank's reference afterwards.
       *
       * Once the money has been sent the useful reference is the one the
       * customer's own bank will recognise — the order id tells them nothing
       * when they ring up asking where their refund is. Razorpay issues it as
       * the ARN and it arrives from the acquirer, so it can lag the approval
       * by a little; that is said rather than left blank.
       */
      cell: (refund) => {
        const settled = ["approved", "processed", "completed", "refunded"].includes(
          (refund.status ?? "").toLowerCase()
        );
        const rrn = refund.processingDetails?.bankRRN;

        if (settled) {
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">
                {rrn || (
                  <span className="text-muted-foreground">Awaiting bank reference</span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {refDoc<Order>(refund.orderId)?.orderNumber ?? ""}
              </div>
            </div>
          );
        }

        const id = refId<Order>(refund.orderId);
        if (!id) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-0">
            <div className="truncate font-medium">
              {refDoc<Order>(refund.orderId)?.orderNumber}
            </div>
            <Link
              href={`/orders/${id}`}
              className="text-xs text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              View Order
            </Link>
          </div>
        );
      },
    },
    {
      id: "customer",
      header: "Customer",
      hideBelow: "md",
      cell: (refund) => {
        const customer = refDoc<Customer>(refund.userId);
        return (
          <IdentityCell
            name={customer?.name ?? "—"}
            secondary={formatPhone(customer?.phone)}
          />
        );
      },
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (refund) => (
        <StackedCell
          numeric
          className="text-right"
          primary={currency(refund.amount)}
          secondary={
            refund.method ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium">
                {refund.method}
              </span>
            ) : undefined
          }
        />
      ),
    },
    {
      id: "reason",
      header: "Reason",
      hideBelow: "lg",
      cell: (refund) => titleCase(refund.reason),
    },
    {
      id: "status",
      header: "Status",
      cell: (refund) => (
        <div className="min-w-0">
          <StatusBadge status={refund.status} />
          {refund.processedAt && (
            <div className="mt-1 text-[0.6875rem] text-muted-foreground">
              {formatDate(refund.processedAt)}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "requested",
      header: "Requested On",
      hideBelow: "lg",
      cell: (refund) => (
        <StackedCell
          primary={dateTime(refund.createdAt)}
          secondary={relativeTime(refund.createdAt)}
        />
      ),
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (refund) => {
        const id = refId<Order>(refund.orderId);
        return (
          <Button
            asChild={Boolean(id)}
            variant="outline"
            size="sm"
            disabled={!id}
            onClick={(event) => event.stopPropagation()}
          >
            {id ? (
              <Link href={`/orders/${id}`}>
                <Eye className="size-3.5" />
                View Details
              </Link>
            ) : (
              <span>
                <Eye className="size-3.5" />
                View Details
              </span>
            )}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Returns & Refunds"
        description="Refund requests, where each one is in the approval flow, and how much is at stake."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Orders", href: "/orders" },
          { label: "Returns & Refunds" },
        ]}
        actions={
          <>
            {/* The date range the figures and the list both answer for. */}
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="Refunds from"
                className="h-9 w-[9.5rem]"
                value={list.filters.fromDate ?? ""}
                onChange={(event) => list.setFilter("fromDate", event.target.value)}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="Refunds to"
                className="h-9 w-[9.5rem]"
                value={list.filters.toDate ?? ""}
                onChange={(event) => list.setFilter("toDate", event.target.value)}
              />
              {(list.filters.fromDate || list.filters.toDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    list.setFilter("fromDate", "");
                    list.setFilter("toDate", "");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <FilterSelect
              value={list.filters.status ?? ""}
              onChange={(value) => list.setFilter("status", value)}
              options={STATUS_OPTIONS}
              placeholder="All Status"
              allLabel="All Status"
            />
            <ExportButton<Refund>
              path="/admin/refunds"
              listKey="refunds"
              filename="reditoe-refunds"
              query={list.params}
              label="Export Report"
              columns={[
                { header: "Refund", value: (r) => r.refundId ?? r._id },
                { header: "Raised", value: (r) => r.createdAt },
                { header: "Order", value: (r) => refDoc<Order>(r.orderId)?.orderNumber ?? "" },
                { header: "Amount", value: (r) => r.amount ?? 0 },
                { header: "Reason", value: (r) => r.reason ?? "" },
                { header: "Method", value: (r) => r.method ?? "" },
                { header: "Status", value: (r) => r.status ?? "" },
              ]}
            />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total Requests"
          value={formatNumber(totals.data?.overview?.totalRefunds ?? refunds.data?.total)}
          icon={RotateCcw}
          tone="purple"
          compare="All refund requests"
          loading={refunds.isPending}
        />
        <MetricCard
          label="Approved"
          value={formatNumber(byStatus("approved")?.count ?? countOf("approved"))}
          icon={CircleCheck}
          tone="green"
          compare="In this date range"
          loading={refunds.isPending}
        />
        <MetricCard
          label="Pending"
          value={formatNumber(byStatus("pending")?.count ?? countOf("pending"))}
          icon={Clock}
          tone="amber"
          compare="In this date range"
          loading={refunds.isPending}
        />
        <MetricCard
          label="Rejected"
          value={formatNumber(byStatus("rejected")?.count ?? countOf("rejected"))}
          icon={XCircle}
          tone="red"
          compare="In this date range"
          loading={refunds.isPending}
        />
        <MetricCard
          label="Total Refunds"
          value={currencyCompact(totals.data?.overview?.totalAmount ?? refundedTotal)}
          icon={IndianRupee}
          tone="blue"
          compare="In this date range"
          loading={refunds.isPending}
        />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[1.4fr_1fr_1fr]">
        <Panel
          title="Refund Amount Over Time"
          description="Value of the requests currently loaded."
          action={
            <Select value={grain} onValueChange={setGrain}>
              <SelectTrigger className="h-8 w-auto min-w-[6rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <TrendChart
            data={trend}
            categoryKey="label"
            categoryLabel="Day"
            variant="line"
            height={220}
            caption="Refund amount (₹)"
            series={[
              {
                key: "amount",
                label: "Refund Amount",
                format: (value) => currency(value),
              },
            ]}
          />
        </Panel>

        <Panel
          title="Reason for Return / Refund"
          description="Requests currently loaded, by reason."
        >
          <DonutChart
            slices={reasonMix}
            centerLabel="Total"
            centerValue={formatNumber(rows.length)}
            height={220}
          />
        </Panel>

        <Panel
          title="Refunds by Payment Method"
          description="Requests currently loaded, by value."
        >
          <DonutChart
            slices={methodMix}
            centerLabel="Total Refund"
            centerValue={currencyCompact(loadedTotal)}
            height={220}
            format={(value) => currency(value)}
          />
        </Panel>
      </div>

      <div className="mt-6">
        <SegmentedTabs
          value={list.filters.status ?? ""}
          onChange={(value) => list.setFilter("status", value)}
          options={TABS}
          className="mb-4 w-fit max-w-full"
        />

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(refund) => refund._id}
          loading={refunds.isPending}
          error={refunds.error}
          onRetry={() => refunds.refetch()}
          emptyTitle="No refund requests"
          emptyDescription="Requests raised by customers or admins show up here."
          toolbar={
            <FilterBar onReset={list.reset}>
              <SearchField
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search by Order ID, Customer, Restaurant…"
              />
              <FilterSelect
                value={list.filters.status ?? ""}
                onChange={(value) => list.setFilter("status", value)}
                options={STATUS_OPTIONS}
                placeholder="All Status"
                allLabel="All Status"
              />
            </FilterBar>
          }
        />

        <div className="surface mt-3">
          <TablePagination
            page={list.page}
            pageSize={list.limit}
            total={refunds.data?.total ?? 0}
            onPageChange={list.setPage}
            onPageSizeChange={list.setLimit}
            className="border-t-0"
          />
        </div>
      </div>
    </>
  );
}

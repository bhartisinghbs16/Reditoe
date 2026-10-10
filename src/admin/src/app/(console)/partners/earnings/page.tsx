"use client";

import * as React from "react";
import {
  CircleCheck,
  Clock,
  Download,
  Eye,
  Info,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterBar, FilterSelect, SearchField } from "@/components/common/filter-bar";
import { PayoutDrawer } from "@/components/partners/payout-drawer";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRiders } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { partnerPayout, TDS_PERCENT } from "@/lib/payouts";
import {
  currency,
  currencyCompact,
  date as formatDate,
  number as formatNumber,
  shortId,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Rider } from "@/lib/types";

/**
 * Finance & Payouts for delivery partners, built to the client's reference
 * screen: four headline figures, a filter row, the per-partner earnings table
 * and the Payout Details drawer.
 *
 * The rider record holds lifetime earnings and nothing else, so gross is real,
 * tips and incentives read as em-dashes rather than zeros, and TDS is the
 * statutory 5% computed on gross. The arithmetic lives in lib/payouts so the
 * table and the drawer can't disagree.
 */

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "blocked", label: "Blocked" },
];

const METHOD_OPTIONS = [
  { value: "bank", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
];

/** Column header with the reference's info affordance. */
function HeaderHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={hint} className="cursor-help">
            <Info className="size-3 opacity-60" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    </span>
  );
}

/** Duty state under the partner's name, as on the partners list. */
function DutyLine({ rider }: { rider: Rider }) {
  const blocked = rider.isBlocked === true || rider.status === "blocked";
  const state = blocked
    ? { label: "Blocked", tint: "bg-danger" }
    : rider.status === "busy"
      ? { label: "Busy", tint: "bg-warning" }
      : rider.isOnline
        ? { label: "On Duty", tint: "bg-success" }
        : { label: "Offline", tint: "bg-muted-foreground" };
  return (
    <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", state.tint)} />
      {state.label}
    </span>
  );
}

export default function PartnerPayoutsPage() {
  const list = useListState({ payoutStatus: "", method: "" }, 25);
  const riders = useRiders(list.params);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const rows = React.useMemo(() => riders.data?.items ?? [], [riders.data]);

  const payouts = React.useMemo(
    () => rows.map((rider) => ({ ...partnerPayout(rider), rider })),
    [rows]
  );

  const visible = React.useMemo(() => {
    const status = list.filters.payoutStatus ?? "";
    if (!status) return payouts;
    return payouts.filter((entry) => entry.status === status);
  }, [payouts, list.filters.payoutStatus]);

  const paid = payouts.filter((entry) => entry.status === "paid");
  const pending = payouts.filter((entry) => entry.status === "pending");
  const totalNet = payouts.reduce((sum, entry) => sum + entry.net, 0);
  const paidNet = paid.reduce((sum, entry) => sum + entry.net, 0);
  const pendingNet = pending.reduce((sum, entry) => sum + entry.net, 0);
  const activePartners = rows.filter(
    (rider) => rider.isBlocked !== true && (rider.status ?? "active") === "active"
  ).length;

  const open = openId
    ? (visible.find((entry) => entry.rider._id === openId) ?? null)
    : null;

  const columns: Column<(typeof payouts)[number]>[] = [
    {
      id: "partner",
      header: "Partner Details",
      cell: ({ rider }) => (
        <IdentityCell
          name={rider.name ?? "Unnamed"}
          secondary={<DutyLine rider={rider} />}
          image={rider.image}
        />
      ),
    },
    {
      id: "partnerId",
      header: "Partner ID",
      hideBelow: "lg",
      cell: ({ rider }) => (
        <span className="text-[0.8125rem]">
          {rider.riderId ?? shortId(rider._id, "RDTP")}
        </span>
      ),
    },
    {
      id: "gross",
      header: <HeaderHint label="Gross Earnings" hint="Delivery charges earned." />,
      align: "right",
      cell: (entry) => (
        <span className="tabular-nums">{currency(entry.gross, true)}</span>
      ),
    },
    {
      id: "tips",
      header: <HeaderHint label="Tips" hint="Received from customers." />,
      align: "right",
      hideBelow: "xl",
      cell: (entry) => (
        <span className="tabular-nums text-muted-foreground">
          {entry.tips === null ? "—" : currency(entry.tips, true)}
        </span>
      ),
    },
    {
      id: "incentives",
      header: <HeaderHint label="Incentives" hint="Performance and bonuses." />,
      align: "right",
      hideBelow: "xl",
      cell: (entry) => (
        <span className="tabular-nums text-muted-foreground">
          {entry.incentives === null ? "—" : currency(entry.incentives, true)}
        </span>
      ),
    },
    {
      id: "tds",
      header: (
        <HeaderHint
          label={`TDS (${TDS_PERCENT}%)`}
          hint="Tax deducted at source, computed on gross earnings."
        />
      ),
      align: "right",
      hideBelow: "lg",
      cell: (entry) => (
        <span className="tabular-nums text-danger-foreground">
          −{currency(entry.tds, true)}
        </span>
      ),
    },
    {
      id: "net",
      header: "Net Earnings",
      align: "right",
      cell: (entry) => (
        <span className="font-medium tabular-nums text-success-foreground">
          {currency(entry.net, true)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Payout Status",
      cell: (entry) => <StatusBadge status={entry.status} />,
    },
    {
      id: "date",
      header: "Payout Date",
      hideBelow: "xl",
      cell: ({ rider }) =>
        rider.totalEarnings ? formatDate(rider.updatedAt ?? rider.createdAt) : "—",
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (entry) => (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Payout details for ${entry.rider.name ?? "partner"}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpenId(entry.rider._id);
          }}
        >
          <Eye className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Finance & Payouts"
        description="Manage and process delivery partner payouts."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Delivery Partners", href: "/partners" },
          { label: "Payouts" },
        ]}
        actions={
          <ExportButton<Rider>
            path="/admin/riders"
            listKey="riders"
            filename="reditoe-partner-payouts"
            query={list.params}
            columns={[
              { header: "Partner", value: (r) => r.name ?? "" },
              { header: "Phone", value: (r) => r.phone ?? "" },
              { header: "City", value: (r) => r.city ?? "" },
              { header: "Deliveries", value: (r) => r.totalDeliveries ?? 0 },
              { header: "Earnings", value: (r) => r.totalEarnings ?? 0 },
              { header: "Status", value: (r) => (r.isBlocked ? "Blocked" : "Active") },
            ]}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetricCard
          label="Total Payouts"
          value={currencyCompact(totalNet)}
          hint={`Across ${formatNumber(payouts.length)} partners on this page`}
          icon={Wallet}
          tone="purple"
        />
        <MiniMetricCard
          label="Total Paid"
          value={currencyCompact(paidNet)}
          hint={`To ${formatNumber(paid.length)} partners`}
          icon={CircleCheck}
          tone="green"
        />
        <MiniMetricCard
          label="Pending Payouts"
          value={currencyCompact(pendingNet)}
          hint={`To ${formatNumber(pending.length)} partners`}
          icon={Clock}
          tone="amber"
        />
        <MiniMetricCard
          label="Total Partners"
          value={formatNumber(riders.data?.total)}
          hint={`${formatNumber(activePartners)} active on this page`}
          icon={UserRoundCheck}
          tone="blue"
        />
      </div>

      <div className="mt-3">
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(entry) => entry.rider._id}
          loading={riders.isPending}
          error={riders.error}
          onRetry={() => riders.refetch()}
          onRowClick={(entry) => setOpenId(entry.rider._id)}
          emptyTitle="No payouts match these filters"
          emptyDescription="Partner earnings appear here once deliveries are completed."
          toolbar={
            <FilterBar onReset={list.reset}>
              <SearchField
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search by name, phone or Partner ID…"
              />
              <FilterSelect
                value={list.filters.payoutStatus ?? ""}
                onChange={(value) => list.setFilter("payoutStatus", value)}
                options={STATUS_OPTIONS}
                placeholder="Payout Status"
                allLabel="All Statuses"
              />
              <FilterSelect
                value={list.filters.method ?? ""}
                onChange={(value) => list.setFilter("method", value)}
                options={METHOD_OPTIONS}
                placeholder="Payout Method"
                allLabel="All Methods"
              />
            </FilterBar>
          }
        />

        <div className="surface mt-3">
          <TablePagination
            page={list.page}
            pageSize={list.limit}
            total={riders.data?.total ?? 0}
            onPageChange={list.setPage}
            onPageSizeChange={list.setLimit}
            className="border-t-0"
          />
        </div>
      </div>

      <PayoutDrawer payout={open} onClose={() => setOpenId(null)} />
    </>
  );
}

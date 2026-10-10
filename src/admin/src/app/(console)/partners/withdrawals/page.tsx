"use client";

import * as React from "react";
import { CircleCheck, Clock, Download, Wallet } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { useRiderWithdrawals } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, dateTime, number as formatNumber, titleCase } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Payout, Rider } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

export default function RiderWithdrawalsPage() {
  const list = useListState({ status: "" });
  const withdrawals = useRiderWithdrawals(list.params);

  const columns: Column<Payout>[] = [
    {
      id: "partner",
      header: "Partner",
      cell: (withdrawal) => {
        const rider = refDoc<Rider>(withdrawal.riderId);
        return (
          <IdentityCell
            name={rider?.name ?? "—"}
            secondary={rider?.riderId ?? rider?.phone}
            image={rider?.image}
          />
        );
      },
    },
    {
      id: "reference",
      header: "Reference",
      hideBelow: "md",
      cell: (withdrawal) =>
        withdrawal.reference ?? withdrawal._id.slice(-10).toUpperCase(),
    },
    {
      id: "method",
      header: "Method",
      hideBelow: "lg",
      cell: (withdrawal) => titleCase(withdrawal.method),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (withdrawal) => (
        <span className="font-medium tabular-nums">
          {currency(withdrawal.netAmount ?? withdrawal.amount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (withdrawal) => <StatusBadge status={withdrawal.status} />,
    },
    {
      id: "requested",
      header: "Requested",
      hideBelow: "lg",
      cell: (withdrawal) => dateTime(withdrawal.createdAt),
    },
  ];

  const rows = withdrawals.data?.items ?? [];
  const sumBy = (predicate: (item: Payout) => boolean) =>
    currency(
      rows
        .filter(predicate)
        .reduce((sum, item) => sum + (item.netAmount ?? item.amount ?? 0), 0)
    );

  return (
    <ResourceListPage
      title="Partner withdrawals"
      description="Cash-out requests from delivery partners against their earned balance."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Delivery partners", href: "/partners" },
        { label: "Withdrawals" },
      ]}
      actions={
        <ExportButton<Payout>
          path="/admin/rider-withdrawals"
          listKey="withdrawals"
          filename="reditoe-rider-withdrawals"
          query={list.params}
          columns={[
              { header: "Request", value: (r) => r.payoutId ?? r._id },
              { header: "Partner", value: (r) => refDoc<Rider>(r.riderId)?.name ?? "" },
              { header: "Amount", value: (r) => r.netAmount ?? r.amount },
              { header: "Status", value: (r) => r.status },
              { header: "Reference", value: (r) => r.reference ?? "" },
            ]}
        />
      }
      stats={
        <StatGrid columns={3}>
          <StatCard
            label="Requests"
            value={formatNumber(withdrawals.data?.total)}
            icon={Wallet}
            tone="indigo"
            loading={withdrawals.isPending}
          />
          <StatCard
            label="Awaiting approval (page)"
            value={sumBy((item) => (item.status ?? "").toLowerCase() === "pending")}
            icon={Clock}
            tone="amber"
            loading={withdrawals.isPending}
          />
          <StatCard
            label="Paid out (page)"
            value={sumBy((item) => (item.status ?? "").toLowerCase() === "paid")}
            icon={CircleCheck}
            tone="emerald"
            loading={withdrawals.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search partner or reference…"
          />
          <FilterSelect
            value={list.filters.status ?? ""}
            onChange={(value) => list.setFilter("status", value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            allLabel="All statuses"
          />
        </>
      }
      columns={columns}
      query={withdrawals}
      list={list}
      rowKey={(withdrawal) => withdrawal._id}
      emptyTitle="No withdrawal requests"
    />
  );
}

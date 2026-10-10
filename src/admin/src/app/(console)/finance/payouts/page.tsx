"use client";

import * as React from "react";
import { CircleCheck, Clock, Download, Wallet } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { usePayouts } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, date as formatDate, number as formatNumber, titleCase } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Payout, Restaurant, Rider } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
];

export default function PayoutsPage() {
  const list = useListState({ status: "" });
  const payouts = usePayouts(list.params);

  const columns: Column<Payout>[] = [
    {
      id: "payee",
      header: "Payee",
      cell: (payout) => {
        const restaurant = refDoc<Restaurant>(payout.restaurantId);
        const rider = refDoc<Rider>(payout.riderId);
        const name = restaurant?.name ?? rider?.name ?? "—";
        return (
          <IdentityCell
            square={Boolean(restaurant)}
            name={name}
            secondary={restaurant ? "Restaurant" : rider ? "Delivery partner" : undefined}
            image={restaurant?.image ?? rider?.image}
          />
        );
      },
    },
    {
      id: "reference",
      header: "Reference",
      hideBelow: "md",
      cell: (payout) => (
        <StackedCell
          primary={payout.payoutId ?? payout._id.slice(-10).toUpperCase()}
          secondary={payout.reference}
        />
      ),
    },
    {
      id: "period",
      header: "Period",
      hideBelow: "lg",
      cell: (payout) =>
        payout.periodStart || payout.periodEnd ? (
          <StackedCell
            primary={formatDate(payout.periodStart)}
            secondary={`to ${formatDate(payout.periodEnd)}`}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "method",
      header: "Method",
      hideBelow: "xl",
      cell: (payout) => titleCase(payout.method),
    },
    {
      id: "amount",
      header: "Net amount",
      align: "right",
      cell: (payout) => (
        <StackedCell
          numeric
          className="text-right"
          primary={currency(payout.netAmount ?? payout.amount)}
          secondary={
            payout.netAmount !== undefined && payout.amount !== undefined
              ? `Gross ${currency(payout.amount)}`
              : undefined
          }
        />
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (payout) => <StatusBadge status={payout.status} />,
    },
    {
      id: "created",
      header: "Created",
      hideBelow: "xl",
      cell: (payout) => formatDate(payout.createdAt),
    },
  ];

  const rows = payouts.data?.items ?? [];
  const sumBy = (predicate: (payout: Payout) => boolean) =>
    currency(
      rows
        .filter(predicate)
        .reduce((sum, payout) => sum + (payout.netAmount ?? payout.amount ?? 0), 0)
    );

  return (
    <ResourceListPage
      title="Vendor payouts"
      description="Money released to restaurants and delivery partners."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Finance", href: "/finance" },
        { label: "Payouts" },
      ]}
      actions={
        <ExportButton<Payout>
          path="/admin/payouts"
          listKey="payouts"
          filename="reditoe-vendor-payouts"
          query={list.params}
          columns={[
              { header: "Payout", value: (r) => r.payoutId ?? r._id },
              { header: "Raised", value: (r) => r.createdAt },
              { header: "Restaurant", value: (r) => refDoc<Restaurant>(r.restaurantId)?.name ?? "" },
              { header: "Amount", value: (r) => r.amount },
              { header: "Net", value: (r) => r.netAmount },
              { header: "Status", value: (r) => r.status },
              { header: "Reference", value: (r) => r.reference ?? r.payoutId ?? "" },
            ]}
        />
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Payouts"
            value={formatNumber(payouts.data?.total)}
            icon={Wallet}
            tone="indigo"
            loading={payouts.isPending}
          />
          <StatCard
            label="Paid (page)"
            value={sumBy((payout) => (payout.status ?? "").toLowerCase() === "paid")}
            icon={CircleCheck}
            tone="emerald"
            loading={payouts.isPending}
          />
          <StatCard
            label="Pending (page)"
            value={sumBy((payout) => (payout.status ?? "").toLowerCase() === "pending")}
            icon={Clock}
            tone="amber"
            loading={payouts.isPending}
          />
          <StatCard
            label="Total value (page)"
            value={sumBy(() => true)}
            icon={Wallet}
            tone="violet"
            loading={payouts.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search payee or reference…"
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
      query={payouts}
      list={list}
      rowKey={(payout) => payout._id}
      emptyTitle="No payouts match these filters"
    />
  );
}

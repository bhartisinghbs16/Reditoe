"use client";

import * as React from "react";
import { CircleCheck, Clock, Download, Scale } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { useSettlements } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, date as formatDate, number as formatNumber } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Payout, Restaurant } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "settled", label: "Settled" },
  { value: "failed", label: "Failed" },
];

export default function SettlementsPage() {
  const list = useListState({ status: "" });
  const settlements = useSettlements(list.params);

  const columns: Column<Payout>[] = [
    {
      id: "vendor",
      header: "Vendor",
      cell: (settlement) => {
        const restaurant = refDoc<Restaurant>(settlement.restaurantId);
        return (
          <IdentityCell
            square
            name={restaurant?.name ?? "—"}
            secondary={restaurant?.address?.city}
            image={restaurant?.image}
          />
        );
      },
    },
    {
      id: "cycle",
      header: "Cycle",
      hideBelow: "md",
      cell: (settlement) => (
        <StackedCell
          primary={formatDate(settlement.periodStart)}
          secondary={`to ${formatDate(settlement.periodEnd)}`}
        />
      ),
    },
    {
      id: "reference",
      header: "Reference",
      hideBelow: "xl",
      cell: (settlement) =>
        settlement.reference ?? settlement._id.slice(-10).toUpperCase(),
    },
    {
      id: "gross",
      header: "Gross",
      align: "right",
      hideBelow: "lg",
      cell: (settlement) => (
        <span className="tabular-nums">{currency(settlement.amount)}</span>
      ),
    },
    {
      id: "net",
      header: "Net payable",
      align: "right",
      cell: (settlement) => (
        <span className="font-medium tabular-nums">
          {currency(settlement.netAmount ?? settlement.amount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (settlement) => <StatusBadge status={settlement.status} />,
    },
  ];

  const rows = settlements.data?.items ?? [];
  const sumBy = (predicate: (settlement: Payout) => boolean) =>
    currency(
      rows
        .filter(predicate)
        .reduce((sum, item) => sum + (item.netAmount ?? item.amount ?? 0), 0)
    );

  return (
    <ResourceListPage
      title="Settlements"
      description="Vendor settlement cycles: what was earned, what was deducted, what is payable."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Finance", href: "/finance" },
        { label: "Settlements" },
      ]}
      actions={
        <ExportButton<Payout>
          path="/admin/vendor-settlements"
          listKey="settlements"
          filename="reditoe-settlements"
          query={list.params}
          columns={[
              { header: "Settlement", value: (r) => r.payoutId ?? r._id },
              { header: "Period", value: (r) => [r.periodStart, r.periodEnd].filter(Boolean).join(" to ") },
              { header: "Restaurant", value: (r) => refDoc<Restaurant>(r.restaurantId)?.name ?? "" },
              { header: "Amount", value: (r) => r.amount },
              { header: "Net", value: (r) => r.netAmount },
              { header: "Status", value: (r) => r.status },
            ]}
        />
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Settlement runs"
            value={formatNumber(settlements.data?.total)}
            icon={Scale}
            tone="indigo"
            loading={settlements.isPending}
          />
          <StatCard
            label="Settled (page)"
            value={sumBy((item) => (item.status ?? "").toLowerCase() === "settled")}
            icon={CircleCheck}
            tone="emerald"
            loading={settlements.isPending}
          />
          <StatCard
            label="Pending (page)"
            value={sumBy((item) => (item.status ?? "").toLowerCase() === "pending")}
            icon={Clock}
            tone="amber"
            loading={settlements.isPending}
          />
          <StatCard
            label="Total payable (page)"
            value={sumBy(() => true)}
            icon={Scale}
            tone="violet"
            loading={settlements.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search vendor or reference…"
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
      query={settlements}
      list={list}
      rowKey={(settlement) => settlement._id}
      emptyTitle="No settlements match these filters"
    />
  );
}

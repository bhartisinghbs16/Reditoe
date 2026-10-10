"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, Clock, MessageSquareWarning, TriangleAlert } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { useDisputes } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, dateTime, number as formatNumber, titleCase } from "@/lib/format";
import { refDoc, refId } from "@/lib/types";
import type { Dispute, Order } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under review" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function DisputesPage() {
  const list = useListState({ status: "" });
  const disputes = useDisputes(list.params);

  const columns: Column<Dispute>[] = [
    {
      id: "dispute",
      header: "Dispute",
      cell: (dispute) => (
        <StackedCell
          primary={dispute.disputeId ?? dispute._id.slice(-10).toUpperCase()}
          secondary={titleCase(dispute.reason)}
        />
      ),
    },
    {
      id: "order",
      header: "Order",
      cell: (dispute) => {
        const id = refId<Order>(dispute.orderId);
        if (!id) return <span className="text-muted-foreground">—</span>;
        return (
          <Link
            href={`/orders/${id}`}
            className="text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {refDoc<Order>(dispute.orderId)?.orderNumber}
          </Link>
        );
      },
    },
    {
      id: "raisedBy",
      header: "Raised by",
      hideBelow: "md",
      cell: (dispute) => titleCase(dispute.raisedBy),
    },
    {
      id: "amount",
      header: "Amount at stake",
      align: "right",
      hideBelow: "lg",
      cell: (dispute) => (
        <span className="tabular-nums">{currency(dispute.amount ?? 0)}</span>
      ),
    },
    {
      id: "resolution",
      header: "Resolution",
      hideBelow: "xl",
      className: "max-w-xs",
      cell: (dispute) => (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {dispute.resolution ?? "—"}
        </p>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (dispute) => <StatusBadge status={dispute.status} />,
    },
    {
      id: "raised",
      header: "Raised",
      hideBelow: "lg",
      cell: (dispute) => dateTime(dispute.createdAt),
    },
  ];

  const rows = disputes.data?.items ?? [];
  const statusIs = (dispute: Dispute, status: string) =>
    (dispute.status ?? "").toLowerCase().replace(/[\s-]+/g, "_") === status;

  return (
    <ResourceListPage
      title="Disputes"
      description="Contested orders that need a decision, and how much money each one holds up."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Support", href: "/support" },
        { label: "Disputes" },
      ]}
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Disputes"
            value={formatNumber(disputes.data?.total)}
            icon={MessageSquareWarning}
            tone="indigo"
            loading={disputes.isPending}
          />
          <StatCard
            label="Open (page)"
            value={formatNumber(rows.filter((d) => statusIs(d, "open")).length)}
            icon={Clock}
            tone="amber"
            loading={disputes.isPending}
          />
          <StatCard
            label="Escalated (page)"
            value={formatNumber(rows.filter((d) => statusIs(d, "escalated")).length)}
            icon={TriangleAlert}
            tone="rose"
            loading={disputes.isPending}
          />
          <StatCard
            label="Value at stake (page)"
            value={currency(rows.reduce((sum, d) => sum + (d.amount ?? 0), 0))}
            icon={CircleCheck}
            tone="violet"
            loading={disputes.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search dispute or order ID…"
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
      query={disputes}
      list={list}
      rowKey={(dispute) => dispute._id}
      emptyTitle="No disputes"
      emptyDescription="Nothing is contested right now."
    />
  );
}

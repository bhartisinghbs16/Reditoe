"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, Download, Receipt, TriangleAlert } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { useInvoices } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, date as formatDate, number as formatNumber } from "@/lib/format";
import { refDoc, refId } from "@/lib/types";
import type { Invoice, Order, Restaurant } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Draft" },
];

/** Unpaid past its due date reads as overdue even if the API hasn't caught up. */
function invoiceStatus(invoice: Invoice) {
  const status = (invoice.status ?? "").toLowerCase();
  if (status && status !== "unpaid") return status;
  if (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now())
    return "overdue";
  return status || "unpaid";
}

export default function InvoicesPage() {
  const list = useListState({ status: "" });
  const invoices = useInvoices(list.params);

  const columns: Column<Invoice>[] = [
    {
      id: "invoice",
      header: "Invoice",
      cell: (invoice) => (
        <StackedCell
          primary={invoice.invoiceNumber ?? invoice._id.slice(-10).toUpperCase()}
          secondary={`Issued ${formatDate(invoice.issuedDate ?? invoice.createdAt)}`}
        />
      ),
    },
    {
      id: "restaurant",
      header: "Restaurant",
      hideBelow: "md",
      cell: (invoice) => refDoc<Restaurant>(invoice.restaurantId)?.name ?? "—",
    },
    {
      id: "order",
      header: "Order",
      hideBelow: "xl",
      cell: (invoice) => {
        const id = refId<Order>(invoice.orderId);
        if (!id) return <span className="text-muted-foreground">—</span>;
        return (
          <Link
            href={`/orders/${id}`}
            className="text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {refDoc<Order>(invoice.orderId)?.orderNumber}
          </Link>
        );
      },
    },
    {
      id: "due",
      header: "Due",
      hideBelow: "lg",
      cell: (invoice) => formatDate(invoice.dueDate),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (invoice) => (
        <span className="tabular-nums">
          {currency(invoice.totalAmount ?? invoice.amount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (invoice) => <StatusBadge status={invoiceStatus(invoice)} />,
    },
  ];

  const rows = invoices.data?.items ?? [];
  const sumBy = (predicate: (invoice: Invoice) => boolean) =>
    currency(
      rows
        .filter(predicate)
        .reduce((sum, invoice) => sum + (invoice.totalAmount ?? invoice.amount ?? 0), 0)
    );

  return (
    <ResourceListPage
      title="Invoices"
      description="Issued invoices, what's been settled and what's overdue."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Finance", href: "/finance" },
        { label: "Invoices" },
      ]}
      actions={
        <ExportButton<Invoice>
          path="/admin/invoices"
          listKey="invoices"
          filename="reditoe-invoices"
          query={list.params}
          columns={[
              { header: "Invoice", value: (r) => r.invoiceNumber ?? r._id.slice(-10).toUpperCase() },
              { header: "Issued", value: (r) => r.issuedDate ?? r.createdAt },
              { header: "Restaurant", value: (r) => refDoc<Restaurant>(r.restaurantId)?.name ?? "" },
              { header: "Order", value: (r) => refDoc<Order>(r.orderId)?.orderNumber ?? "" },
              { header: "Due", value: (r) => r.dueDate },
              { header: "Amount", value: (r) => r.totalAmount ?? r.amount },
              { header: "Status", value: (r) => invoiceStatus(r) },
            ]}
        />
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Invoices"
            value={formatNumber(invoices.data?.total)}
            icon={Receipt}
            tone="indigo"
            loading={invoices.isPending}
          />
          <StatCard
            label="Paid (page)"
            value={sumBy((invoice) => invoiceStatus(invoice) === "paid")}
            icon={CircleCheck}
            tone="emerald"
            loading={invoices.isPending}
          />
          <StatCard
            label="Overdue (page)"
            value={sumBy((invoice) => invoiceStatus(invoice) === "overdue")}
            icon={TriangleAlert}
            tone="rose"
            loading={invoices.isPending}
          />
          <StatCard
            label="Total billed (page)"
            value={sumBy(() => true)}
            icon={Receipt}
            tone="violet"
            loading={invoices.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search invoice number…"
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
      query={invoices}
      list={list}
      rowKey={(invoice) => invoice._id}
      emptyTitle="No invoices match these filters"
    />
  );
}

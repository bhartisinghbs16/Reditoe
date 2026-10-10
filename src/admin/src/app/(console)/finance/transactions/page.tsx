"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CreditCard, Download } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { useTransactions } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/domain";
import { currency, dateTime, number as formatNumber, titleCase } from "@/lib/format";
import { refDoc, refId } from "@/lib/types";
import type { Customer, Order, Transaction } from "@/lib/types";

const TYPE_OPTIONS = [
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
  { value: "payout", label: "Payout" },
  { value: "wallet", label: "Wallet" },
];

/** Refunds and payouts move money out; everything else moves it in. */
function isOutflow(type?: string) {
  const value = (type ?? "").toLowerCase();
  return value.includes("refund") || value.includes("payout") || value.includes("debit");
}

export default function TransactionsPage() {
  const list = useListState({ status: "", method: "", type: "" });
  const transactions = useTransactions(list.params);

  const columns: Column<Transaction>[] = [
    {
      id: "transaction",
      header: "Transaction",
      cell: (transaction) => (
        <StackedCell
          primary={
            transaction.transactionId ?? transaction._id.slice(-10).toUpperCase()
          }
          secondary={transaction.description}
        />
      ),
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "md",
      cell: (transaction) => (
        <span className="inline-flex items-center gap-1.5">
          {isOutflow(transaction.type) ? (
            <ArrowUpRight className="size-3.5 text-danger" />
          ) : (
            <ArrowDownLeft className="size-3.5 text-success" />
          )}
          {titleCase(transaction.type)}
        </span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      hideBelow: "lg",
      cell: (transaction) => refDoc<Customer>(transaction.userId)?.name ?? "—",
    },
    {
      id: "order",
      header: "Order",
      hideBelow: "xl",
      cell: (transaction) => {
        const id = refId<Order>(transaction.orderId);
        const order = refDoc<Order>(transaction.orderId);
        if (!id) return <span className="text-muted-foreground">—</span>;
        return (
          <Link
            href={`/orders/${id}`}
            className="text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {order?.orderNumber}
          </Link>
        );
      },
    },
    {
      id: "method",
      header: "Method",
      hideBelow: "lg",
      cell: (transaction) => titleCase(transaction.method),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (transaction) => (
        <span
          className={
            isOutflow(transaction.type)
              ? "font-medium tabular-nums text-danger"
              : "font-medium tabular-nums"
          }
        >
          {isOutflow(transaction.type) ? "−" : ""}
          {currency(transaction.amount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (transaction) => <StatusBadge status={transaction.status} />,
    },
    {
      id: "date",
      header: "Date",
      hideBelow: "xl",
      cell: (transaction) => dateTime(transaction.createdAt),
    },
  ];

  const rows = transactions.data?.items ?? [];
  const inflow = rows
    .filter((transaction) => !isOutflow(transaction.type))
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0);
  const outflow = rows
    .filter((transaction) => isOutflow(transaction.type))
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0);

  return (
    <ResourceListPage
      title="Transactions"
      description="Every payment, refund and payout recorded against the platform."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Finance", href: "/finance" },
        { label: "Transactions" },
      ]}
      actions={
        <ExportButton<Transaction>
          path="/admin/payments"
          listKey="payments"
          filename="reditoe-transactions"
          query={list.params}
          columns={[
              { header: "Transaction", value: (r) => r.transactionId ?? r._id },
              { header: "Type", value: (r) => r.type ?? "" },
              { header: "Order", value: (r) => refDoc<Order>(r.orderId)?.orderNumber ?? "" },
              { header: "Method", value: (r) => r.method ?? "" },
              { header: "Amount", value: (r) => r.amount },
              { header: "Status", value: (r) => r.status },
            ]}
        />
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Transactions"
            value={formatNumber(transactions.data?.total)}
            icon={CreditCard}
            tone="indigo"
            loading={transactions.isPending}
          />
          <StatCard
            label="Inflow (page)"
            value={currency(inflow)}
            icon={ArrowDownLeft}
            tone="emerald"
            loading={transactions.isPending}
          />
          <StatCard
            label="Outflow (page)"
            value={currency(outflow)}
            icon={ArrowUpRight}
            tone="rose"
            loading={transactions.isPending}
          />
          <StatCard
            label="Net (page)"
            value={currency(inflow - outflow)}
            icon={CreditCard}
            tone="violet"
            loading={transactions.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search transaction or order ID…"
          />
          <FilterSelect
            value={list.filters.type ?? ""}
            onChange={(value) => list.setFilter("type", value)}
            options={TYPE_OPTIONS}
            placeholder="All types"
            allLabel="All types"
          />
          <FilterSelect
            value={list.filters.status ?? ""}
            onChange={(value) => list.setFilter("status", value)}
            options={PAYMENT_STATUS_OPTIONS}
            placeholder="All statuses"
            allLabel="All statuses"
          />
          <FilterSelect
            value={list.filters.method ?? ""}
            onChange={(value) => list.setFilter("method", value)}
            options={PAYMENT_METHOD_OPTIONS}
            placeholder="All methods"
            allLabel="All methods"
          />
        </>
      }
      columns={columns}
      query={transactions}
      list={list}
      rowKey={(transaction) => transaction._id}
      emptyTitle="No transactions match these filters"
    />
  );
}

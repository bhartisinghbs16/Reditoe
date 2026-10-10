"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Coins,
  Hourglass,
  Landmark,
  Loader2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageActions } from "@/components/common/page-actions";
import { StatTile } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { UnderlineTabs } from "@/components/common/filter-bar";
import { PeriodSelect } from "@/components/common/list-controls";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { PromoBanner } from "@/components/common/promo-banner";
import { TrendChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { CHART_PRIMARY } from "@/lib/accent";
import { currency, dateTime } from "@/lib/format";
import { periodLabel, type Period } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import {
  fetchWithdrawals,
  fetchWithdrawalSummary,
  requestWithdrawal,
  type Withdrawal,
} from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

export default function EarningsPage() {
  const { profile, stats, orders } = useVendor();
  const [tab, setTab] = React.useState("payouts");
  const [period, setPeriod] = React.useState<Period>("daily");
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["withdrawals", "summary"],
    queryFn: fetchWithdrawalSummary,
  });
  const withdrawals = useQuery({
    queryKey: ["withdrawals", "list"],
    queryFn: fetchWithdrawals,
  });

  const withdraw = useMutation({
    mutationFn: (amount: number) => requestWithdrawal(amount),
    onSuccess: () => {
      toast.success("Payout requested");
      queryClient.invalidateQueries({ queryKey: ["withdrawals"] });
    },
    onError: (error: Error) =>
      toast.error(error.message || "Could not request the payout"),
  });

  const withdrawable = summary.data?.withdrawable ?? 0;

  const series =
    period === "weekly"
      ? (stats?.weekly ?? [])
      : period === "monthly"
        ? (stats?.monthly ?? [])
        : (stats?.daily ?? []);

  /** Order-by-order earnings, from the orders the API already returned. */
  const earned = React.useMemo(
    () =>
      orders
        .filter((order) => order.stage === "completed")
        .map((order) => ({
          id: order.id,
          at: order.placedAt,
          reference: `#${order.reference}`,
          type: "Order Earning",
          detail: `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`,
          amount: order.subtotal,
          status: order.paid ? "Completed" : "Pending",
        })),
    [orders]
  );

  const payoutColumns: Column<Withdrawal>[] = [
    {
      id: "createdAt",
      header: "Requested",
      cell: (row) => (
        <span suppressHydrationWarning className="font-medium">
          {row.createdAt ? dateTime(row.createdAt) : "—"}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Reference",
      cell: (row) => (
        <span className="font-semibold">{row.reference ?? row.id.slice(-8)}</span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => (
        <span data-numeric className="font-bold">
          {currency(row.amount, true)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      align: "center",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const earningColumns: Column<(typeof earned)[number]>[] = [
    {
      id: "at",
      header: "Date & Time",
      cell: (row) => (
        <span suppressHydrationWarning className="font-medium">
          {dateTime(row.at)}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Order ID",
      cell: (row) => <span className="font-semibold">{row.reference}</span>,
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "md",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.type}</p>
          <p className="text-xs text-muted-foreground">{row.detail}</p>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => (
        <span data-numeric className="font-bold">
          {currency(row.amount, true)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      align: "center",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <>
      <PageActions>
        <Button
          disabled={withdrawable <= 0 || withdraw.isPending}
          onClick={() => withdraw.mutate(withdrawable)}
        >
          {withdraw.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Landmark className="size-4" />
          )}
          Request Payout
        </Button>
      </PageActions>

      {/* Today's earnings — the reference's hero card. */}
      <div className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Total Sales</p>
          <p data-numeric className="mt-1 text-3xl font-bold tracking-tight">
            {currency(stats?.totalSales ?? 0, true)}
          </p>
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            {stats?.completedOrderCount ?? 0} delivered order
            {stats?.completedOrderCount === 1 ? "" : "s"} · commission{" "}
            {profile?.commissionPercent ?? 0}%
          </p>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-[0.8125rem] text-muted-foreground">Available now</p>
          <p
            data-numeric
            className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400"
          >
            {currency(withdrawable, true)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          tone="violet"
          value={currency(withdrawable, true)}
          label="Available Balance"
          caption="Ready to withdraw"
          labelFirst
        />
        <StatTile
          icon={TrendingUp}
          tone="green"
          value={currency(summary.data?.confirmedEarnings ?? 0, true)}
          label="Confirmed Earnings"
          caption="Settled by the platform"
          labelFirst
        />
        <StatTile
          icon={Hourglass}
          tone="amber"
          value={currency(summary.data?.unsettledEarnings ?? 0, true)}
          label="Unsettled Earnings"
          caption="Awaiting settlement"
          labelFirst
        />
        <StatTile
          icon={Coins}
          tone="blue"
          value={currency(summary.data?.alreadyWithdrawn ?? 0, true)}
          label="Already Withdrawn"
          caption="Paid to your bank"
          labelFirst
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Earnings Overview"
          description={`${periodLabel(period)}, from the platform`}
          action={<PeriodSelect value={period} onChange={setPeriod} />}
        >
          <p data-numeric className="text-2xl font-bold tracking-tight">
            {currency(stats?.totalSales ?? 0, true)}
          </p>
          {series.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No earnings recorded this week.
            </p>
          ) : (
            <TrendChart
              className="mt-2"
              data={series}
              categoryKey="label"
              categoryLabel="Day"
              height={220}
              series={[
                {
                  key: "value",
                  label: "Earnings",
                  color: CHART_PRIMARY,
                  format: (value) => currency(value),
                },
              ]}
            />
          )}
        </Panel>

        <Panel title="Settlement">
          <dl className="space-y-2.5 text-sm">
            {[
              { label: "Confirmed earnings", value: summary.data?.confirmedEarnings ?? 0 },
              { label: "Unsettled earnings", value: summary.data?.unsettledEarnings ?? 0 },
              { label: "Pending withdrawals", value: summary.data?.pendingWithdrawals ?? 0, negative: true },
              { label: "Already withdrawn", value: summary.data?.alreadyWithdrawn ?? 0, negative: true },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd
                  data-numeric
                  className={cn("font-semibold", row.negative && "text-red-600")}
                >
                  {row.negative && row.value > 0 ? "− " : ""}
                  {currency(Math.abs(row.value), true)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3.5 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <span className="text-sm font-semibold">Available for payout</span>
            <span
              data-numeric
              className="text-base font-bold text-emerald-700 dark:text-emerald-300"
            >
              {currency(withdrawable, true)}
            </span>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4" title="Bank Account">
        <div className="flex items-start gap-3">
          <span className="icon-circle bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0 text-[0.8125rem]">
            <p className="text-[0.9375rem] font-bold">
              {profile?.bank.name ?? "Not added"}
            </p>
            <p className="text-muted-foreground">
              A/C No. {profile?.bank.accountMasked ?? "—"}
            </p>
            <p className="text-muted-foreground">IFSC: {profile?.bank.ifsc ?? "—"}</p>
            <p className="text-muted-foreground">UPI: {profile?.bank.upi ?? "—"}</p>
          </div>
        </div>
      </Panel>

      <div className="surface mt-4">
        <UnderlineTabs
          className="px-4"
          value={tab}
          onChange={setTab}
          options={[
            { label: "Payout History", value: "payouts", count: withdrawals.data?.length },
            { label: "Order Earnings", value: "earnings", count: earned.length },
          ]}
        />

        {tab === "payouts" ? (
          <DataTable
            className="rounded-none border-0"
            columns={payoutColumns}
            rows={withdrawals.data ?? []}
            rowKey={(row) => row.id}
            loading={withdrawals.isPending}
            emptyTitle="No payouts yet"
            emptyDescription="Request one from the button above once you have a balance."
          />
        ) : (
          <DataTable
            className="rounded-none border-0"
            columns={earningColumns}
            rows={earned}
            rowKey={(row) => row.id}
            emptyTitle="No delivered orders yet"
            emptyDescription="Earnings appear here as orders are completed."
          />
        )}
      </div>

      <PromoBanner
        className="mt-4"
        icon={TrendingUp}
        tone="violet"
        title="Grow Your Earnings!"
        description="Keep your menu updated and maintain good ratings to get more orders."
        actions={
          <Button asChild variant="outline">
            <Link href="/menu">Update your menu</Link>
          </Button>
        }
      />
    </>
  );
}

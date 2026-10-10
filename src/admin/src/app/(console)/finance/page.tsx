"use client";

import * as React from "react";
import {
  CreditCard,
  IndianRupee,
  Percent,
  Receipt,
  Scale,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel, PanelLink } from "@/components/common/panel";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryBarChart, DonutChart } from "@/components/charts/charts";
import {
  useDashboardAnalytics,
  useInvoices,
  usePayouts,
  useRevenueTrend,
  useTransactions,
} from "@/lib/queries";
import {
  currency,
  currencyCompact,
  number as formatNumber,
  titleCase,
} from "@/lib/format";
import { HUES } from "@/lib/accent";
import { cn } from "@/lib/utils";

export default function FinanceOverviewPage() {
  const analytics = useDashboardAnalytics();
  const trend = useRevenueTrend("30days");
  const payouts = usePayouts({ page: 1, limit: 50 });
  const transactions = useTransactions({ page: 1, limit: 50 });
  const invoices = useInvoices({ page: 1, limit: 50 });

  const revenueSeries = React.useMemo(() => {
    const { categories = [], revenue = [] } = trend.data ?? {};
    return categories.map((label, index) => ({
      label,
      revenue: revenue[index] ?? 0,
    }));
  }, [trend.data]);

  // Payout state is a small set of mutually exclusive buckets — a part-to-whole
  // read, so a donut is the right form here.
  const payoutBreakdown = React.useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const payout of payouts.data?.items ?? []) {
      const key = payout.status ?? "unknown";
      buckets[key] = (buckets[key] ?? 0) + (payout.netAmount ?? payout.amount ?? 0);
    }
    return Object.entries(buckets).map(([label, value]) => ({
      label: titleCase(label),
      value,
    }));
  }, [payouts.data]);

  const grossRevenue = analytics.data?.totalRevenue ?? 0;
  const pendingPayouts = (payouts.data?.items ?? [])
    .filter((payout) => (payout.status ?? "").toLowerCase() === "pending")
    .reduce((sum, payout) => sum + (payout.netAmount ?? payout.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Finance"
        description="Money in, money out — revenue, settlements, payouts and invoices."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Finance" }]}
      />

      <StatGrid columns={5}>
        <StatCard
          label="Gross revenue"
          value={currencyCompact(grossRevenue)}
          icon={IndianRupee}
          tone="emerald"
          loading={analytics.isPending}
          hint="Delivered orders, all time"
        />
        <StatCard
          label="Avg. order value"
          value={currency(analytics.data?.averageOrderValue)}
          icon={Receipt}
          tone="indigo"
          loading={analytics.isPending}
        />
        <StatCard
          label="Pending payouts"
          value={currencyCompact(pendingPayouts)}
          icon={Wallet}
          tone="amber"
          loading={payouts.isPending}
          hint="Awaiting release"
        />
        <StatCard
          label="Transactions"
          value={formatNumber(transactions.data?.total)}
          icon={CreditCard}
          tone="violet"
          loading={transactions.isPending}
        />
        <StatCard
          label="Invoices"
          value={formatNumber(invoices.data?.total)}
          icon={Receipt}
          tone="sky"
          loading={invoices.isPending}
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Revenue"
          description="Delivered-order revenue over the last 30 days."
        >
          {trend.isPending ? (
            <Skeleton className="h-[16.25rem] w-full" />
          ) : trend.isError ? (
            <ErrorState description={trend.error?.message} onRetry={() => trend.refetch()} />
          ) : revenueSeries.length === 0 ? (
            <EmptyState title="No revenue recorded in this window" />
          ) : (
            <CategoryBarChart
              data={revenueSeries}
              categoryKey="label"
              categoryLabel="Date"
              height={260}
              series={[
                { key: "revenue", label: "Revenue", format: (value) => currency(value) },
              ]}
            />
          )}
        </Panel>

        <Panel
          title="Payouts by state"
          description="Value sitting in each stage."
          action={<PanelLink href="/finance/payouts">Manage</PanelLink>}
        >
          {payouts.isPending ? (
            <Skeleton className="h-[16.25rem] w-full" />
          ) : payoutBreakdown.length === 0 ? (
            <EmptyState title="No payouts recorded" />
          ) : (
            <DonutChart
              slices={payoutBreakdown}
              centerLabel="Total"
              centerValue={currencyCompact(
                payoutBreakdown.reduce((sum, slice) => sum + slice.value, 0)
              )}
              format={(value) => currency(value)}
              height={260}
            />
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Transactions",
            description: "Every payment captured, refunded or failed.",
            href: "/finance/transactions",
            icon: CreditCard,
            hue: "sky" as const,
          },
          {
            title: "Settlements",
            description: "Vendor settlement cycles and their status.",
            href: "/finance/settlements",
            icon: Scale,
            hue: "emerald" as const,
          },
          {
            title: "Commission & fees",
            description: "What the platform earns per restaurant.",
            href: "/finance/commission",
            icon: Percent,
            hue: "violet" as const,
          },
          {
            title: "Invoices",
            description: "Issued invoices and outstanding balances.",
            href: "/finance/invoices",
            icon: Receipt,
            hue: "amber" as const,
          },
        ].map((card) => (
          <Panel key={card.href} className="justify-between">
            <div>
              <span className={cn("icon-tile shadow-sm", HUES[card.hue].tile)}>
                <card.icon className="size-[1.15rem]" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{card.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                {card.description}
              </p>
            </div>
            <div className="mt-4">
              <PanelLink href={card.href}>Open</PanelLink>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

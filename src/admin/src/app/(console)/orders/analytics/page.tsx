"use client";

import * as React from "react";
import { BadgeIndianRupee, Ban, Download, PackageCheck, ShoppingBag, Timer } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/common/panel";
import { CategoryBarChart, DonutChart, TrendChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrderAnalytics } from "@/lib/queries";
import { currency, number as formatNumber } from "@/lib/format";
import { downloadCsv, stampedName, toCsv } from "@/lib/export";

/**
 * Order analytics.
 *
 * Every figure here was fixed: 12,548 orders, a week in May 2024, a list of
 * restaurants nobody had ordered from. The screen reported the same numbers
 * whatever had actually happened, its date filter had nothing to filter, and
 * Export Report had no handler.
 *
 * It now asks the server for a date range and shows what came back. Sections
 * the data cannot support - a delivery-partner leaderboard, an hour-by-day
 * heatmap, written "insights" - are gone rather than filled with plausible
 * numbers, because a number on this screen is one somebody may act on.
 */

/** Sensible default: the last thirty days, ending today. */
function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

export default function OrderAnalyticsPage() {
  const [range, setRange] = React.useState(defaultRange);
  const analytics = useOrderAnalytics(range);
  const data = analytics.data;

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    setRange({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  };

  /**
   * The report, as the screen shows it.
   *
   * One file with each section under its own heading, so what an admin
   * downloads matches what they were looking at rather than being a second,
   * differently-shaped answer.
   */
  const exportReport = () => {
    if (!data) return;
    const t = data.totals;
    const sections: string[] = [
      toCsv(
        [
          { Metric: "Orders", Value: t.orders },
          { Metric: "Revenue", Value: t.revenue },
          { Metric: "Average order value", Value: t.averageOrderValue },
          { Metric: "Delivered", Value: t.delivered },
          { Metric: "Cancelled", Value: t.cancelled },
          { Metric: "Cancellation rate (%)", Value: t.cancellationRate },
          { Metric: "From", Value: range.from },
          { Metric: "To", Value: range.to },
        ],
        [
          { header: "Metric", value: (r) => r.Metric },
          { header: "Value", value: (r) => r.Value },
        ]
      ),
      "",
      "Daily",
      toCsv(data.daily, [
        { header: "Date", value: (r) => r.date },
        { header: "Orders", value: (r) => r.orders },
        { header: "Revenue", value: (r) => r.revenue },
      ]),
      "",
      "By status",
      toCsv(data.statusBreakdown, [
        { header: "Status", value: (r) => r.status },
        { header: "Orders", value: (r) => r.count },
        { header: "Share (%)", value: (r) => r.percentage },
      ]),
      "",
      "By payment method",
      toCsv(data.paymentBreakdown, [
        { header: "Method", value: (r) => r.method },
        { header: "Orders", value: (r) => r.count },
        { header: "Revenue", value: (r) => r.revenue },
      ]),
      "",
      "Top restaurants",
      toCsv(data.topRestaurants, [
        { header: "Restaurant", value: (r) => r.name },
        { header: "Orders", value: (r) => r.orders },
        { header: "Revenue", value: (r) => r.revenue },
      ]),
    ];

    if (data.cancellationReasons.length > 0) {
      sections.push(
        "",
        "Cancellation reasons",
        toCsv(data.cancellationReasons, [
          { header: "Reason", value: (r) => r.reason },
          { header: "Orders", value: (r) => r.count },
        ])
      );
    }

    downloadCsv(stampedName("reditoe-order-analytics"), sections.join("\n"));
  };

  return (
    <>
      <PageHeader
        title="Order Analytics"
        description="Counted from the orders placed in the period you choose."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Orders", href: "/orders" },
          { label: "Analytics" },
        ]}
        actions={
          <Button variant="outline" onClick={exportReport} disabled={!data}>
            <Download className="size-4" />
            Export Report
          </Button>
        }
      />

      {/* The filter. It used to be two dropdowns with one fixed option each. */}
      <div className="surface flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={range.from}
            max={range.to}
            onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={range.to}
            min={range.from}
            onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
          />
        </div>
        <div className="flex gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {data && (
          <p className="ml-auto text-xs text-muted-foreground">
            Compared with {dayLabel(data.range.previousFrom)} –{" "}
            {dayLabel(data.range.previousTo)}
          </p>
        )}
      </div>

      {analytics.isError && (
        <div className="surface mt-3">
          <ErrorState
            title="Couldn't load the analytics"
            description={analytics.error?.message}
            onRetry={() => analytics.refetch()}
          />
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Orders"
          value={formatNumber(data?.totals.orders ?? 0)}
          delta={data?.change.orders ?? undefined}
          compare="vs previous period"
          icon={ShoppingBag}
          tone="blue"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Revenue"
          value={currency(data?.totals.revenue ?? 0)}
          delta={data?.change.revenue ?? undefined}
          compare="vs previous period"
          icon={BadgeIndianRupee}
          tone="green"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Average order"
          value={currency(data?.totals.averageOrderValue ?? 0)}
          delta={data?.change.averageOrderValue ?? undefined}
          compare="vs previous period"
          icon={Timer}
          tone="purple"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Delivered"
          value={formatNumber(data?.totals.delivered ?? 0)}
          delta={data?.change.delivered ?? undefined}
          compare="vs previous period"
          icon={PackageCheck}
          tone="blue"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Cancelled"
          value={`${formatNumber(data?.totals.cancelled ?? 0)} (${
            data?.totals.cancellationRate ?? 0
          }%)`}
          delta={data?.change.cancelled ?? undefined}
          compare="vs previous period"
          icon={Ban}
          tone="red"
          loading={analytics.isPending}
        />
      </div>

      {analytics.isPending ? (
        <Skeleton className="mt-3 h-80 w-full" />
      ) : (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Panel title="Orders over time">
              {data && data.daily.length > 0 ? (
                <TrendChart
                  data={data.daily}
                  categoryKey="date"
                  categoryLabel="Date"
                  formatCategory={(value) => dayLabel(String(value))}
                  series={[{ key: "orders", label: "Orders" }]}
                  caption="Orders placed each day"
                />
              ) : (
                <EmptyState title="No orders in this period" />
              )}
            </Panel>

            <Panel title="Revenue over time">
              {data && data.daily.length > 0 ? (
                <TrendChart
                  data={data.daily}
                  categoryKey="date"
                  categoryLabel="Date"
                  formatCategory={(value) => dayLabel(String(value))}
                  series={[
                    { key: "revenue", label: "Revenue", format: (v) => currency(v) },
                  ]}
                  caption="Order value each day"
                />
              ) : (
                <EmptyState title="No revenue in this period" />
              )}
            </Panel>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Panel title="By status">
              {data && data.statusBreakdown.length > 0 ? (
                <DonutChart
                  slices={data.statusBreakdown.map((entry) => ({
                    label: entry.status,
                    value: entry.count,
                  }))}
                  centerLabel="Orders"
                  centerValue={formatNumber(data.totals.orders)}
                />
              ) : (
                <EmptyState title="Nothing to break down yet" />
              )}
            </Panel>

            <Panel title="By payment method">
              {data && data.paymentBreakdown.length > 0 ? (
                <CategoryBarChart
                  data={data.paymentBreakdown}
                  categoryKey="method"
                  categoryLabel="Method"
                  series={[{ key: "count", label: "Orders" }]}
                />
              ) : (
                <EmptyState title="No payments in this period" />
              )}
            </Panel>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Panel title="Top restaurants">
              {data && data.topRestaurants.length > 0 ? (
                <ul className="space-y-2">
                  {data.topRestaurants.map((entry, index) => (
                    <li
                      key={entry.restaurantId}
                      className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 last:border-0"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="truncate text-[0.8125rem] font-medium">
                          {entry.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-[0.8125rem]">
                        {formatNumber(entry.orders)} · {currency(entry.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No orders in this period" />
              )}
            </Panel>

            <Panel title="Why orders were cancelled">
              {data && data.cancellationReasons.length > 0 ? (
                <ul className="space-y-2">
                  {data.cancellationReasons.map((entry) => (
                    <li
                      key={entry.reason}
                      className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 last:border-0"
                    >
                      <span className="truncate text-[0.8125rem]">{entry.reason}</span>
                      <span className="shrink-0 text-[0.8125rem] font-medium">
                        {formatNumber(entry.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Nothing cancelled"
                  description="No orders were cancelled in this period."
                />
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

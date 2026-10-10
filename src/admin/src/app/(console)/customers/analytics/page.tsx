"use client";

import * as React from "react";
import Link from "next/link";
import {
  BadgeIndianRupee,
  Download,
  Repeat,
  UserCheck,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/common/panel";
import { DonutChart, RankedBarList, TrendChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerAnalytics } from "@/lib/queries";
import { currency, number as formatNumber } from "@/lib/format";
import { downloadCsv, stampedName, toCsv } from "@/lib/export";

/**
 * Customer analytics.
 *
 * Every figure here was fixed: 48,672 customers, a week in June 2024, five
 * named people nobody had ever served, retention percentages to two decimal
 * places for cohorts that never existed. The screen reported the same numbers
 * whatever the business had done, its two date dropdowns each held a single
 * hard-coded option, and Export Report had no handler at all.
 *
 * It now asks the server for a date range and shows what comes back. Sections
 * the data cannot support are absent rather than filled in: nothing records
 * which advert or search brought somebody in, so the acquisition split says
 * only what is known - who arrived through a referral, and who did not.
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

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

/** Blue wash keyed to the retention percentage, as the reference shades it. */
function cohortTint(value: number | null) {
  if (value === null) return undefined;
  if (value >= 50) return "#bfdbfe";
  if (value >= 25) return "#dbeafe";
  if (value >= 15) return "#eff6ff";
  return "#f8fafc";
}

export default function CustomerAnalyticsPage() {
  const [range, setRange] = React.useState(defaultRange);
  const analytics = useCustomerAnalytics(range);
  const data = analytics.data;

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    setRange({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  };

  /**
   * The report, as the screen shows it: one file, each section under its own
   * heading, so what is downloaded matches what was on screen.
   */
  const exportReport = () => {
    if (!data) return;
    const t = data.totals;
    const sections: string[] = [
      toCsv(
        [
          { Metric: "From", Value: range.from },
          { Metric: "To", Value: range.to },
          { Metric: "Total customers", Value: t.totalCustomers },
          { Metric: "New customers", Value: t.newCustomers },
          { Metric: "Active customers", Value: t.activeCustomers },
          { Metric: "Returning customers", Value: t.returningCustomers },
          { Metric: "Orders", Value: t.orders },
          { Metric: "Revenue", Value: t.revenue },
          { Metric: "Orders per active customer", Value: t.ordersPerCustomer },
          { Metric: "Revenue per active customer", Value: t.revenuePerCustomer },
          { Metric: "Average lifetime spend", Value: data.customerValue.averageLifetimeSpend },
        ],
        [
          { header: "Metric", value: (r) => r.Metric },
          { header: "Value", value: (r) => r.Value },
        ]
      ),
      "",
      "Growth",
      toCsv(data.growth, [
        { header: "Date", value: (r) => r.date },
        { header: "New customers", value: (r) => r.newCustomers },
        { header: "Total customers", value: (r) => r.totalCustomers },
      ]),
      "",
      "Segments",
      toCsv(
        [
          { Segment: "High value (over 5,000)", Customers: data.segments.high },
          { Segment: "Medium value (1,000 - 5,000)", Customers: data.segments.medium },
          { Segment: "Low value (under 1,000)", Customers: data.segments.low },
          { Segment: "At risk (no order in 30 days)", Customers: data.segments.atRisk },
          { Segment: "Never ordered", Customers: data.segments.neverOrdered },
        ],
        [
          { header: "Segment", value: (r) => r.Segment },
          { header: "Customers", value: (r) => r.Customers },
        ]
      ),
      "",
      "How customers arrived",
      toCsv(data.acquisition, [
        { header: "Source", value: (r) => r.label },
        { header: "Customers", value: (r) => r.value },
      ]),
      "",
      "Top customers",
      toCsv(data.topCustomers, [
        { header: "Customer", value: (r) => r.name },
        { header: "Phone", value: (r) => r.phone },
        { header: "Orders", value: (r) => r.orders },
        { header: "Spent", value: (r) => r.spent },
        { header: "Average order", value: (r) => r.averageOrderValue },
        { header: "Last order", value: (r) => r.lastOrderAt },
      ]),
    ];

    if (data.cities.length > 0) {
      sections.push(
        "",
        "Cities",
        toCsv(data.cities, [
          { header: "City", value: (r) => r.label },
          { header: "Customers", value: (r) => r.value },
        ])
      );
    }

    if (data.cohorts.length > 0) {
      sections.push(
        "",
        "Retention by signup week (%)",
        toCsv(data.cohorts, [
          { header: "Week beginning", value: (r) => r.week },
          { header: "Customers", value: (r) => r.size },
          ...data.cohortWindows.map((days, index) => ({
            header: `Day ${days}`,
            value: (r: (typeof data.cohorts)[number]) => r.retention[index] ?? "",
          })),
        ])
      );
    }

    downloadCsv(stampedName("reditoe-customer-analytics"), sections.join("\n"));
  };

  return (
    <>
      <PageHeader
        title="Customer Analytics"
        description="Counted from your customers and the orders they placed in the period you choose."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Customers", href: "/customers" },
          { label: "Customer Analytics" },
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
          label="Total Customers"
          value={formatNumber(data?.totals.totalCustomers ?? 0)}
          icon={UsersRound}
          tone="blue"
          loading={analytics.isPending}
        />
        <MetricCard
          label="New Customers"
          value={formatNumber(data?.totals.newCustomers ?? 0)}
          delta={data?.totals.change.newCustomers ?? undefined}
          compare="vs previous period"
          icon={UserRoundPlus}
          tone="green"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Returning Customers"
          value={formatNumber(data?.totals.returningCustomers ?? 0)}
          delta={data?.totals.change.returningCustomers ?? undefined}
          compare="vs previous period"
          icon={Repeat}
          tone="amber"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Active Customers"
          value={formatNumber(data?.totals.activeCustomers ?? 0)}
          delta={data?.totals.change.activeCustomers ?? undefined}
          compare="ordered in this period"
          icon={UserCheck}
          tone="purple"
          loading={analytics.isPending}
        />
        <MetricCard
          label="Revenue per Customer"
          value={currency(data?.totals.revenuePerCustomer ?? 0)}
          delta={data?.totals.change.revenue ?? undefined}
          compare="vs previous period"
          icon={BadgeIndianRupee}
          tone="blue"
          loading={analytics.isPending}
        />
      </div>

      {analytics.isPending ? (
        <Skeleton className="mt-3 h-80 w-full" />
      ) : (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Panel title="Customer growth">
              {data && data.growth.length > 0 ? (
                <TrendChart
                  data={data.growth}
                  categoryKey="date"
                  categoryLabel="Date"
                  formatCategory={(value) => dayLabel(String(value))}
                  series={[
                    { key: "totalCustomers", label: "Total customers" },
                    { key: "newCustomers", label: "New customers" },
                  ]}
                  caption="Signups each day, and the running total"
                />
              ) : (
                <EmptyState title="No customers in this period" />
              )}
            </Panel>

            <Panel title="How customers arrived">
              {data && data.acquisition.some((row) => row.value > 0) ? (
                <>
                  <DonutChart
                    slices={data.acquisition}
                    centerLabel="Customers"
                    centerValue={formatNumber(data.totals.totalCustomers)}
                  />
                  <p className="mt-2 text-xs text-muted-foreground text-pretty">
                    Only referrals are recorded. Nothing stores which advert or
                    search brought someone in, so the rest cannot be split
                    further without guessing.
                  </p>
                </>
              ) : (
                <EmptyState title="Nothing recorded yet" />
              )}
            </Panel>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Panel title="Customer segments">
              {data ? (
                <DonutChart
                  slices={[
                    { label: "High value ( > ₹5,000 )", value: data.segments.high, color: "#2563eb" },
                    { label: "Medium value ( ₹1,000 – ₹5,000 )", value: data.segments.medium, color: "#22a45d" },
                    { label: "Low value ( < ₹1,000 )", value: data.segments.low, color: "#f59e0b" },
                    { label: "Never ordered", value: data.segments.neverOrdered, color: "#94a3b8" },
                  ].filter((slice) => slice.value > 0)}
                  centerLabel="At risk"
                  centerValue={formatNumber(data.segments.atRisk)}
                />
              ) : null}
              {data && (
                <p className="mt-2 text-xs text-muted-foreground text-pretty">
                  By what each customer has spent in total. {formatNumber(data.segments.atRisk)}{" "}
                  {data.segments.atRisk === 1 ? "customer has" : "customers have"} not
                  ordered in 30 days.
                </p>
              )}
            </Panel>

            <Panel title="Where customers are">
              {data && data.cities.length > 0 ? (
                <RankedBarList items={data.cities} />
              ) : (
                <EmptyState
                  title="No cities recorded"
                  description="Customers have no city on their account yet."
                />
              )}
            </Panel>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Panel title="Customer value" className="lg:col-span-1">
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Average lifetime spend</dt>
                  <dd data-numeric className="text-2xl font-semibold tracking-tight">
                    {currency(data?.customerValue.averageLifetimeSpend ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Customers who have ordered</dt>
                  <dd data-numeric className="text-[0.9375rem] font-medium">
                    {formatNumber(data?.customerValue.customersWithOrders ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Total spent, all time</dt>
                  <dd data-numeric className="text-[0.9375rem] font-medium">
                    {currency(data?.customerValue.totalLifetimeSpend ?? 0)}
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Retention by signup week" className="lg:col-span-2">
              {data && data.cohorts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.8125rem]">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Week beginning</th>
                        <th className="pb-2 font-medium">Customers</th>
                        {data.cohortWindows.map((days) => (
                          <th key={days} className="pb-2 text-center font-medium">
                            Day {days}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.cohorts.map((row) => (
                        <tr key={row.week} className="border-t border-border">
                          <td className="py-2">{dateLabel(row.week)}</td>
                          <td data-numeric className="py-2">
                            {formatNumber(row.size)}
                          </td>
                          {row.retention.map((value, index) => (
                            <td
                              key={index}
                              data-numeric
                              className="py-2 text-center"
                              style={{ backgroundColor: cohortTint(value) }}
                            >
                              {/* A window that has not elapsed yet is blank,
                                  not zero: nobody could have returned in it. */}
                              {value === null ? "—" : `${value}%`}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Not enough history yet"
                  description="Retention needs at least one full week of signups."
                />
              )}
            </Panel>
          </div>

          <Panel title="Top customers" className="mt-3">
            {data && data.topCustomers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.8125rem]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Orders</th>
                      <th className="pb-2 font-medium">Spent</th>
                      <th className="pb-2 font-medium">Average order</th>
                      <th className="pb-2 font-medium">Last order</th>
                      <th className="pb-2 font-medium">Customer since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((customer) => (
                      <tr key={customer.id} className="border-t border-border">
                        <td className="py-2">
                          <Link
                            href={`/customers/${customer.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {customer.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {customer.phone || customer.email}
                          </span>
                        </td>
                        <td data-numeric className="py-2">
                          {formatNumber(customer.orders)}
                        </td>
                        <td data-numeric className="py-2">
                          {currency(customer.spent)}
                        </td>
                        <td data-numeric className="py-2">
                          {currency(customer.averageOrderValue)}
                        </td>
                        <td className="py-2">{dateLabel(customer.lastOrderAt)}</td>
                        <td className="py-2">{dateLabel(customer.customerSince)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No orders in this period" />
            )}
          </Panel>
        </>
      )}
    </>
  );
}

"use client";

import * as React from "react";
import {
  CircleCheck,
  CircleX,
  Download,
  IndianRupee,
  MoveDownRight,
  MoveUpRight,
  Receipt,
  Rocket,
  ShoppingBag,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageActions } from "@/components/common/page-actions";
import { DateRangeMenu, PeriodSelect } from "@/components/common/list-controls";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel, PanelLink } from "@/components/common/panel";
import { FixtureNote } from "@/components/common/fixture-note";
import { FoodThumb } from "@/components/common/food-thumb";
import { PromoBanner } from "@/components/common/promo-banner";
import { TrendChart, DonutChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { CHART_PRIMARY, TONES } from "@/lib/accent";
import { currency, number as formatNumber, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadCsv, stampedName, toCsv } from "@/lib/csv";
import {
  inRange,
  periodLabel,
  rangeLabel,
  type DateRange,
  type Period,
} from "@/lib/date-range";
import {
  customerInsights,
  revenueByCategory,
  revenueByPayment,
} from "@/lib/data";
import { STAGE_LABEL, type OrderStage } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/** Signed growth, coloured — the cell the reference repeats down every table. */
function Growth({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold",
        up ? "text-emerald-600" : "text-red-600"
      )}
    >
      {up ? <MoveUpRight className="size-3" /> : <MoveDownRight className="size-3" />}
      {percent(Math.abs(value))}
    </span>
  );
}

const STAGE_COLORS: Record<OrderStage, string> = {
  new: "#22a45d",
  preparing: "#f59e0b",
  ready: "#eab308",
  out_for_delivery: "#6d28d9",
  completed: "#2563eb",
  cancelled: "#e8112d",
};

export default function InsightsPage() {
  const { orders, stats, stageCounts, today } = useVendor();
  const [range, setRange] = React.useState<DateRange>("all");
  const [period, setPeriod] = React.useState<Period>("daily");

  const scoped = React.useMemo(
    () => orders.filter((order) => inRange(order.placedAt, range)),
    [orders, range]
  );

  const scopedStageCounts = React.useMemo(() => {
    const counts = { ...stageCounts };
    for (const key of Object.keys(counts) as OrderStage[]) counts[key] = 0;
    for (const order of scoped) counts[order.stage] += 1;
    return counts;
  }, [scoped, stageCounts]);

  const series =
    period === "weekly"
      ? (stats?.weekly ?? [])
      : period === "monthly"
        ? (stats?.monthly ?? [])
        : (stats?.daily ?? []);

  /** Orders by status, straight off the board. */
  const ordersByStatus = React.useMemo(
    () =>
      (Object.keys(scopedStageCounts) as OrderStage[])
        .map((stage) => ({
          label: STAGE_LABEL[stage],
          value: scopedStageCounts[stage],
          color: STAGE_COLORS[stage],
        }))
        .filter((slice) => slice.value > 0),
    [scopedStageCounts]
  );

  /** Revenue by payment method — real, because every order carries one. */
  const byPayment = React.useMemo(() => {
    const billed = scoped.filter((order) => order.stage !== "cancelled");
    const online = billed
      .filter((o) => o.payment === "Online")
      .reduce((sum, o) => sum + o.total, 0);
    const cod = billed
      .filter((o) => o.payment === "COD")
      .reduce((sum, o) => sum + o.total, 0);
    return [
      { label: "Online", value: online, color: "#2563eb" },
      { label: "COD", value: cod, color: "#22a45d" },
    ].filter((slice) => slice.value > 0);
  }, [scoped]);

  /** Top items, counted from the order lines. */
  const sellers = React.useMemo(() => {
    const tally = new Map<
      string,
      { name: string; image?: string; orders: number; qty: number; revenue: number }
    >();
    for (const order of scoped) {
      if (order.stage === "cancelled") continue;
      for (const line of order.lines) {
        const row = tally.get(line.name) ?? {
          name: line.name,
          image: line.image,
          orders: 0,
          qty: 0,
          revenue: 0,
        };
        row.orders += 1;
        row.qty += line.quantity;
        row.revenue += line.price * line.quantity;
        tally.set(line.name, row);
      }
    }
    return [...tally.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [scoped]);

  const cancellationRate =
    scoped.length > 0 ? (scopedStageCounts.cancelled / scoped.length) * 100 : 0;

  /** The report is built from the rows on screen, not from a server export. */
  const exportReport = () => {
    downloadCsv(
      stampedName("sales-report"),
      toCsv(
        [
          { header: "Item", value: (r: (typeof sellers)[number]) => r.name },
          { header: "Orders", value: (r: (typeof sellers)[number]) => r.orders },
          { header: "Quantity sold", value: (r: (typeof sellers)[number]) => r.qty },
          { header: "Revenue", value: (r: (typeof sellers)[number]) => r.revenue },
        ],
        sellers
      )
    );
    toast.success("Report downloaded");
  };

  return (
    <>
      <PageActions>
        <DateRangeMenu value={range} onChange={setRange} />
        <Button
          variant="outline"
          onClick={exportReport}
          disabled={sellers.length === 0}
        >
          <Download className="size-4" />
          Export Report
        </Button>
      </PageActions>

      <StatGrid columns={6}>
        <StatCard
          label="Total Sales"
          value={currency(stats?.totalSales ?? 0, true)}
          icon={IndianRupee}
          tone="green"
          hint="Delivered orders"
        />
        <StatCard
          label="Total Orders"
          value={formatNumber(scoped.length)}
          icon={ShoppingBag}
          tone="blue"
          hint="On the board now"
        />
        <StatCard
          label="Average Order Value"
          value={currency(today.averageOrder, true)}
          icon={Receipt}
          tone="amber"
          hint="Excluding cancelled"
        />
        <StatCard
          label="Items Sold"
          value={formatNumber(today.itemsSold)}
          icon={UserPlus}
          tone="violet"
          hint="Across billed orders"
        />
        <StatCard
          label="Completed Orders"
          value={formatNumber(stats?.completedOrderCount ?? 0)}
          icon={CircleCheck}
          tone="green"
          hint="Delivered to customers"
        />
        <StatCard
          label="Cancellation Rate"
          value={`${cancellationRate.toFixed(1)}%`}
          icon={CircleX}
          tone="red"
          hint={`${scopedStageCounts.cancelled} cancelled`}
        />
      </StatGrid>

      <Panel
        className="mt-4"
        title="Revenue Overview"
        description={`${periodLabel(period)}, from the platform`}
        action={<PeriodSelect value={period} onChange={setPeriod} />}
      >
        {series.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No sales recorded this week.
          </p>
        ) : (
          <TrendChart
            data={series}
            categoryKey="label"
            categoryLabel="Day"
            height={260}
            series={[
              {
                key: "value",
                label: "Revenue",
                color: CHART_PRIMARY,
                format: (value) => currency(value),
              },
            ]}
          />
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Orders by Status">
          {ordersByStatus.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No orders yet.
            </p>
          ) : (
            <DonutChart
              slices={ordersByStatus}
              centerLabel="Total Orders"
              centerValue={formatNumber(scoped.length)}
              height={240}
              format={(value) => formatNumber(value)}
            />
          )}
        </Panel>
        <Panel title="Revenue by Payment Method">
          {byPayment.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No billed orders yet.
            </p>
          ) : (
            <DonutChart
              slices={byPayment}
              centerLabel="Order Value"
              centerValue={currency(
                byPayment.reduce((sum, slice) => sum + slice.value, 0)
              )}
              height={240}
              format={(value) => currency(value)}
            />
          )}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Top Selling Items"
        description={`By revenue · ${rangeLabel(range)}`}
        action={<PanelLink href="/menu">View All</PanelLink>}
        flush
        divided
      >
        {sellers.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nothing sold yet.
          </p>
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-[0.75rem] font-semibold text-muted-foreground">
                  <th scope="col" className="w-10 px-4 py-3 text-left">
                    #
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Item Name
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Orders
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Quantity Sold
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((entry, index) => (
                  <tr key={entry.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FoodThumb
                          src={entry.image}
                          name={entry.name}
                          size={32}
                          rounded="rounded-md"
                        />
                        <span className="truncate font-medium">{entry.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.orders}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{entry.qty}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {currency(entry.revenue, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Everything below needs aggregates this backend does not compute. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue by Category">
          <FixtureNote>
            Sample data — `/vendor/stats` returns totals only, with no category
            breakdown behind it.
          </FixtureNote>
          <DonutChart
            className="mt-2"
            slices={revenueByCategory}
            centerLabel="Total Revenue"
            centerValue={currency(
              revenueByCategory.reduce((sum, slice) => sum + slice.value, 0)
            )}
            height={230}
            format={(value) => currency(value)}
          />
        </Panel>

        <Panel title="Customer Insights">
          <FixtureNote>
            Sample data — no customer-cohort endpoint on this backend.
          </FixtureNote>
          <ul className="mt-2 divide-y divide-border">
            {customerInsights.map((row, index) => {
              const Icon = [Users, Users, UserPlus, Star][index] ?? Users;
              return (
                <li
                  key={row.label}
                  className="flex items-center gap-3 py-3 last:pb-0"
                >
                  <span className={cn("icon-circle size-10", TONES[row.tone].circle)}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] text-muted-foreground">
                      {row.label}
                    </p>
                    <p className="truncate text-[0.9375rem] font-bold">{row.value}</p>
                  </div>
                  <span className="shrink-0">
                    <Growth value={row.delta} />
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-4" title="Revenue by Payment Method (platform-wide)">
        <FixtureNote>
          Sample data. The live split from your own orders is charted above.
        </FixtureNote>
        <DonutChart
          className="mt-2"
          slices={revenueByPayment}
          centerLabel="Total Revenue"
          centerValue={currency(
            revenueByPayment.reduce((sum, slice) => sum + slice.value, 0)
          )}
          height={230}
          format={(value) => currency(value)}
        />
      </Panel>

      <PromoBanner
        className="mt-4"
        icon={Rocket}
        tone="red"
        title="Unlock the full potential of your business!"
        description="Use data-driven insights to make better decisions and increase your revenue."
        actions={
          <Button onClick={exportReport} disabled={sellers.length === 0}>
            <Download className="size-4" />
            Download Detailed Report
          </Button>
        }
      />
    </>
  );
}
